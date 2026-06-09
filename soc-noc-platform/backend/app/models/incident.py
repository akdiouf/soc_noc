import enum
import uuid
from sqlalchemy import (
    Column, String, Boolean, DateTime, Enum,
    Integer, JSON, ForeignKey, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class IncidentSeverity(str, enum.Enum):
    P1 = "p1"  # Critique - impact total
    P2 = "p2"  # Majeur - impact partiel
    P3 = "p3"  # Modéré - impact limité
    P4 = "p4"  # Mineur - impact négligeable
    P5 = "p5"  # Informatif


class IncidentStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    PENDING = "pending"        # en attente d'un tiers
    RESOLVED = "resolved"
    CLOSED = "closed"
    POST_MORTEM = "post_mortem"


class IncidentType(str, enum.Enum):
    # NOC
    NETWORK_OUTAGE = "network_outage"
    SERVER_DOWN = "server_down"
    PERFORMANCE_DEGRADATION = "performance_degradation"
    POWER_FAILURE = "power_failure"
    COOLING_FAILURE = "cooling_failure"
    HARDWARE_FAILURE = "hardware_failure"
    CAPACITY_ISSUE = "capacity_issue"
    # SOC
    SECURITY_BREACH = "security_breach"
    INTRUSION_ATTEMPT = "intrusion_attempt"
    DATA_LEAK = "data_leak"
    RANSOMWARE = "ransomware"
    DDOS = "ddos"
    UNAUTHORIZED_ACCESS = "unauthorized_access"
    MALWARE = "malware"
    PHISHING = "phishing"


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_number = Column(String(50), unique=True, nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    severity = Column(Enum(IncidentSeverity), nullable=False)
    status = Column(Enum(IncidentStatus), default=IncidentStatus.OPEN)
    incident_type = Column(Enum(IncidentType))

    # Impact
    impacted_services = Column(JSON, default=list)
    impacted_sites = Column(JSON, default=list)  # primary, failover
    impact_description = Column(Text)
    affected_users_count = Column(Integer, default=0)

    # Assignation
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    team = Column(String(100))  # NOC, SOC, Network, Systems

    # Escalade
    escalated = Column(Boolean, default=False)
    escalated_to = Column(String(255))
    escalated_at = Column(DateTime(timezone=True))
    escalation_reason = Column(Text)

    # Timeline
    detected_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True))    # début réel de l'incident
    resolved_at = Column(DateTime(timezone=True))
    closed_at = Column(DateTime(timezone=True))
    mttr_minutes = Column(Integer)  # Mean Time To Resolve

    # RCA / Post-mortem
    root_cause = Column(Text)
    resolution_steps = Column(Text)
    lessons_learned = Column(Text)
    preventive_actions = Column(JSON, default=list)

    # Intégration externe
    thehive_case_id = Column(String(100))
    jira_ticket_id = Column(String(100))
    pagerduty_incident_id = Column(String(100))

    # Métadonnées
    tags = Column(JSON, default=list)
    attachments = Column(JSON, default=list)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relations
    alerts = relationship("Alert", back_populates="incident")
    timeline = relationship("IncidentTimeline", back_populates="incident", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Incident {self.ticket_number} [{self.severity}] {self.title}>"


class IncidentTimeline(Base):
    __tablename__ = "incident_timelines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id = Column(UUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"))
    event_type = Column(String(100))  # status_change, comment, escalation, action
    message = Column(Text, nullable=False)
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    author_name = Column(String(255))
    extra_data = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    incident = relationship("Incident", back_populates="timeline")
