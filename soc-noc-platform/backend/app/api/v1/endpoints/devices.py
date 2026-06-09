from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from app.core.database import get_db
from app.models.device import Device, DeviceType, DeviceSite, DeviceStatus
from app.schemas.device import DeviceCreate, DeviceUpdate, DeviceResponse, DeviceListResponse
from app.core.security import get_current_user
from app.models.user import User, UserRole

router = APIRouter(prefix="/devices", tags=["Devices"])


@router.get("", response_model=DeviceListResponse)
async def list_devices(
    site: Optional[DeviceSite] = None,
    device_type: Optional[DeviceType] = None,
    status: Optional[DeviceStatus] = None,
    is_monitored: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = []
    if site:
        filters.append(Device.site == site)
    if device_type:
        filters.append(Device.device_type == device_type)
    if status:
        filters.append(Device.status == status)
    if is_monitored is not None:
        filters.append(Device.is_monitored == is_monitored)
    if search:
        filters.append(
            (Device.name.ilike(f"%{search}%")) |
            (Device.ip_address.ilike(f"%{search}%")) |
            (Device.hostname.ilike(f"%{search}%"))
        )

    count_stmt = select(func.count()).select_from(Device)
    if filters:
        count_stmt = count_stmt.where(and_(*filters))
    total = (await db.execute(count_stmt)).scalar()

    stmt = select(Device)
    if filters:
        stmt = stmt.where(and_(*filters))
    stmt = stmt.offset((page - 1) * size).limit(size).order_by(Device.name)
    devices = (await db.execute(stmt)).scalars().all()

    return DeviceListResponse(items=devices, total=total, page=page, size=size)


@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    device = await _get_or_404(device_id, db)
    return device


@router.post("", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
async def create_device(
    payload: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_role(current_user, [UserRole.SUPER_ADMIN, UserRole.NOC_MANAGER])

    existing = await db.execute(
        select(Device).where(
            and_(Device.ip_address == payload.ip_address, Device.site == payload.site)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Un équipement avec l'IP {payload.ip_address} existe déjà sur ce site",
        )

    device = Device(**payload.model_dump())
    db.add(device)
    await db.flush()
    await db.refresh(device)
    return device


@router.put("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: UUID,
    payload: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_role(current_user, [UserRole.SUPER_ADMIN, UserRole.NOC_MANAGER, UserRole.NOC_ANALYST])
    device = await _get_or_404(device_id, db)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(device, field, value)

    await db.flush()
    await db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_role(current_user, [UserRole.SUPER_ADMIN])
    device = await _get_or_404(device_id, db)
    await db.delete(device)


@router.post("/{device_id}/maintenance", response_model=DeviceResponse)
async def toggle_maintenance(
    device_id: UUID,
    enable: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_role(current_user, [UserRole.SUPER_ADMIN, UserRole.NOC_MANAGER, UserRole.NOC_ANALYST])
    device = await _get_or_404(device_id, db)
    device.status = DeviceStatus.MAINTENANCE if enable else DeviceStatus.UNKNOWN
    await db.flush()
    await db.refresh(device)
    return device


@router.get("/summary/by-type")
async def devices_by_type(
    site: Optional[DeviceSite] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Device.device_type, func.count().label("count"))
    if site:
        stmt = stmt.where(Device.site == site)
    stmt = stmt.group_by(Device.device_type)
    result = await db.execute(stmt)
    return [{"type": row.device_type.value, "count": row.count} for row in result]


@router.get("/summary/by-status")
async def devices_by_status(
    site: Optional[DeviceSite] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Device.status, func.count().label("count"))
    if site:
        stmt = stmt.where(Device.site == site)
    stmt = stmt.group_by(Device.status)
    result = await db.execute(stmt)
    return [{"status": row.status.value, "count": row.count} for row in result]


async def _get_or_404(device_id: UUID, db: AsyncSession) -> Device:
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Équipement non trouvé")
    return device


def _require_role(user: User, allowed_roles: list[UserRole]):
    if user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permissions insuffisantes",
        )
