"""
SNMP Collector — supporte SNMPv1, v2c, v3
Utilisé pour : routeurs, switchs, firewalls, UPS (APC, Eaton), PDU, serveurs
"""
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional
from pysnmp.hlapi.asyncio import (
    CommunityData, UsmUserData, UdpTransportTarget,
    ContextData, ObjectType, ObjectIdentity,
    getCmd, nextCmd, bulkCmd, SnmpEngine,
    usmHMACMD5AuthProtocol, usmHMACSHAAuthProtocol,
    usmHMAC128SHA224AuthProtocol, usmHMAC192SHA256AuthProtocol,
    usmDESPrivProtocol, usm3DESEDEPrivProtocol,
    usmAesCfb128Protocol, usmAesCfb192Protocol, usmAesCfb256Protocol,
)
from app.core.config import settings

logger = logging.getLogger(__name__)

# OIDs standards
OID_SYSNAME = "1.3.6.1.2.1.1.5.0"
OID_SYSDESCR = "1.3.6.1.2.1.1.1.0"
OID_SYSUPTIME = "1.3.6.1.2.1.1.3.0"
OID_SYSLOCATION = "1.3.6.1.2.1.1.6.0"
OID_IF_TABLE = "1.3.6.1.2.1.2.2"
OID_IF_DESC = "1.3.6.1.2.1.2.2.1.2"
OID_IF_SPEED = "1.3.6.1.2.1.2.2.1.5"
OID_IF_IN_OCTETS = "1.3.6.1.2.1.2.2.1.10"
OID_IF_OUT_OCTETS = "1.3.6.1.2.1.2.2.1.16"
OID_IF_IN_ERRORS = "1.3.6.1.2.1.2.2.1.14"
OID_IF_OUT_ERRORS = "1.3.6.1.2.1.2.2.1.20"
OID_IF_OPER_STATUS = "1.3.6.1.2.1.2.2.1.8"
OID_IF_ADMIN_STATUS = "1.3.6.1.2.1.2.2.1.7"

# CPU/Memory (HOST-RESOURCES-MIB)
OID_HR_PROCESSOR_LOAD = "1.3.6.1.2.1.25.3.3.1.2"
OID_HR_STORAGE_TABLE = "1.3.6.1.2.1.25.2.3"

# UPS (APC / RFC 1628)
OID_UPS_BATTERY_STATUS = "1.3.6.1.2.1.33.1.2.1.0"
OID_UPS_BATTERY_CHARGE = "1.3.6.1.2.1.33.1.2.4.0"
OID_UPS_BATTERY_VOLTAGE = "1.3.6.1.2.1.33.1.2.5.0"
OID_UPS_BATTERY_TEMP = "1.3.6.1.2.1.33.1.2.7.0"
OID_UPS_RUNTIME_REMAINING = "1.3.6.1.2.1.33.1.2.3.0"
OID_UPS_INPUT_VOLTAGE = "1.3.6.1.2.1.33.1.3.3.1.3"
OID_UPS_OUTPUT_VOLTAGE = "1.3.6.1.2.1.33.1.4.4.1.2"
OID_UPS_OUTPUT_LOAD = "1.3.6.1.2.1.33.1.4.4.1.5"
OID_UPS_OUTPUT_POWER = "1.3.6.1.2.1.33.1.4.4.1.4"

# APC spécifique
OID_APC_TEMP_AMBIENT = "1.3.6.1.4.1.318.1.1.10.2.3.2.1.4"
OID_APC_HUMIDITY = "1.3.6.1.4.1.318.1.1.10.2.3.2.1.6"

AUTH_PROTOCOLS = {
    "MD5": usmHMACMD5AuthProtocol,
    "SHA": usmHMACSHAAuthProtocol,
    "SHA224": usmHMAC128SHA224AuthProtocol,
    "SHA256": usmHMAC192SHA256AuthProtocol,
}

PRIV_PROTOCOLS = {
    "DES": usmDESPrivProtocol,
    "3DES": usm3DESEDEPrivProtocol,
    "AES": usmAesCfb128Protocol,
    "AES192": usmAesCfb192Protocol,
    "AES256": usmAesCfb256Protocol,
}


@dataclass
class SNMPConfig:
    ip: str
    port: int = 161
    version: str = "v2c"
    community: str = "public"
    # SNMPv3
    username: str = ""
    auth_protocol: str = "SHA"
    auth_password: str = ""
    priv_protocol: str = "AES"
    priv_password: str = ""
    timeout: int = 5
    retries: int = 2


@dataclass
class SNMPResult:
    oid: str
    value: Any
    timestamp: datetime = field(default_factory=datetime.utcnow)
    error: Optional[str] = None


