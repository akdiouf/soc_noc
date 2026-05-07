"""
BACnet/IP Collector
Utilisé pour : climatiseurs, systèmes de gestion de bâtiment (BMS/BAS),
               systèmes CVC (chauffage, ventilation, climatisation)
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional
import BAC0
from BAC0.core.devices.local.models import analog_input, analog_output, binary_input

logger = logging.getLogger(__name__)


@dataclass
class BACnetConfig:
    ip: str
    device_id: int
    port: int = 47808
    network_number: int = 0
    local_ip: Optional[str] = None
    timeout: int = 10


# BACnet Object Types
OBJECT_ANALOG_INPUT = "analogInput"
OBJECT_ANALOG_OUTPUT = "analogOutput"
OBJECT_BINARY_INPUT = "binaryInput"
OBJECT_BINARY_OUTPUT = "binaryOutput"
OBJECT_MULTI_STATE = "multiStateValue"

# Property Identifiers
PROP_PRESENT_VALUE = "presentValue"
PROP_OBJECT_NAME = "objectName"
PROP_DESCRIPTION = "description"
PROP_UNITS = "units"

# Points types pour climatiseurs / BMS
HVAC_POINTS = {
    # Températures
    "supply_air_temp": (OBJECT_ANALOG_INPUT, 1, "°C"),
    "return_air_temp": (OBJECT_ANALOG_INPUT, 2, "°C"),
    "outside_air_temp": (OBJECT_ANALOG_INPUT, 3, "°C"),
    "zone_temp_1": (OBJECT_ANALOG_INPUT, 4, "°C"),
    "zone_temp_2": (OBJECT_ANALOG_INPUT, 5, "°C"),
    # Humidité
    "supply_humidity": (OBJECT_ANALOG_INPUT, 10, "%"),
    "return_humidity": (OBJECT_ANALOG_INPUT, 11, "%"),
    # Débit
    "supply_airflow": (OBJECT_ANALOG_INPUT, 20, "m3/h"),
    # Pressions
    "static_pressure": (OBJECT_ANALOG_INPUT, 30, "Pa"),
    "chilled_water_supply_temp": (OBJECT_ANALOG_INPUT, 40, "°C"),
    "chilled_water_return_temp": (OBJECT_ANALOG_INPUT, 41, "°C"),
    # Setpoints
    "temp_setpoint": (OBJECT_ANALOG_OUTPUT, 1, "°C"),
    "humidity_setpoint": (OBJECT_ANALOG_OUTPUT, 2, "%"),
    # Statuts binaires
    "compressor_on": (OBJECT_BINARY_INPUT, 1, ""),
    "fan_on": (OBJECT_BINARY_INPUT, 2, ""),
    "heating_on": (OBJECT_BINARY_INPUT, 3, ""),
    "alarm_active": (OBJECT_BINARY_INPUT, 10, ""),
    "filter_dirty": (OBJECT_BINARY_INPUT, 11, ""),
    # Modes multi-états
    "operating_mode": (OBJECT_MULTI_STATE, 1, ""),
}

CHILLER_POINTS = {
    "chilled_water_supply_temp": (OBJECT_ANALOG_INPUT, 1, "°C"),
    "chilled_water_return_temp": (OBJECT_ANALOG_INPUT, 2, "°C"),
    "condenser_water_supply_temp": (OBJECT_ANALOG_INPUT, 3, "°C"),
    "condenser_water_return_temp": (OBJECT_ANALOG_INPUT, 4, "°C"),
    "chiller_capacity": (OBJECT_ANALOG_INPUT, 5, "%"),
    "power_consumption": (OBJECT_ANALOG_INPUT, 6, "kW"),
    "cop": (OBJECT_ANALOG_INPUT, 7, ""),  # Coefficient de performance
    "evaporator_pressure": (OBJECT_ANALOG_INPUT, 10, "bar"),
    "condenser_pressure": (OBJECT_ANALOG_INPUT, 11, "bar"),
    "compressor_status": (OBJECT_BINARY_INPUT, 1, ""),
    "alarm_status": (OBJECT_BINARY_INPUT, 2, ""),
    "chilled_water_setpoint": (OBJECT_ANALOG_OUTPUT, 1, "°C"),
}


class BACnetCollector:
    def __init__(self, config: BACnetConfig):
        self.config = config
        self._network = None

    async def _get_network(self) -> BAC0.lite:
        if self._network is None:
            loop = asyncio.get_event_loop()
            self._network = await loop.run_in_executor(
                None,
                lambda: BAC0.lite(
                    ip=self.config.local_ip or "0.0.0.0",
                    port=self.config.port,
                ),
            )
        return self._network

    async def _read_point(
        self,
        object_type: str,
        object_instance: int,
        property_id: str = PROP_PRESENT_VALUE,
    ) -> Any:
        network = await self._get_network()
        loop = asyncio.get_event_loop()
        try:
            address = f"{self.config.ip}:{self.config.port}"
            result = await loop.run_in_executor(
                None,
                lambda: network.read(
                    f"{address} {object_type} {object_instance} {property_id}"
                ),
            )
            return result
        except Exception as e:
            logger.error(
                f"BACnet read error {self.config.ip} "
                f"{object_type}:{object_instance} - {e}"
            )
            return None

    async def collect_hvac(self) -> dict:
        metrics = {"timestamp": datetime.utcnow().isoformat(), "device_ip": self.config.ip}
        for name, (obj_type, obj_instance, unit) in HVAC_POINTS.items():
            value = await self._read_point(obj_type, obj_instance)
            metrics[name] = value
            if unit:
                metrics[f"{name}_unit"] = unit
        return metrics

    async def collect_chiller(self) -> dict:
        metrics = {"timestamp": datetime.utcnow().isoformat(), "device_ip": self.config.ip}
        for name, (obj_type, obj_instance, unit) in CHILLER_POINTS.items():
            value = await self._read_point(obj_type, obj_instance)
            metrics[name] = value
            if unit:
                metrics[f"{name}_unit"] = unit
        return metrics

    async def discover_objects(self) -> list[dict]:
        network = await self._get_network()
        loop = asyncio.get_event_loop()
        try:
            address = f"{self.config.ip}:{self.config.port}"
            device = await loop.run_in_executor(
                None,
                lambda: BAC0.device(address, self.config.device_id, network),
            )
            objects = []
            for obj in device.points:
                objects.append({
                    "name": obj.properties.name,
                    "object_type": str(obj.properties.type),
                    "object_instance": obj.properties.address,
                    "description": str(obj.properties.description),
                    "units": str(obj.properties.units),
                })
            return objects
        except Exception as e:
            logger.error(f"BACnet discovery error {self.config.ip}: {e}")
            return []

    async def close(self):
        if self._network:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._network.disconnect)
            self._network = None
