"""
Modbus TCP Collector
Utilisé pour : UPS industriels, PDU, groupes électrogènes, CRAC/CRAH,
               onduleurs, switchboards, équipements industriels
"""
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from pymodbus.client import AsyncModbusTcpClient
from pymodbus.exceptions import ModbusException

logger = logging.getLogger(__name__)


@dataclass
class ModbusConfig:
    ip: str
    port: int = 502
    unit_id: int = 1
    timeout: float = 5.0
    retries: int = 3


# ─── Registres types UPS industriel (Schneider, ABB, Eaton) ───────────────────
UPS_REGISTERS = {
    # Batterie
    "battery_voltage": {"address": 0x0100, "scale": 0.1, "unit": "V"},
    "battery_current": {"address": 0x0101, "scale": 0.1, "unit": "A"},
    "battery_charge": {"address": 0x0102, "scale": 1.0, "unit": "%"},
    "battery_temp": {"address": 0x0103, "scale": 0.1, "unit": "°C"},
    "battery_runtime": {"address": 0x0104, "scale": 1.0, "unit": "min"},
    "battery_status": {"address": 0x0105, "scale": 1.0, "unit": ""},
    # Entrée AC
    "input_voltage_l1": {"address": 0x0200, "scale": 0.1, "unit": "V"},
    "input_voltage_l2": {"address": 0x0201, "scale": 0.1, "unit": "V"},
    "input_voltage_l3": {"address": 0x0202, "scale": 0.1, "unit": "V"},
    "input_frequency": {"address": 0x0203, "scale": 0.1, "unit": "Hz"},
    # Sortie AC
    "output_voltage_l1": {"address": 0x0300, "scale": 0.1, "unit": "V"},
    "output_voltage_l2": {"address": 0x0301, "scale": 0.1, "unit": "V"},
    "output_voltage_l3": {"address": 0x0302, "scale": 0.1, "unit": "V"},
    "output_current_l1": {"address": 0x0303, "scale": 0.1, "unit": "A"},
    "output_current_l2": {"address": 0x0304, "scale": 0.1, "unit": "A"},
    "output_current_l3": {"address": 0x0305, "scale": 0.1, "unit": "A"},
    "output_power": {"address": 0x0306, "scale": 10.0, "unit": "W"},
    "output_load": {"address": 0x0307, "scale": 1.0, "unit": "%"},
    "output_frequency": {"address": 0x0308, "scale": 0.1, "unit": "Hz"},
    # UPS mode
    "ups_mode": {"address": 0x0400, "scale": 1.0, "unit": ""},
}

# ─── Registres groupe électrogène ─────────────────────────────────────────────
GENERATOR_REGISTERS = {
    "engine_speed": {"address": 0x0000, "scale": 1.0, "unit": "RPM"},
    "engine_temp": {"address": 0x0001, "scale": 0.1, "unit": "°C"},
    "fuel_level": {"address": 0x0002, "scale": 1.0, "unit": "%"},
    "oil_pressure": {"address": 0x0003, "scale": 0.1, "unit": "bar"},
    "coolant_temp": {"address": 0x0004, "scale": 0.1, "unit": "°C"},
    "battery_voltage": {"address": 0x0005, "scale": 0.1, "unit": "V"},
    "run_hours": {"address": 0x0006, "scale": 1.0, "unit": "h"},
    "output_voltage_l1": {"address": 0x0010, "scale": 0.1, "unit": "V"},
    "output_voltage_l2": {"address": 0x0011, "scale": 0.1, "unit": "V"},
    "output_voltage_l3": {"address": 0x0012, "scale": 0.1, "unit": "V"},
    "output_current_l1": {"address": 0x0013, "scale": 0.1, "unit": "A"},
    "output_power_kw": {"address": 0x0014, "scale": 0.1, "unit": "kW"},
    "output_frequency": {"address": 0x0015, "scale": 0.01, "unit": "Hz"},
    "status": {"address": 0x0020, "scale": 1.0, "unit": ""},
    "alarm_code": {"address": 0x0021, "scale": 1.0, "unit": ""},
}

