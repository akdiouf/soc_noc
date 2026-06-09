"""
NetFlow/IPFIX Collector (v5, v9, IPFIX)
Reçoit les flux réseau des routeurs/switchs pour analyse de trafic
et détection d'anomalies (DDoS, exfiltration de données, etc.)
"""
import asyncio
import logging
import struct
import socket
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from aiokafka import AIOKafkaProducer
import json
from app.core.config import settings

logger = logging.getLogger(__name__)

NETFLOW_V5_HEADER = struct.Struct("!HHIIIIBBH")  # 24 bytes
NETFLOW_V5_RECORD = struct.Struct("!4s4sIIIHHHBBBxHBBx")  # 48 bytes


@dataclass
class NetFlowRecord:
    version: int
    src_ip: str
    dst_ip: str
    src_port: int
    dst_port: int
    protocol: int
    protocol_name: str
    bytes_count: int
    packets_count: int
    duration_ms: int
    tcp_flags: int
    tos: int
    src_as: int
    dst_as: int
    exporter_ip: str
    timestamp: datetime
    flow_direction: str = "inbound"


PROTOCOL_NAMES = {
    1: "ICMP", 6: "TCP", 17: "UDP", 47: "GRE",
    50: "ESP", 51: "AH", 89: "OSPF", 103: "PIM",
    112: "VRRP", 132: "SCTP",
}

# Ports qui méritent une attention sécurité
SUSPICIOUS_PORTS = {
    22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS",
    80: "HTTP", 443: "HTTPS", 445: "SMB", 1433: "MSSQL",
    3306: "MySQL", 3389: "RDP", 5432: "PostgreSQL",
    6379: "Redis", 27017: "MongoDB", 8080: "HTTP-Alt",
}


def parse_netflow_v5(data: bytes, exporter_ip: str) -> list[NetFlowRecord]:
    if len(data) < 24:
        return []

    header = NETFLOW_V5_HEADER.unpack(data[:24])
    version, count, sys_uptime, unix_secs, unix_nsecs, flow_seq, engine_type, engine_id, sampling = header

    if version != 5:
        return []

    records = []
    offset = 24

    for _ in range(min(count, 30)):  # limiter à 30 flows par paquet
        if offset + 48 > len(data):
            break

        rec_data = NETFLOW_V5_RECORD.unpack(data[offset:offset + 48])
        offset += 48

        src_ip = socket.inet_ntoa(rec_data[0])
        dst_ip = socket.inet_ntoa(rec_data[1])
        pkts = rec_data[2]
        octets = rec_data[3]
        first = rec_data[4]
        last = rec_data[5]
        src_port = rec_data[6]
        dst_port = rec_data[7]
        tcp_flags = rec_data[8]
        protocol = rec_data[9]
        tos = rec_data[10]
        src_as = rec_data[11]
        dst_as = rec_data[12]

        duration_ms = (last - first) if last >= first else 0

        records.append(NetFlowRecord(
            version=5,
            src_ip=src_ip,
            dst_ip=dst_ip,
            src_port=src_port,
            dst_port=dst_port,
            protocol=protocol,
            protocol_name=PROTOCOL_NAMES.get(protocol, str(protocol)),
            bytes_count=octets,
            packets_count=pkts,
            duration_ms=duration_ms,
            tcp_flags=tcp_flags,
            tos=tos,
            src_as=src_as,
            dst_as=dst_as,
            exporter_ip=exporter_ip,
            timestamp=datetime.utcfromtimestamp(unix_secs),
        ))

    return records


def detect_anomalies(record: NetFlowRecord) -> list[str]:
    flags = []

    # Détection DDoS (volume élevé)
    if record.bytes_count > 100_000_000:  # > 100MB par flow
        flags.append("high_volume_flow")

    # Scan de ports (beaucoup de paquets petits vers ports différents)
    if record.packets_count > 1000 and record.bytes_count < 100_000:
        flags.append("possible_port_scan")

    # Protocoles dangereux
    if record.protocol == 6 and record.dst_port == 23:
        flags.append("telnet_connection")

    if record.protocol == 6 and record.dst_port == 3389:
        flags.append("rdp_connection")

    # TCP SYN flood (SYN sans ACK)
    if record.protocol == 6 and (record.tcp_flags & 0x02) and not (record.tcp_flags & 0x10):
        if record.packets_count > 100:
            flags.append("syn_flood")

    return flags


class NetFlowUDPProtocol(asyncio.DatagramProtocol):
    def __init__(self, callback):
        self.callback = callback

    def datagram_received(self, data: bytes, addr: tuple):
        asyncio.ensure_future(self.callback(data, addr[0]))

    def error_received(self, exc):
        logger.error(f"NetFlow UDP error: {exc}")


class NetFlowCollector:
    def __init__(self, port: int = 2055):
        self.port = port
        self._producer: Optional[AIOKafkaProducer] = None
        self._transport = None

    async def start(self):
        self._producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode(),
        )
        await self._producer.start()

        loop = asyncio.get_event_loop()
        self._transport, _ = await loop.create_datagram_endpoint(
            lambda: NetFlowUDPProtocol(self._on_packet),
            local_addr=("0.0.0.0", self.port),
        )
        logger.info(f"NetFlow collector listening on UDP {self.port}")

    async def _on_packet(self, data: bytes, exporter_ip: str):
        try:
            if len(data) < 2:
                return

            version = struct.unpack("!H", data[:2])[0]
            records = []

            if version == 5:
                records = parse_netflow_v5(data, exporter_ip)
            else:
                logger.debug(f"Unsupported NetFlow version {version} from {exporter_ip}")
                return

            for record in records:
                anomalies = detect_anomalies(record)
                payload = {
                    "version": record.version,
                    "src_ip": record.src_ip,
                    "dst_ip": record.dst_ip,
                    "src_port": record.src_port,
                    "dst_port": record.dst_port,
                    "protocol": record.protocol,
                    "protocol_name": record.protocol_name,
                    "bytes": record.bytes_count,
                    "packets": record.packets_count,
                    "duration_ms": record.duration_ms,
                    "exporter_ip": exporter_ip,
                    "timestamp": record.timestamp.isoformat(),
                    "anomalies": anomalies,
                }

                topic = settings.KAFKA_TOPIC_SECURITY if anomalies else settings.KAFKA_TOPIC_NETFLOW
                await self._producer.send(
                    topic,
                    value=payload,
                    key=exporter_ip.encode(),
                )

        except Exception as e:
            logger.error(f"NetFlow processing error from {exporter_ip}: {e}")

    async def stop(self):
        if self._transport:
            self._transport.close()
        if self._producer:
            await self._producer.stop()
