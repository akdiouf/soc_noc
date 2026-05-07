import uuid
from sqlalchemy import Column, String, Float, Boolean, Integer, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class NetworkLink(Base):
    __tablename__ = "network_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"))
    target_device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"))

    source_interface = Column(String(100))
    target_interface = Column(String(100))

    link_type = Column(String(50))   # ethernet, fiber, wan, mpls, vpn
    bandwidth_mbps = Column(Float)
    is_active = Column(Boolean, default=True)
    is_redundant = Column(Boolean, default=False)

    # Position visuelle pour la topologie
    metadata = Column(JSON, default=dict)

    source_device = relationship("Device", foreign_keys=[source_device_id], back_populates="links_source")
    target_device = relationship("Device", foreign_keys=[target_device_id], back_populates="links_target")
