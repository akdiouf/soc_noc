from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "socnoc",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.polling_tasks",
        "app.tasks.maintenance_tasks",
        "app.tasks.misp_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    result_expires=3600,
    beat_schedule={
        # Polling SNMP toutes les minutes
        "poll-snmp-devices": {
            "task": "app.tasks.polling_tasks.poll_all_snmp_devices",
            "schedule": 60.0,
        },
        # Polling Modbus toutes les 30 secondes
        "poll-modbus-devices": {
            "task": "app.tasks.polling_tasks.poll_all_modbus_devices",
            "schedule": 30.0,
        },
        # Polling BACnet toutes les 60 secondes
        "poll-bacnet-devices": {
            "task": "app.tasks.polling_tasks.poll_all_bacnet_devices",
            "schedule": 60.0,
        },
        # Vérification ICMP (ping) toutes les 30 secondes
        "check-device-reachability": {
            "task": "app.tasks.polling_tasks.check_all_devices_reachability",
            "schedule": 30.0,
        },
        # Nettoyage des alertes résolues > 30 jours
        "cleanup-old-alerts": {
            "task": "app.tasks.maintenance_tasks.cleanup_old_alerts",
            "schedule": crontab(hour=2, minute=0),  # 2h du matin
        },
        # Rapport journalier
        "daily-report": {
            "task": "app.tasks.maintenance_tasks.send_daily_report",
            "schedule": crontab(hour=8, minute=0),  # 8h du matin
        },
        # Synchronisation CMDB NetBox
        "sync-netbox": {
            "task": "app.tasks.maintenance_tasks.sync_netbox_inventory",
            "schedule": crontab(minute=0, hour="*/4"),  # toutes les 4h
        },
        # Rapport mensuel SLA
        "monthly-sla-report": {
            "task": "app.tasks.maintenance_tasks.generate_sla_report",
            "schedule": crontab(day_of_month=1, hour=6, minute=0),
        },
        # Synchronisation MISP (IOC feeds) toutes les 6h
        "sync-misp-iocs": {
            "task": "app.tasks.misp_tasks.sync_misp_iocs",
            "schedule": crontab(minute=0, hour="*/6"),
        },
    },
)
