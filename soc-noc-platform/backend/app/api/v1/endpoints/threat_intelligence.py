from typing import Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.threat_intel import IOCCache, IOCType
from app.services.misp_service import misp_service
from app.schemas.threat_intel import (
    IOCCacheResponse, IOCLookupRequest, IOCLookupResponse,
    MISPStatus, IOCStatsResponse, IOCListResponse, MISPEventSummary,
)

router = APIRouter(prefix="/threat-intel", tags=["Threat Intelligence"])


# ── Status & Events ──────────────────────────────────────────────────────────

@router.get("/status", response_model=MISPStatus)
async def get_misp_status(current_user: User = Depends(get_current_user)):
    result = await misp_service.get_status()
    return MISPStatus(**result)


@router.get("/events", response_model=list[MISPEventSummary])
async def list_misp_events(
    days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
):
    """Fetch recent MISP events directly from the MISP instance."""
    events = await misp_service.fetch_events(days=days)
    return [MISPEventSummary(**e) for e in events]


# ── IOC Cache ────────────────────────────────────────────────────────────────

@router.get("/iocs", response_model=IOCListResponse)
async def list_iocs(
    ioc_type: Optional[IOCType] = None,
    threat_level: Optional[int] = Query(None, ge=1, le=4),
    tlp: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = []
    if ioc_type:
        filters.append(IOCCache.ioc_type == ioc_type)
    if threat_level is not None:
        filters.append(IOCCache.threat_level == threat_level)
    if tlp:
        filters.append(IOCCache.tlp == tlp.lower())
    if search:
        filters.append(IOCCache.value.ilike(f"%{search}%"))

    count_stmt = select(func.count()).select_from(IOCCache)
    if filters:
        count_stmt = count_stmt.where(and_(*filters))
    total = (await db.execute(count_stmt)).scalar()

    stmt = select(IOCCache)
    if filters:
        stmt = stmt.where(and_(*filters))
    stmt = stmt.order_by(desc(IOCCache.last_seen)).offset((page - 1) * size).limit(size)
    iocs = (await db.execute(stmt)).scalars().all()

    return IOCListResponse(items=iocs, total=total, page=page, size=size)


@router.post("/iocs/lookup", response_model=IOCLookupResponse)
async def lookup_ioc(
    payload: IOCLookupRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check a value against the local IOC cache (fast) and optionally MISP (live)."""
    filters = [IOCCache.value == payload.value]
    if payload.ioc_type:
        filters.append(IOCCache.ioc_type == payload.ioc_type)

    result = await db.execute(
        select(IOCCache).where(and_(*filters)).limit(20)
    )
    cached = result.scalars().all()

    if cached:
        ioc_ids = [ioc.id for ioc in cached]

        async def _bump():
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as s:
                rows = (await s.execute(select(IOCCache).where(IOCCache.id.in_(ioc_ids)))).scalars().all()
                for row in rows:
                    row.hit_count = (row.hit_count or 0) + 1
                    row.last_hit_at = datetime.utcnow()
                    s.add(row)
                await s.commit()
        background_tasks.add_task(_bump)

        best_level = min(i.threat_level for i in cached)
        return IOCLookupResponse(
            value=payload.value,
            found=True,
            threat_level=best_level,
            iocs=cached,
        )

    # Not in cache: try live MISP query
    live = await misp_service.search_attribute(
        payload.value,
        payload.ioc_type.value if payload.ioc_type else None,
    )
    return IOCLookupResponse(
        value=payload.value,
        found=bool(live),
        iocs=[],
    )


@router.get("/iocs/stats", response_model=IOCStatsResponse)
async def get_ioc_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total = (await db.execute(select(func.count()).select_from(IOCCache))).scalar()

    by_type_rows = (await db.execute(
        select(IOCCache.ioc_type, func.count()).group_by(IOCCache.ioc_type)
    )).all()

    by_level_rows = (await db.execute(
        select(IOCCache.threat_level, func.count()).group_by(IOCCache.threat_level)
    )).all()

    by_tlp_rows = (await db.execute(
        select(IOCCache.tlp, func.count()).group_by(IOCCache.tlp)
    )).all()

    last_sync = (await db.execute(
        select(func.max(IOCCache.synced_at))
    )).scalar()

    level_labels = {1: "High", 2: "Medium", 3: "Low", 4: "Undefined"}

    return IOCStatsResponse(
        total=total,
        by_type={row[0].value: row[1] for row in by_type_rows},
        by_threat_level={level_labels.get(row[0], str(row[0])): row[1] for row in by_level_rows},
        by_tlp={row[0]: row[1] for row in by_tlp_rows},
        last_sync=last_sync,
    )


# ── Manual Sync ──────────────────────────────────────────────────────────────

@router.post("/sync", status_code=status.HTTP_202_ACCEPTED)
async def trigger_sync(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
):
    """Enqueue a MISP IOC synchronisation task immediately."""
    from app.tasks.misp_tasks import sync_misp_iocs
    task = sync_misp_iocs.apply_async(countdown=0)
    return {"task_id": task.id, "status": "queued", "message": f"Synchronisation MISP lancée (tâche {task.id})"}
