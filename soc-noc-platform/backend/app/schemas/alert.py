from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.alert import AlertSeverity, AlertStatus, AlertCategory


class AlertResponse(BaseModel):
    id: UUID
    title: str
    message: str
    severity: AlertSeverity
    status: AlertStatus
    category: AlertCategory
    device_id: Optional[UUID] = None
    source_ip: Optional[str] = None
    source_name: Optional[str] = None
    metric_name: Optional[str] = None
    metric_value: Optional[float] = None
    metric_unit: Optional[str] = None
    threshold_value: Optional[float] = None
    correlation_id: Optional[str] = None
    occurrence_count: int
    first_seen: datetime
    last_seen: datetime
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    resolution_note: Optional[str] = None
    notification_sent: bool
    tags: list[str]

    model_config = {"from_attributes": True}


class AlertListResponse(BaseModel):
    items: list[AlertResponse]
    total: int
    page: int
    size: int


class AlertAcknowledgeRequest(BaseModel):
    note: str = ""
