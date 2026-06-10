from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, IPvAnyAddress
from app.models.device import DeviceType, DeviceStatus, MonitoringProtocol


class DeviceBase(BaseModel):
    name: str = Field(..., max_length=255)
    hostname: Optional[str] = None
    ip_address: str
    mac_address: Optional[str] = None
    device_type: DeviceType
    site: str = "primary"
    vendor: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    os_version: Optional[str] = None
    datacenter: Optional[str] = None
    room: Optional[str] = None
    rack: Optional[str] = None
    rack_unit: Optional[int] = None
    monitoring_protocol: MonitoringProtocol = MonitoringProtocol.SNMP_V2C
    snmp_community: Optional[str] = None
    snmp_version: Optional[str] = None
    snmp_username: Optional[str] = None
    snmp_auth_protocol: Optional[str] = None
    snmp_priv_protocol: Optional[str] = None
    modbus_port: Optional[int] = 502
    modbus_unit_id: Optional[int] = 1
    bacnet_device_id: Optional[int] = None
    api_endpoint: Optional[str] = None
    poll_interval: int = 60
    is_monitored: bool = True
    is_critical: bool = False
    description: Optional[str] = None
    tags: list[str] = []
    custom_attributes: dict = {}
    netbox_id: Optional[int] = None


class DeviceCreate(DeviceBase):
    snmp_auth_password: Optional[str] = None
    snmp_priv_password: Optional[str] = None
    api_token: Optional[str] = None


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    device_type: Optional[DeviceType] = None
    site: Optional[str] = None
    status: Optional[DeviceStatus] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    os_version: Optional[str] = None
    datacenter: Optional[str] = None
    room: Optional[str] = None
    rack: Optional[str] = None
    rack_unit: Optional[int] = None
    monitoring_protocol: Optional[MonitoringProtocol] = None
    snmp_community: Optional[str] = None
    poll_interval: Optional[int] = None
    is_monitored: Optional[bool] = None
    is_critical: Optional[bool] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    custom_attributes: Optional[dict] = None


class DeviceResponse(DeviceBase):
    id: UUID
    status: DeviceStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    last_poll: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DeviceListResponse(BaseModel):
    items: list[DeviceResponse]
    total: int
    page: int
    size: int
