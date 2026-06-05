"""
Celery tasks for MISP IOC synchronisation and alert enrichment.
"""
import asyncio
import logging
from datetime import datetime
from celery import shared_task
from sqlalchemy import select, func, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.database import AsyncSessionLocal
from app.core.config import settings
from app.models.threat_intel import IOCCache, IOCType
from app.services.misp_service import misp_service

logger = logging.getLogger(__name__)


def _run(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def sync_misp_iocs(self):
    """Pull IDS-flagged IOCs from MISP and upsert into the local ioc_cache table."""
    return _run(_sync_misp_iocs())


async def _sync_misp_iocs():
    count, attributes = await misp_service.fetch_attributes(
        days=settings.MISP_SYNC_DAYS
    )
    if not attributes:
        logger.info("MISP sync: no attributes returned (MISP unreachable or empty)")
        return {"synced": 0, "skipped": 0}

    synced = 0
    skipped = 0

    async with AsyncSessionLocal() as db:
        for attr in attributes:
            try:
                raw = attr.get("Attribute", attr)
                value = raw.get("value", "")
                type_str = raw.get("type", "other")

                # Map to known IOCType; fall back to "other"
                try:
                    ioc_type = IOCType(type_str)
                except ValueError:
                    ioc_type = IOCType.OTHER

                if not value:
                    skipped += 1
                    continue

                event = raw.get("Event", {})
                tags_raw = raw.get("Tag", []) + event.get("Tag", [])
                tag_names = [t.get("name", "") for t in tags_raw if isinstance(t, dict)]
                tlp = misp_service.extract_tlp(tag_names)

                ts = raw.get("timestamp")
                misp_ts = datetime.utcfromtimestamp(int(ts)) if ts else None

                stmt = pg_insert(IOCCache).values(
                    value=value,
                    ioc_type=ioc_type,
                    misp_event_id=int(event.get("id", 0) or 0),
                    misp_event_uuid=event.get("uuid", ""),
                    misp_event_title=event.get("info", "")[:1024] if event.get("info") else None,
                    misp_attribute_uuid=raw.get("uuid", ""),
                    misp_org=event.get("Orgc", {}).get("name") if event.get("Orgc") else None,
                    threat_level=int(event.get("threat_level_id", 4) or 4),
                    tlp=tlp,
                    category=raw.get("category", ""),
                    comment=(raw.get("comment") or "")[:2000],
                    tags=tag_names,
                    to_ids=bool(raw.get("to_ids", True)),
                    misp_timestamp=misp_ts,
                    synced_at=datetime.utcnow(),
                ).on_conflict_do_update(
                    index_elements=["value", "ioc_type"],
                    set_={
                        "misp_event_id": int(event.get("id", 0) or 0),
                        "misp_event_uuid": event.get("uuid", ""),
                        "misp_event_title": event.get("info", "")[:1024] if event.get("info") else None,
                        "threat_level": int(event.get("threat_level_id", 4) or 4),
                        "tlp": tlp,
                        "tags": tag_names,
                        "last_seen": func.now(),
                        "synced_at": datetime.utcnow(),
                    },
                )
                await db.execute(stmt)
                synced += 1
            except Exception as exc:
                logger.warning("MISP: skipped attribute due to error: %s", exc)
                skipped += 1

        await db.commit()

    logger.info("MISP sync complete: %d upserted, %d skipped", synced, skipped)
    return {"synced": synced, "skipped": skipped}


@shared_task(bind=True)
def check_iocs_for_alert(self, alert_id: str, source_ip: str):
    """
    Look up a source IP in the local IOC cache and enrich the alert if a match is found.
    Called automatically when a security alert with a source_ip is created.
    """
    return _run(_check_iocs_for_alert(alert_id, source_ip))


async def _check_iocs_for_alert(alert_id: str, source_ip: str):
    from app.models.alert import Alert
    import uuid as _uuid

    async with AsyncSessionLocal() as db:
        # Check local cache first
        result = await db.execute(
            select(IOCCache).where(IOCCache.value == source_ip).limit(5)
        )
        iocs = result.scalars().all()

        if not iocs:
            return {"matched": False}

        # Update hit counters
        for ioc in iocs:
            ioc.hit_count = (ioc.hit_count or 0) + 1
            ioc.last_hit_at = datetime.utcnow()
            db.add(ioc)

        # Enrich the alert's raw_data field
        try:
            alert_uuid = _uuid.UUID(alert_id)
            alert_result = await db.execute(
                select(Alert).where(Alert.id == alert_uuid)
            )
            alert = alert_result.scalar_one_or_none()
            if alert:
                raw = dict(alert.raw_data or {})
                raw["misp_matches"] = [
                    {
                        "value": ioc.value,
                        "type": ioc.ioc_type.value,
                        "event_id": ioc.misp_event_id,
                        "event_title": ioc.misp_event_title,
                        "threat_level": ioc.threat_level,
                        "tlp": ioc.tlp,
                        "tags": ioc.tags,
                    }
                    for ioc in iocs
                ]
                alert.raw_data = raw
                db.add(alert)
        except Exception as exc:
            logger.warning("MISP enrichment: could not update alert %s: %s", alert_id, exc)

        await db.commit()

    best = min(iocs, key=lambda x: x.threat_level)
    logger.info(
        "MISP match for %s (alert %s) — threat_level=%s event=%s",
        source_ip, alert_id, best.threat_level, best.misp_event_id
    )
    return {"matched": True, "threat_level": best.threat_level, "ioc_count": len(iocs)}
