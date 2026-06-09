import enum
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, DateTime, Enum, Float,
    Integer, JSON, ForeignKey, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class AlertSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    EMERGENCY = "emergency"


class AlertStatus(str, enum.Enum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    SUPPRESSED = "suppressed"


class AlertCategory(str, enum.Enum):
    # NOC
    AVAILABILITY = "availability"
    PERFORMANCE = "performance"
    CAPACITY = "capacity"
    CONFIGURATION = "configuration"
    # Physique
    POWER = "power"
    TEMPERATURE = "temperature"
    HUMIDITY = "humidity"
    COOLING = "cooling"
    ACCESS = "access"
    # SOC
    SECURITY = "security"
    INTRUSION = "intrusion"
    ANOMALY = "anomaly"
    COMPLIANCE = "compliance"


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(500), nullable=False)
    message = Column(Text, nullable=False)
    severity = Column(Enum(AlertSeverity), nullable=False, default=AlertSeverity.WARNING)
    status = Column(Enum(AlertStatus), default=AlertStatus.ACTIVE)
    category = Column(Enum(AlertCategory), default=AlertCategory.AVAILABILITY)

    # Source
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    source_ip = Column(String(45))
    source_name = Column(String(255))
    metric_name = Column(String(255))
    metric_value = Column(Float)
    metric_unit = Column(String(50))
    threshold_value = Column(Float)

    # Corrélation
    correlation_id = Column(String(255))  # regroupe des alertes liées
    parent_alert_id = Column(UUID(as_uuid=True), ForeignKey("alerts.id"), nullable=True)
    is_parent = Column(Boolean, default=False)
    occurrence_count = Column(Integer, default=1)
    first_seen = Column(DateTime(timezone=True), server_default=func.now())
    last_seen = Column(DateTime(timezone=True), server_default=func.now())

    # Traitement
    acknowledged_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True))
    resolved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    resolved_at = Column(DateTime(timezone=True))
    resolution_note = Column(Text)

    # Incident lié
    incident_id = Column(UUID(as_uuid=True), ForeignKey("incidents.id"), nullable=True)

    # Notifications
    notification_sent = Column(Boolean, default=False)
    notification_channels = Column(JSON, default=list)  # email, slack, sms, pagerduty

    # Métadonnées
    raw_data = Column(JSON, default=dict)
    tags = Column(JSON, default=list)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relations
    device = relationship("Device", back_populates="alerts")
    incident = relationship("Incident", back_populates="alerts")
    children = relationship("Alert", foreign_keys=[parent_alert_id])

    def __repr__(self):
        return f"<Alert [{self.severity}] {self.title}>"
