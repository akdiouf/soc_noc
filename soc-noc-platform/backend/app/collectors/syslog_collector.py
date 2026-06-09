"""
Syslog Collector (UDP/TCP)
Reçoit les logs syslog des équipements réseau, serveurs, firewalls
Les transmet à Kafka pour traitement par Logstash/ELK
"""
import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Callable
from aiokafka import AIOKafkaProducer
import json
from app.core.config import settings

logger = logging.getLogger(__name__)

# Niveaux de sévérité Syslog (RFC 5424)
SYSLOG_SEVERITY = {
    0: "emergency",
    1: "alert",
    2: "critical",
    3: "error",
    4: "warning",
    5: "notice",
    6: "info",
    7: "debug",
}

SYSLOG_FACILITY = {
    0: "kern", 1: "user", 2: "mail", 3: "daemon",
    4: "auth", 5: "syslog", 6: "lpr", 7: "news",
    8: "uucp", 9: "cron", 10: "authpriv", 11: "ftp",
    16: "local0", 17: "local1", 18: "local2", 19: "local3",
    20: "local4", 21: "local5", 22: "local6", 23: "local7",
}

# Pattern RFC 3164 (format BSD legacy — équipements Cisco, routeurs)
SYSLOG_RFC3164 = re.compile(
    r"<(\d+)>"
    r"(\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+"
    r"(\S+)\s+"
    r"(\S+?)(?:\[(\d+)\])?:\s+"
    r"(.*)"
)

# Pattern RFC 5424 (format moderne)
SYSLOG_RFC5424 = re.compile(
    r"<(\d+)>(\d+)\s+"
    r"(\S+)\s+"          # timestamp
    r"(\S+)\s+"          # hostname
    r"(\S+)\s+"          # app-name
    r"(\S+)\s+"          # procid
    r"(\S+)\s+"          # msgid
    r"(\S+)\s+"          # structured-data
    r"(.*)"              # msg
)

# Règles de détection de sécurité dans les logs
SECURITY_PATTERNS = [
    (re.compile(r"(authentication failure|failed login|invalid user)", re.I), "auth_failure", "warning"),
    (re.compile(r"(brute.?force|multiple failed|too many failures)", re.I), "brute_force", "critical"),
    (re.compile(r"(port scan|nmap|masscan)", re.I), "port_scan", "warning"),
    (re.compile(r"(sudo|su -|privilege escalation)", re.I), "privilege_escalation", "warning"),
    (re.compile(r"(config changed|configuration modified)", re.I), "config_change", "warning"),
    (re.compile(r"(interface.*down|link.*down|neighbor.*down)", re.I), "link_down", "critical"),
    (re.compile(r"(bgp.*down|ospf.*neighbor.*down)", re.I), "routing_down", "critical"),
    (re.compile(r"(stp.*topology|spanning-tree)", re.I), "stp_event", "warning"),
    (re.compile(r"(temperature|thermal|overheat)", re.I), "thermal_event", "warning"),
    (re.compile(r"(power fail|ups alarm|battery)", re.I), "power_event", "critical"),
    (re.compile(r"(firewall.*block|access.*denied|acl.*deny)", re.I), "acl_deny", "info"),
    (re.compile(r"(malware|virus|trojan|ransomware)", re.I), "malware", "emergency"),
    (re.compile(r"(access.*granted|door.*open|badge)", re.I), "access_event", "info"),
]


@dataclass
class SyslogMessage:
    facility: int
    severity: int
    facility_name: str
    severity_name: str
    timestamp: datetime
    hostname: str
    program: str
    pid: Optional[int]
    message: str
    raw: str
    source_ip: str
    security_flags: list[str] = field(default_factory=list)


