import enum
import uuid
from sqlalchemy import (
    Column, String, Integer, DateTime, Enum, JSON, Text, Index, Boolean, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base


class IOCType(str, enum.Enum):
    IP_DST = "ip-dst"
    IP_SRC = "ip-src"
    DOMAIN = "domain"
    HOSTNAME = "hostname"
    URL = "url"
    MD5 = "md5"
    SHA1 = "sha1"
    SHA256 = "sha256"
    SHA512 = "sha512"
    EMAIL_SRC = "email-src"
    EMAIL_DST = "email-dst"
    FILENAME = "filename"
    MUTEX = "mutex"
    REGKEY = "regkey"
    USER_AGENT = "user-agent"
    IP_PORT = "ip-dst|port"
    OTHER = "other"


class IOCCache(Base):
    __tablename__ = "ioc_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    value = Column(String(2048), nullable=False)
    ioc_type = Column(Enum(IOCType), nullable=False)

    # MISP origin
    misp_event_id = Column(Integer, nullable=False)
    misp_event_uuid = Column(String(64), nullable=False)
    misp_event_title = Column(String(1024))
    misp_attribute_uuid = Column(String(64))
    misp_org = Column(String(255))

    # Threat metadata
    threat_level = Column(Integer, default=4)   # 1=High 2=Medium 3=Low 4=Undefined
    tlp = Column(String(20), default="white")   # white/green/amber/red
    category = Column(String(255))              # "Network activity", "Payload delivery"…
    comment = Column(Text)
    tags = Column(JSON, default=list)
    to_ids = Column(Boolean, default=True)

    # Timestamps
    misp_timestamp = Column(DateTime(timezone=True))
    first_seen = Column(DateTime(timezone=True), server_default=func.now())
    last_seen = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    synced_at = Column(DateTime(timezone=True), server_default=func.now())

    # Hit tracking
    hit_count = Column(Integer, default=0)
    last_hit_at = Column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("value", "ioc_type", name="uq_ioc_value_type"),
        Index("idx_ioc_value", "value"),
        Index("idx_ioc_event", "misp_event_id"),
    )
