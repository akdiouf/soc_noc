"""
Tâches Celery de maintenance : nettoyage, rapports, synchronisation NetBox
"""
import logging
from datetime import datetime, timedelta
from celery import shared_task
from sqlalchemy import select, and_, delete, func
from app.core.database import AsyncSessionLocal
from app.models.alert import Alert, AlertStatus
from app.models.incident import Incident, IncidentStatus
from app.models.device import Device
from app.services.notification_service import NotificationService
import asyncio

logger = logging.getLogger(__name__)


def run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@shared_task
def cleanup_old_alerts():
    return run_async(_cleanup_old_alerts())


async def _cleanup_old_alerts():
    cutoff = datetime.utcnow() - timedelta(days=30)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            delete(Alert).where(
                and_(
                    Alert.status == AlertStatus.RESOLVED,
                    Alert.resolved_at < cutoff,
                )
            )
        )
        await db.commit()
        logger.info(f"Cleaned up {result.rowcount} old resolved alerts")
    return result.rowcount


@shared_task
def send_daily_report():
    return run_async(_send_daily_report())


async def _send_daily_report():
    yesterday = datetime.utcnow() - timedelta(days=1)

    async with AsyncSessionLocal() as db:
        # Compte des alertes par sévérité sur 24h
        alert_counts = await db.execute(
            select(Alert.severity, func.count().label("count"))
            .where(Alert.created_at >= yesterday)
            .group_by(Alert.severity)
        )
        alerts_by_sev = {row.severity.value: row.count for row in alert_counts}

        # Incidents résolus
        resolved = await db.execute(
            select(func.count(), func.avg(Incident.mttr_minutes))
            .where(
                and_(
                    Incident.resolved_at >= yesterday,
                    Incident.status == IncidentStatus.RESOLVED,
                )
            )
        )
        res_row = resolved.one()
        incidents_resolved = res_row[0]
        avg_mttr = round(res_row[1] or 0, 1)

        # Incidents ouverts
        open_count = await db.execute(
            select(func.count()).select_from(Incident)
            .where(Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.IN_PROGRESS]))
        )
        open_incidents = open_count.scalar()

        # Équipements down
        down_count = await db.execute(
            select(func.count()).select_from(Device)
            .where(Device.status.in_(["down", "critical"]))
        )
        down_devices = down_count.scalar()

    report = {
        "date": yesterday.strftime("%Y-%m-%d"),
        "alerts": alerts_by_sev,
        "incidents_resolved_24h": incidents_resolved,
        "avg_mttr_minutes": avg_mttr,
        "open_incidents": open_incidents,
        "down_devices": down_devices,
    }

    notif = NotificationService()
    await _send_report_notification(notif, report)
    logger.info(f"Daily report sent: {report}")
    return report


async def _send_report_notification(notif: NotificationService, report: dict):
    if not notif.settings.SLACK_WEBHOOK_URL if hasattr(notif, 'settings') else True:
        return
    import aiohttp
    from app.core.config import settings
    if not settings.SLACK_WEBHOOK_URL:
        return

    total_alerts = sum(report["alerts"].values())
    text = (
        f"*Rapport journalier NOC/SOC — {report['date']}*\n"
        f"• Alertes déclenchées : {total_alerts} "
        f"({report['alerts'].get('emergency', 0)} urgences, "
        f"{report['alerts'].get('critical', 0)} critiques)\n"
        f"• Incidents résolus : {report['incidents_resolved_24h']} "
        f"(MTTR moyen: {report['avg_mttr_minutes']} min)\n"
        f"• Incidents ouverts : {report['open_incidents']}\n"
        f"• Équipements KO : {report['down_devices']}"
    )
    payload = {"text": text}
    try:
        async with aiohttp.ClientSession() as session:
            await session.post(settings.SLACK_WEBHOOK_URL, json=payload)
    except Exception as e:
        logger.error(f"Daily report Slack notification failed: {e}")


@shared_task
def sync_netbox_inventory():
    return run_async(_sync_netbox_inventory())


async def _sync_netbox_inventory():
    from app.core.config import settings
    import aiohttp

    if not settings.NETBOX_TOKEN:
        logger.info("NetBox token not configured, skipping sync")
        return

    headers = {
        "Authorization": f"Token {settings.NETBOX_TOKEN}",
        "Content-Type": "application/json",
    }

    synced = 0
    async with aiohttp.ClientSession(headers=headers) as session:
        # Récupérer tous les équipements NetBox
        url = f"{settings.NETBOX_URL}/api/dcim/devices/?limit=500"
        try:
            async with session.get(url) as resp:
                if resp.status != 200:
                    logger.error(f"NetBox API error: {resp.status}")
                    return
                data = await resp.json()
                nb_devices = data.get("results", [])
        except Exception as e:
            logger.error(f"NetBox connection error: {e}")
            return

    # Mettre à jour la CMDB locale
    async with AsyncSessionLocal() as db:
        for nb_dev in nb_devices:
            if not nb_dev.get("primary_ip"):
                continue

            ip = nb_dev["primary_ip"]["address"].split("/")[0]
            result = await db.execute(
                select(Device).where(Device.ip_address == ip)
            )
            device = result.scalar_one_or_none()
            if device:
                device.netbox_id = nb_dev["id"]
                device.vendor = nb_dev.get("manufacturer", {}).get("name") or device.vendor
                device.model = nb_dev.get("device_type", {}).get("model") or device.model
                device.rack = nb_dev.get("rack", {}).get("name") or device.rack
                device.rack_unit = nb_dev.get("position") or device.rack_unit
                synced += 1

        await db.commit()

    logger.info(f"NetBox sync completed: {synced} devices updated")
    return synced


@shared_task
def generate_sla_report():
    return run_async(_generate_sla_report())


async def _generate_sla_report():
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month = (month_start - timedelta(days=1)).replace(day=1)

    async with AsyncSessionLocal() as db:
        # Disponibilité des équipements critiques
        critical_devices = await db.execute(
            select(Device).where(Device.is_critical == True)
        )
        devices = critical_devices.scalars().all()

        # MTTR moyen du mois précédent
        mttr_result = await db.execute(
            select(func.avg(Incident.mttr_minutes), func.count())
            .where(
                and_(
                    Incident.resolved_at >= last_month,
                    Incident.resolved_at < month_start,
                    Incident.mttr_minutes.isnot(None),
                )
            )
        )
        mttr_row = mttr_result.one()

        # Alertes P1/P2 du mois
        p1p2_count = await db.execute(
            select(func.count()).select_from(Incident)
            .where(
                and_(
                    Incident.detected_at >= last_month,
                    Incident.detected_at < month_start,
                    Incident.severity.in_(["p1", "p2"]),
                )
            )
        )

        report = {
            "period": last_month.strftime("%B %Y"),
            "critical_devices": len(devices),
            "avg_mttr_minutes": round(mttr_row[0] or 0, 1),
            "total_incidents": mttr_row[1],
            "major_incidents_p1_p2": p1p2_count.scalar(),
            "generated_at": now.isoformat(),
        }

    logger.info(f"SLA report generated for {report['period']}: {report}")
    return report
