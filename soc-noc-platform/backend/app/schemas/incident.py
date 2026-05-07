from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.incident import IncidentSeverity, IncidentStatus, IncidentType


class IncidentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    severity: IncidentSeverity
    incident_type: Optional[IncidentType] = None
    impacted_services: list[str] = []
    impacted_sites: list[str] = []
    impact_description: Optional[str] = None
    affected_users_count: int = 0
    team: Optional[str] = None
    started_at: Optional[datetime] = None
    tags: list[str] = []


class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[IncidentSeverity] = None
    status: Optional[IncidentStatus] = None
    incident_type: Optional[IncidentType] = None
    impacted_services: Optional[list[str]] = None
    impacted_sites: Optional[list[str]] = None
    impact_description: Optional[str] = None
    affected_users_count: Optional[int] = None
    assigned_to: Optional[UUID] = None
    team: Optional[str] = None
    escalated: Optional[bool] = None
    escalated_to: Optional[str] = None
    escalation_reason: Optional[str] = None
    root_cause: Optional[str] = None
    resolution_steps: Optional[str] = None
    lessons_learned: Optional[str] = None
    preventive_actions: Optional[list[str]] = None


class IncidentResponse(BaseModel):
    id: UUID
    ticket_number: str
    title: str
    description: Optional[str] = None
    severity: IncidentSeverity
    status: IncidentStatus
    incident_type: Optional[IncidentType] = None
    impacted_services: list[str]
    impacted_sites: list[str]
    impact_description: Optional[str] = None
    affected_users_count: int
    team: Optional[str] = None
    escalated: bool
    escalated_to: Optional[str] = None
    detected_at: datetime
    started_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    mttr_minutes: Optional[int] = None
    root_cause: Optional[str] = None
    resolution_steps: Optional[str] = None
    thehive_case_id: Optional[str] = None
    tags: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class IncidentListResponse(BaseModel):
    items: list[IncidentResponse]
    total: int
    page: int
    size: int


class TimelineEntryCreate(BaseModel):
    event_type: str
    message: str
    metadata: Optional[dict] = None
