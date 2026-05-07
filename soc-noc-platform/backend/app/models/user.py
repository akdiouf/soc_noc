import enum
import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Enum, JSON, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    NOC_MANAGER = "noc_manager"
    SOC_MANAGER = "soc_manager"
    NOC_ANALYST = "noc_analyst"
    SOC_ANALYST = "soc_analyst"
    READ_ONLY = "read_only"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    full_name = Column(String(255))
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.READ_ONLY)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)

    # On-call
    on_call = Column(Boolean, default=False)
    phone = Column(String(20))
    teams_id = Column(String(255))
    slack_id = Column(String(255))

    # Préférences
    notification_preferences = Column(JSON, default=dict)
    dashboard_config = Column(JSON, default=dict)
    timezone = Column(String(50), default="Africa/Dakar")
    language = Column(String(10), default="fr")

    # Auth
    last_login = Column(DateTime(timezone=True))
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime(timezone=True))
    mfa_enabled = Column(Boolean, default=False)
    mfa_secret = Column(String(255))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<User {self.username} [{self.role}]>"
