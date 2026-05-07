from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.metrics_service import MetricsService
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/metrics", tags=["Metrics"])


@router.get("/device/{device_id}")
async def get_device_metrics(
    device_id: UUID,
    metric: str = Query(..., description="Nom de la métrique (cpu_percent, memory_percent, etc.)"),
    hours: int = Query(24, ge=1, le=720),
    aggregation: str = Query("mean", regex="^(mean|max|min|last)$"),
    window: str = Query("5m"),
    current_user: User = Depends(get_current_user),
):
    svc = MetricsService()
    return await svc.query_device_metrics(
        device_id=str(device_id),
        metric_name=metric,
        duration_hours=hours,
        aggregation=aggregation,
        window=window,
    )


@router.get("/device/{device_id}/stats")
async def get_device_stats(
    device_id: UUID,
    metric: str = Query(...),
    hours: int = Query(24, ge=1, le=720),
    current_user: User = Depends(get_current_user),
):
    svc = MetricsService()
    return await svc.get_stats(str(device_id), metric, hours)


@router.get("/device/{device_id}/current")
async def get_current_metrics(
    device_id: UUID,
    metric: str = Query(...),
    current_user: User = Depends(get_current_user),
):
    svc = MetricsService()
    value = await svc.get_current_value(str(device_id), metric)
    return {"device_id": str(device_id), "metric": metric, "value": value}


@router.get("/dashboard/overview")
async def get_dashboard_overview(
    site: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Vue d'ensemble des métriques clés pour le dashboard NOC."""
    from app.core.database import get_influxdb
    from app.core.config import settings

    async with get_influxdb() as client:
        query_api = client.query_api()

        site_filter = f'|> filter(fn: (r) => r.site == "{site}")' if site else ""

        flux = f"""
            from(bucket: "{settings.INFLUXDB_BUCKET}")
              |> range(start: -5m)
              |> filter(fn: (r) => r._measurement == "device_metrics")
              {site_filter}
              |> filter(fn: (r) => r._field =~ /cpu_percent|memory_percent|temperature/)
              |> last()
              |> group(columns: ["_field"])
              |> mean()
        """
        try:
            tables = await query_api.query(flux, org=settings.INFLUXDB_ORG)
            overview = {}
            for table in tables:
                for record in table.records:
                    overview[record.get_field()] = round(record.get_value() or 0, 1)
            return overview
        except Exception as e:
            return {"error": str(e)}