def parse_syslog(raw: str, source_ip: str) -> Optional[SyslogMessage]:
    raw = raw.strip()

    match = SYSLOG_RFC5424.match(raw) or SYSLOG_RFC3164.match(raw)
    if not match:
        if raw.startswith("<"):
            try:
                priority_end = raw.index(">")
                priority = int(raw[1:priority_end])
                facility = priority >> 3
                severity = priority & 7
                return SyslogMessage(
                    facility=facility,
                    severity=severity,
                    facility_name=SYSLOG_FACILITY.get(facility, "unknown"),
                    severity_name=SYSLOG_SEVERITY.get(severity, "unknown"),
                    timestamp=datetime.utcnow(),
                    hostname=source_ip,
                    program="unknown",
                    pid=None,
                    message=raw[priority_end + 1:].strip(),
                    raw=raw,
                    source_ip=source_ip,
                )
            except (ValueError, IndexError):
                pass
        return None

    groups = match.groups()
    priority = int(groups[0])
    facility = priority >> 3
    severity = priority & 7

    msg = SyslogMessage(
        facility=facility,
        severity=severity,
        facility_name=SYSLOG_FACILITY.get(facility, "unknown"),
        severity_name=SYSLOG_SEVERITY.get(severity, "unknown"),
        timestamp=datetime.utcnow(),
        hostname=groups[3] if len(groups) > 3 else source_ip,
        program=groups[4] if len(groups) > 4 else "unknown",
        pid=int(groups[5]) if len(groups) > 5 and groups[5] and groups[5].isdigit() else None,
        message=groups[-1],
        raw=raw,
        source_ip=source_ip,
    )

    # Détection patterns de sécurité
    for pattern, flag, _ in SECURITY_PATTERNS:
        if pattern.search(msg.message):
            msg.security_flags.append(flag)

    return msg


class SyslogUDPProtocol(asyncio.DatagramProtocol):
    def __init__(self, callback: Callable):
        self.callback = callback

    def datagram_received(self, data: bytes, addr: tuple):
        try:
            raw = data.decode("utf-8", errors="replace")
            source_ip = addr[0]
            msg = parse_syslog(raw, source_ip)
            if msg:
                asyncio.ensure_future(self.callback(msg))
        except Exception as e:
            logger.error(f"Syslog UDP parse error from {addr}: {e}")

    def error_received(self, exc):
        logger.error(f"Syslog UDP error: {exc}")


class SyslogTCPProtocol(asyncio.Protocol):
    def __init__(self, callback: Callable):
        self.callback = callback
        self.buffer = b""
        self.transport = None
        self.peer = None

    def connection_made(self, transport):
        self.transport = transport
        self.peer = transport.get_extra_info("peername")

    def data_received(self, data: bytes):
        self.buffer += data
        lines = self.buffer.split(b"\n")
        self.buffer = lines[-1]
        for line in lines[:-1]:
            if line:
                raw = line.decode("utf-8", errors="replace").strip()
                msg = parse_syslog(raw, self.peer[0])
                if msg:
                    asyncio.ensure_future(self.callback(msg))

    def connection_lost(self, exc):
        if self.buffer:
            raw = self.buffer.decode("utf-8", errors="replace").strip()
            msg = parse_syslog(raw, self.peer[0])
            if msg:
                asyncio.ensure_future(self.callback(msg))


class SyslogServer:
    def __init__(self, udp_port: int = 514, tcp_port: int = 601):
        self.udp_port = udp_port
        self.tcp_port = tcp_port
        self._producer: Optional[AIOKafkaProducer] = None
        self._udp_transport = None
        self._tcp_server = None

    async def start(self):
        self._producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode(),
        )
        await self._producer.start()

        loop = asyncio.get_event_loop()

        # UDP listener
        self._udp_transport, _ = await loop.create_datagram_endpoint(
            lambda: SyslogUDPProtocol(self._on_message),
            local_addr=("0.0.0.0", self.udp_port),
        )
        logger.info(f"Syslog UDP listener started on port {self.udp_port}")

        # TCP listener
        self._tcp_server = await loop.create_server(
            lambda: SyslogTCPProtocol(self._on_message),
            "0.0.0.0",
            self.tcp_port,
        )
        logger.info(f"Syslog TCP listener started on port {self.tcp_port}")

    async def _on_message(self, msg: SyslogMessage):
        payload = {
            "facility": msg.facility,
            "facility_name": msg.facility_name,
            "severity": msg.severity,
            "severity_name": msg.severity_name,
            "timestamp": msg.timestamp.isoformat(),
            "hostname": msg.hostname,
            "program": msg.program,
            "pid": msg.pid,
            "message": msg.message,
            "source_ip": msg.source_ip,
            "security_flags": msg.security_flags,
        }

        topic = settings.KAFKA_TOPIC_SECURITY if msg.security_flags else settings.KAFKA_TOPIC_SYSLOG

        try:
            await self._producer.send_and_wait(
                topic,
                value=payload,
                key=msg.source_ip.encode(),
            )
        except Exception as e:
            logger.error(f"Kafka send error: {e}")

    async def stop(self):
        if self._udp_transport:
            self._udp_transport.close()
        if self._tcp_server:
            self._tcp_server.close()
        if self._producer:
            await self._producer.stop()
