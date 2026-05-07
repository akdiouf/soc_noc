from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, desc
from app.core.database import get_db
from app.models.alert import Alert, AlertSeverity, AlertStatus, AlertCategory
from app.schemas.alert import AlertResponse, AlertListResponse, AlertAcknowledgeRequest
from app.services.alert_service import AlertService
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("", response_model=AlertListResponse)
async def list_alerts(
    severity: Optional[AlertSeverity] = None,
    status_filter: Optional[AlertStatus] = Query(None, alias="status"),
    category: Optional[AlertCategory] = None,
    device_id: Optional[UUID] = None,
    site: Optional[str] = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = []
    if severity:
        filters.append(Alert.severity == severity)
    if status_filter:
        filters.append(Alert.status == status_filter)
    if category:
        filters.append(Alert.category == category)
    if device_id:
        filters.append(Alert.device_id == device_id)

    count_stmt = select(func.count()).select_from(Alert)
    if filters:
        count_stmt = count_stmt.where(and_(*filters))
    total = (await db.execute(count_stmt)).scalar()

    stmt = select(Alert)
    if filters:
        stmt = stmt.where(and_(*filters))
    stmt = stmt.order_by(desc(Alert.last_seen)).offset((page - 1) * size).limit(size)
    alerts = (await db.execute(stmt)).scalars().all()

    return AlertListResponse(items=alerts, total=total, page=page, size=size)


@router.get("/active/count")
async def active_alert_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Comptage des alertes actives par sévérité — pour le dashboard NOC."""
    result = await db.execute(
        select(Alert.severity, func.count().label("count"))
        .where(Alert.status == AlertStatus.ACTIVE)
        .group_by(Alert.severity)
    )
    return {row.severity.value: row.count for row in result}


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerte non trouvée")
    return alert


@router.post("/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: UUID,
    payload: AlertAcknowledgeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = AlertService(db)
    return await svc.acknowledge(alert_id, current_user.id, payload.note)


@router.post("/{alert_id}/resolve", response_model=AlertResponse)
async def resolve_alert(
    alert_id: UUID,
    payload: AlertAcknowledgeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = AlertService(db)
    return await svc.resolve(alert_id, current_user.id, payload.note)


@router.post("/bulk/acknowledge")
async def bulk_acknowledge(
    alert_ids: list[UUID],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc = AlertService(db)
    results = []
    for aid in alert_ids:
        try:
            await svc.acknowledge(aid, current_user.id)
            results.append({"id": str(aid), "success": True})
        except Exception as e:
            results.append({"id": str(aid), "success": False, "error": str(e)})
    return results
