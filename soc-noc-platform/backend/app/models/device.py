import enum
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, DateTime, Enum, Float,
    Integer, JSON, ForeignKey, Text, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class DeviceType(str, enum.Enum):
    # Réseau
    ROUTER = "router"
    SWITCH = "switch"
    FIREWALL = "firewall"
    LOAD_BALANCER = "load_balancer"
    ACCESS_POINT = "access_point"
    # Serveurs
    SERVER = "server"
    HYPERVISOR = "hypervisor"
    VIRTUAL_MACHINE = "virtual_machine"
    # Stockage
    STORAGE = "storage"
    NAS = "nas"
    SAN = "san"
    # Infra physique
    UPS = "ups"
    PDU = "pdu"
    CRAC = "crac"           # Computer Room Air Conditioning
    CRAH = "crah"           # Computer Room Air Handler
    GENERATOR = "generator" # Groupe électrogène
    ATS = "ats"             # Automatic Transfer Switch
    CHILLER = "chiller"     # Refroidisseur
    # Sécurité physique
    ACCESS_CONTROL = "access_control"
    CAMERA = "camera"
    SMOKE_DETECTOR = "smoke_detector"
    # Autre
    PRINTER = "printer"
    OTHER = "other"


class DeviceStatus(str, enum.Enum):
    UP = "up"
    DOWN = "down"
    WARNING = "warning"
    CRITICAL = "critical"
    UNKNOWN = "unknown"
    MAINTENANCE = "maintenance"


class MonitoringProtocol(str, enum.Enum):
    SNMP_V1 = "snmp_v1"
    SNMP_V2C = "snmp_v2c"
    SNMP_V3 = "snmp_v3"
    MODBUS_TCP = "modbus_tcp"
    MODBUS_RTU = "modbus_rtu"
    BACNET_IP = "bacnet_ip"
    REST_API = "rest_api"
    ICMP = "icmp"
    SSH = "ssh"
    WMI = "wmi"
    IPMI = "ipmi"


class Device(Base):
    __tablename__ = "devices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    hostname = Column(String(255))
    ip_address = Column(String(45), nullable=False)
    mac_address = Column(String(17))
    device_type = Column(Enum(DeviceType), nullable=False)
    site = Column(String(64), default="primary")
    status = Column(Enum(DeviceStatus), default=DeviceStatus.UNKNOWN)

    # Identification matérielle
    vendor = Column(String(100))
    model = Column(String(100))
    serial_number = Column(String(100))
    firmware_version = Column(String(50))
    os_version = Column(String(50))

    # Localisation physique
    datacenter = Column(String(100))
    room = Column(String(100))
    rack = Column(String(50))
    rack_unit = Column(Integer)

    # Monitoring
    monitoring_protocol = Column(Enum(MonitoringProtocol), default=MonitoringProtocol.SNMP_V2C)
    snmp_community = Column(String(100))
    snmp_version = Column(String(10))
    snmp_username = Column(String(100))    # SNMPv3
    snmp_auth_protocol = Column(String(20)) # SNMPv3
    snmp_auth_password = Column(String(255)) # SNMPv3 (encrypted)
    snmp_priv_protocol = Column(String(20))  # SNMPv3
    snmp_priv_password = Column(String(255)) # SNMPv3 (encrypted)
    modbus_port = Column(Integer, default=502)
    modbus_unit_id = Column(Integer, default=1)
    bacnet_device_id = Column(Integer)
    api_endpoint = Column(String(500))
    api_token = Column(String(500))

    # Monitoring config
    poll_interval = Column(Integer, default=60)  # seconds
    is_monitored = Column(Boolean, default=True)
    is_critical = Column(Boolean, default=False)  # équipement critique

    # Métadonnées
    description = Column(Text)
    tags = Column(JSON, default=list)
    custom_attributes = Column(JSON, default=dict)
    netbox_id = Column(Integer)  # lien vers NetBox CMDB

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_seen = Column(DateTime(timezone=True))
    last_poll = Column(DateTime(timezone=True))

    # Relations
    alerts = relationship("Alert", back_populates="device", cascade="all, delete-orphan")
    thresholds = relationship("MetricThreshold", back_populates="device", cascade="all, delete-orphan")
    links_source = relationship("NetworkLink", foreign_keys="NetworkLink.source_device_id", back_populates="source_device")
    links_target = relationship("NetworkLink", foreign_keys="NetworkLink.target_device_id", back_populates="target_device")

    __table_args__ = (
        UniqueConstraint("ip_address", "site", name="uq_device_ip_site"),
    )

    def __repr__(self):
        return f"<Device {self.name} ({self.ip_address}) [{self.device_type}]>"