class SNMPCollector:
    def __init__(self, config: SNMPConfig):
        self.config = config
        self.engine = SnmpEngine()

    def _get_auth_data(self) -> CommunityData | UsmUserData:
        if self.config.version in ("v1", "v2c"):
            mp_model = 0 if self.config.version == "v1" else 1
            return CommunityData(self.config.community, mpModel=mp_model)
        # SNMPv3
        auth_proto = AUTH_PROTOCOLS.get(self.config.auth_protocol, usmHMACSHAAuthProtocol)
        priv_proto = PRIV_PROTOCOLS.get(self.config.priv_protocol, usmAesCfb128Protocol)
        return UsmUserData(
            self.config.username,
            authKey=self.config.auth_password,
            privKey=self.config.priv_password,
            authProtocol=auth_proto,
            privProtocol=priv_proto,
        )

    def _get_transport(self) -> UdpTransportTarget:
        return UdpTransportTarget(
            (self.config.ip, self.config.port),
            timeout=self.config.timeout,
            retries=self.config.retries,
        )

    async def get(self, *oids: str) -> list[SNMPResult]:
        results = []
        auth_data = self._get_auth_data()
        transport = self._get_transport()

        object_types = [ObjectType(ObjectIdentity(oid)) for oid in oids]

        error_indication, error_status, error_index, var_binds = await getCmd(
            self.engine,
            auth_data,
            transport,
            ContextData(),
            *object_types,
        )

        if error_indication:
            logger.error(f"SNMP GET error {self.config.ip}: {error_indication}")
            return [SNMPResult(oid=o, value=None, error=str(error_indication)) for o in oids]

        if error_status:
            logger.error(f"SNMP error status {self.config.ip}: {error_status} at {error_index}")

        for var_bind in var_binds:
            oid, val = var_bind
            results.append(SNMPResult(oid=str(oid), value=val.prettyPrint()))

        return results

    async def walk(self, oid: str) -> list[SNMPResult]:
        results = []
        auth_data = self._get_auth_data()
        transport = self._get_transport()

        async for (error_indication, error_status, error_index, var_binds) in nextCmd(
            self.engine,
            auth_data,
            transport,
            ContextData(),
            ObjectType(ObjectIdentity(oid)),
            lexicographicMode=False,
        ):
            if error_indication:
                logger.error(f"SNMP WALK error {self.config.ip}: {error_indication}")
                break
            for var_bind in var_binds:
                oid_str, val = var_bind
                results.append(SNMPResult(oid=str(oid_str), value=val.prettyPrint()))

        return results

    async def collect_system_info(self) -> dict:
        results = await self.get(OID_SYSNAME, OID_SYSDESCR, OID_SYSUPTIME, OID_SYSLOCATION)
        return {
            "sysname": results[0].value if results else None,
            "sysdescr": results[1].value if len(results) > 1 else None,
            "sysuptime": results[2].value if len(results) > 2 else None,
            "syslocation": results[3].value if len(results) > 3 else None,
        }

    async def collect_interfaces(self) -> list[dict]:
        if_desc = await self.walk(OID_IF_DESC)
        if_speed = await self.walk(OID_IF_SPEED)
        if_in_octets = await self.walk(OID_IF_IN_OCTETS)
        if_out_octets = await self.walk(OID_IF_OUT_OCTETS)
        if_in_errors = await self.walk(OID_IF_IN_ERRORS)
        if_out_errors = await self.walk(OID_IF_OUT_ERRORS)
        if_oper_status = await self.walk(OID_IF_OPER_STATUS)

        interfaces = []
        for i, desc_item in enumerate(if_desc):
            index = desc_item.oid.split(".")[-1]
            interfaces.append({
                "index": index,
                "description": desc_item.value,
                "speed_bps": int(if_speed[i].value) if i < len(if_speed) else 0,
                "in_octets": int(if_in_octets[i].value) if i < len(if_in_octets) else 0,
                "out_octets": int(if_out_octets[i].value) if i < len(if_out_octets) else 0,
                "in_errors": int(if_in_errors[i].value) if i < len(if_in_errors) else 0,
                "out_errors": int(if_out_errors[i].value) if i < len(if_out_errors) else 0,
                "oper_status": if_oper_status[i].value if i < len(if_oper_status) else "unknown",
                "timestamp": datetime.utcnow().isoformat(),
            })
        return interfaces

    async def collect_ups_metrics(self) -> dict:
        results = await self.get(
            OID_UPS_BATTERY_STATUS,
            OID_UPS_BATTERY_CHARGE,
            OID_UPS_BATTERY_VOLTAGE,
            OID_UPS_BATTERY_TEMP,
            OID_UPS_RUNTIME_REMAINING,
            OID_UPS_OUTPUT_LOAD,
        )
        return {
            "battery_status": results[0].value if results else None,
            "battery_charge_percent": float(results[1].value) if len(results) > 1 and results[1].value else None,
            "battery_voltage": float(results[2].value) / 10 if len(results) > 2 and results[2].value else None,
            "battery_temp_celsius": float(results[3].value) if len(results) > 3 and results[3].value else None,
            "runtime_remaining_min": int(results[4].value) / 60 if len(results) > 4 and results[4].value else None,
            "output_load_percent": float(results[5].value) if len(results) > 5 and results[5].value else None,
            "timestamp": datetime.utcnow().isoformat(),
        }

    async def collect_apc_environment(self) -> dict:
        results = await self.walk(OID_APC_TEMP_AMBIENT)
        humidity = await self.walk(OID_APC_HUMIDITY)
        sensors = []
        for i, temp_item in enumerate(results):
            sensors.append({
                "sensor_index": i + 1,
                "temperature_celsius": float(temp_item.value) / 10 if temp_item.value else None,
                "humidity_percent": float(humidity[i].value) / 10 if i < len(humidity) else None,
            })
        return {"sensors": sensors, "timestamp": datetime.utcnow().isoformat()}
