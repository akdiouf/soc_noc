import uuid
from sqlalchemy import Column, String, Float, Boolean, Integer, Enum, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.alert import AlertSeverity


class MetricThreshold(Base):
    __tablename__ = "metric_thresholds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"))
    metric_name = Column(String(255), nullable=False)
    metric_unit = Column(String(50))

    # Seuils
    warning_value = Column(Float)
    critical_value = Column(Float)
    emergency_value = Column(Float)
    comparison = Column(String(10), default="gt")  # gt, lt, eq, ne

    # Comportement
    is_active = Column(Boolean, default=True)
    consecutive_breaches = Column(Integer, default=1)  # nombre de violations consécutives avant alerte
    cooldown_minutes = Column(Integer, default=5)       # délai avant nouvelle alerte

    # Relations
    device = relationship("Device", back_populates="thresholds")

    def __repr__(self):
        return f"<MetricThreshold {self.metric_name} warn={self.warning_value} crit={self.critical_value}>"