# ─── Registres CRAC/CRAH (Emerson, Stulz, Schneider) ─────────────────────────
CRAC_REGISTERS = {
    "return_air_temp": {"address": 0x0000, "scale": 0.1, "unit": "°C"},
    "supply_air_temp": {"address": 0x0001, "scale": 0.1, "unit": "°C"},
    "return_humidity": {"address": 0x0002, "scale": 0.1, "unit": "%"},
    "supply_humidity": {"address": 0x0003, "scale": 0.1, "unit": "%"},
    "setpoint_temp": {"address": 0x0004, "scale": 0.1, "unit": "°C"},
    "setpoint_humidity": {"address": 0x0005, "scale": 0.1, "unit": "%"},
    "compressor_status": {"address": 0x0010, "scale": 1.0, "unit": ""},
    "fan_speed": {"address": 0x0011, "scale": 1.0, "unit": "%"},
    "cooling_capacity": {"address": 0x0012, "scale": 0.1, "unit": "kW"},
    "power_consumption": {"address": 0x0013, "scale": 0.1, "unit": "kW"},
    "runtime_hours": {"address": 0x0014, "scale": 1.0, "unit": "h"},
    "alarm_status": {"address": 0x0020, "scale": 1.0, "unit": ""},
}

# ─── Registres PDU intelligent ────────────────────────────────────────────────
PDU_REGISTERS = {
    "total_current": {"address": 0x0000, "scale": 0.1, "unit": "A"},
    "total_power": {"address": 0x0001, "scale": 0.1, "unit": "kW"},
    "total_energy": {"address": 0x0002, "scale": 0.01, "unit": "kWh"},
    "input_voltage": {"address": 0x0003, "scale": 0.1, "unit": "V"},
    "power_factor": {"address": 0x0004, "scale": 0.01, "unit": ""},
    "frequency": {"address": 0x0005, "scale": 0.01, "unit": "Hz"},
    "temperature": {"address": 0x0006, "scale": 0.1, "unit": "°C"},
}


class ModbusCollector:
    def __init__(self, config: ModbusConfig):
        self.config = config

    async def _read_registers(
        self,
        address: int,
        count: int = 1,
        register_type: str = "holding",
    ) -> list[int] | None:
        client = AsyncModbusTcpClient(
            host=self.config.ip,
            port=self.config.port,
            timeout=self.config.timeout,
        )
        try:
            await client.connect()
            if not client.connected:
                logger.error(f"Modbus connection failed: {self.config.ip}:{self.config.port}")
                return None

            if register_type == "holding":
                result = await client.read_holding_registers(
                    address, count, slave=self.config.unit_id
                )
            else:
                result = await client.read_input_registers(
                    address, count, slave=self.config.unit_id
                )

            if result.isError():
                logger.error(f"Modbus read error at {self.config.ip} addr {address}: {result}")
                return None

            return result.registers

        except ModbusException as e:
            logger.error(f"Modbus exception {self.config.ip}: {e}")
            return None
        finally:
            client.close()

    async def _collect_from_map(self, register_map: dict) -> dict:
        metrics = {"timestamp": datetime.utcnow().isoformat()}
        for name, config in register_map.items():
            regs = await self._read_registers(config["address"])
            if regs:
                raw = regs[0]
                if raw > 32767:  # signed 16-bit
                    raw -= 65536
                metrics[name] = round(raw * config["scale"], 3)
                metrics[f"{name}_unit"] = config["unit"]
            else:
                metrics[name] = None
        return metrics

    async def collect_ups(self) -> dict:
        return await self._collect_from_map(UPS_REGISTERS)

    async def collect_generator(self) -> dict:
        return await self._collect_from_map(GENERATOR_REGISTERS)

    async def collect_crac(self) -> dict:
        return await self._collect_from_map(CRAC_REGISTERS)

    async def collect_pdu(self) -> dict:
        return await self._collect_from_map(PDU_REGISTERS)

    async def read_coils(self, address: int, count: int = 1) -> list[bool] | None:
        client = AsyncModbusTcpClient(
            host=self.config.ip,
            port=self.config.port,
            timeout=self.config.timeout,
        )
        try:
            await client.connect()
            result = await client.read_coils(address, count, slave=self.config.unit_id)
            if result.isError():
                return None
            return result.bits[:count]
        except ModbusException as e:
            logger.error(f"Modbus coil read error {self.config.ip}: {e}")
            return None
        finally:
            client.close()
