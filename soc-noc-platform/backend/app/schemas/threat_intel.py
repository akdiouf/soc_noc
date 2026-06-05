from uuid import UUID
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from app.models.threat_intel import IOCType


class IOCCacheResponse(BaseModel):
    id: UUID
    value: str
    ioc_type: IOCType
    misp_event_id: int
    misp_event_uuid: str
    misp_event_title: Optional[str] = None
    misp_org: Optional[str] = None
    threat_level: int
    tlp: str
    category: Optional[str] = None
    comment: Optional[str] = None
    tags: List[str]
    to_ids: bool
    misp_timestamp: Optional[datetime] = None
    first_seen: datetime
    last_seen: datetime
    synced_at: datetime
    hit_count: int

    model_config = {"from_attributes": True}


class IOCLookupRequest(BaseModel):
    value: str
    ioc_type: Optional[IOCType] = None


class IOCLookupResponse(BaseModel):
    value: str
    found: bool
    threat_level: Optional[int] = None
    iocs: List[IOCCacheResponse] = []


class MISPStatus(BaseModel):
    connected: bool
    url: str
    version: Optional[str] = None
    organization: Optional[str] = None
    error: Optional[str] = None


class IOCStatsResponse(BaseModel):
    total: int
    by_type: Dict[str, int]
    by_threat_level: Dict[str, int]
    by_tlp: Dict[str, int]
    last_sync: Optional[datetime] = None


class IOCListResponse(BaseModel):
    items: List[IOCCacheResponse]
    total: int
    page: int
    size: int


class MISPEventSummary(BaseModel):
    event_id: int
    uuid: str
    title: str
    org: Optional[str] = None
    threat_level: int
    attribute_count: int
    tags: List[str] = []
    date: Optional[str] = None
