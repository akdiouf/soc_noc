import uuid
from uuid import UUID
from typing import Optional
from datetime import datetime
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, desc
from app.core.database import get_db
from app.core.config import settings
from app.models.incident import Incident, IncidentSeverity, IncidentStatus, IncidentType, IncidentTimeline
from app.schemas.incident import (
    IncidentCreate, IncidentUpdate, IncidentResponse,
    IncidentListResponse, TimelineEntryCreate, TimelineEntryResponse
)
from app.core.security import get_current_user
from app.models.user import User, UserRole

router = APIRouter(prefix="/incidents", tags=["Incidents"])


def _generate_ticket_number() -> str:
    now = datetime.utcnow()
    return f"INC-{now.strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"


@router.get("", response_model=IncidentListResponse)
async def list_incidents(
    severity: Optional[IncidentSeverity] = None,
    status_filter: Optional[IncidentStatus] = Query(None, alias="status"),
    incident_type: Optional[IncidentType] = None,
    assigned_to: Optional[UUID] = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = []
    if severity:
        filters.append(Incident.severity == severity)
    if status_filter:
        filters.append(Incident.status == status_filter)
    if incident_type:
        filters.append(Incident.incident_type == incident_type)
    if assigned_to:
        filters.append(Incident.assigned_to == assigned_to)

    count_stmt = select(func.count()).select_from(Incident)
    if filters:
        count_stmt = count_stmt.where(and_(*filters))
    total = (await db.execute(count_stmt)).scalar()

    stmt = select(Incident)
    if filters:
        stmt = stmt.where(and_(*filters))
    stmt = stmt.order_by(desc(Incident.detected_at)).offset((page - 1) * size).limit(size)
    incidents = (await db.execute(stmt)).scalars().all()

    return IncidentListResponse(items=incidents, total=total, page=page, size=size)


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    incident_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_or_404(incident_id, db)


@router.post("", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(
    payload: IncidentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = Incident(
        **payload.model_dump(),
        ticket_number=_generate_ticket_number(),
        created_by=current_user.id,
    )
    db.add(incident)
    await db.flush()

    # Premier événement dans la timeline
    entry = IncidentTimeline(
        incident_id=incident.id,
        event_type="creation",
        message=f"Incident créé par {current_user.full_name or current_user.username}",
        author_id=current_user.id,
        author_name=current_user.full_name or current_user.username,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(incident)
    return incident


@router.put("/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: UUID,
    payload: IncidentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = await _get_or_404(incident_id, db)
    old_status = incident.status

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(incident, field, value)

    if payload.status and payload.status != old_status:
        if payload.status == IncidentStatus.RESOLVED:
            incident.resolved_at = datetime.utcnow()
            if incident.started_at:
                delta = incident.resolved_at - incident.started_at
                incident.mttr_minutes = int(delta.total_seconds() / 60)
        if payload.status == IncidentStatus.CLOSED:
            incident.closed_at = datetime.utcnow()

        status_labels = {
            "open": "Ouvert", "in_progress": "En cours", "pending": "En attente",
            "resolved": "Résolu", "closed": "Fermé", "post_mortem": "Post-mortem",
        }
        db.add(IncidentTimeline(
            incident_id=incident.id,
            event_type="status_change",
            message=(
                f"Statut changé : {status_labels.get(old_status.value, old_status.value)}"
                f" → {status_labels.get(payload.status.value, payload.status.value)}"
                f" par {current_user.full_name or current_user.username}"
            ),
            author_id=current_user.id,
            author_name=current_user.full_name or current_user.username,
        ))

    await db.flush()
    await db.refresh(incident)
    return incident


@router.get("/{incident_id}/timeline", response_model=list[TimelineEntryResponse])
async def get_incident_timeline(
    incident_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_or_404(incident_id, db)
    result = await db.execute(
        select(IncidentTimeline)
        .where(IncidentTimeline.incident_id == incident_id)
        .order_by(IncidentTimeline.created_at)
    )
    return result.scalars().all()


@router.post("/{incident_id}/timeline", status_code=status.HTTP_201_CREATED)
async def add_timeline_entry(
    incident_id: UUID,
    payload: TimelineEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_or_404(incident_id, db)
    entry = IncidentTimeline(
        incident_id=incident_id,
        event_type=payload.event_type,
        message=payload.message,
        author_id=current_user.id,
        author_name=current_user.full_name or current_user.username,
        extra_data=payload.extra_data or {},
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry


@router.get("/stats/mttr")
async def get_mttr_stats(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """MTTR moyen par sévérité sur les N derniers jours."""
    result = await db.execute(
        select(
            Incident.severity,
            func.avg(Incident.mttr_minutes).label("avg_mttr"),
            func.count().label("count"),
        )
        .where(
            and_(
                Incident.status == IncidentStatus.RESOLVED,
                Incident.mttr_minutes.isnot(None),
            )
        )
        .group_by(Incident.severity)
    )
    return [
        {
            "severity": row.severity.value,
            "avg_mttr_minutes": round(row.avg_mttr or 0, 1),
            "count": row.count,
        }
        for row in result
    ]


@router.post("/{incident_id}/thehive", response_model=IncidentResponse)
async def create_thehive_case(
    incident_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export an incident to TheHive as a new case."""
    if not settings.THEHIVE_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TheHive non configuré",
        )

    incident = await _get_or_404(incident_id, db)

    if incident.thehive_case_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Case TheHive déjà créé",
        )

    severity_map = {
        IncidentSeverity.P1: 4,
        IncidentSeverity.P2: 3,
        IncidentSeverity.P3: 2,
        IncidentSeverity.P4: 1,
        IncidentSeverity.P5: 1,
    }
    thehive_severity = severity_map.get(incident.severity, 1)

    tags = list(incident.tags or [])
    if incident.incident_type:
        tags.append(incident.incident_type.value)

    case_payload = {
        "title": incident.title,
        "description": incident.description or "",
        "severity": thehive_severity,
        "tlp": 2,
        "pap": 2,
        "tags": tags,
    }

    try:
        async with httpx.AsyncClient(base_url=settings.THEHIVE_URL, timeout=15.0) as client:
            response = await client.post(
                "/api/v1/case",
                json=case_payload,
                headers={
                    "Authorization": f"Bearer {settings.THEHIVE_API_KEY}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            case_data = response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erreur lors de la création du case TheHive : {exc}",
        )

    incident.thehive_case_id = case_data.get("_id") or case_data.get("id")

    db.add(IncidentTimeline(
        incident_id=incident.id,
        event_type="thehive_export",
        message=(
            f"Case TheHive créé (ID: {incident.thehive_case_id})"
            f" par {current_user.full_name or current_user.username}"
        ),
        author_id=current_user.id,
        author_name=current_user.full_name or current_user.username,
    ))

    await db.flush()
    await db.refresh(incident)
    return incident


async def _get_or_404(incident_id: UUID, db: AsyncSession) -> Incident:
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident non trouvé")
    return incident
