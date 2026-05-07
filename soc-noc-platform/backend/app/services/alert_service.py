"""
Alert Service — création, corrélation et notification des alertes
"""
import logging
import hashlib
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from app.models.alert import Alert, AlertSeverity, AlertStatus, AlertCategory
from app.models.device import Device
from app.services.notification_service import NotificationService
from app.core.config import settings

logger = logging.getLogger(__name__)


def _make_correlation_id(device_id: str, metric_name: str, category: str) -> str:
    key = f"{device_id}:{metric_name}:{category}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


class AlertService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.notifications = NotificationService()

    async def create_or_update(
        self,
        title: str,
        message: str,
        severity: AlertSeverity,
        category: AlertCategory,
        device_id: Optional[UUID] = None,
        source_ip: Optional[str] = None,
        source_name: Optional[str] = None,
        metric_name: Optional[str] = None,
        metric_value: Optional[float] = None,
        metric_unit: Optional[str] = None,
        threshold_value: Optional[float] = None,
        raw_data: Optional[dict] = None,
        tags: Optional[list] = None,
    ) -> Alert:
        correlation_id = _make_correlation_id(
            str(device_id or source_ip or "global"),
            metric_name or title,
            category.value,
        )

        # Chercher une alerte active similaire pour déduplication
        existing = await self._find_active(correlation_id)

        if existing:
            existing.occurrence_count += 1
            existing.last_seen = datetime.utcnow()
            existing.metric_value = metric_value
            if severity.value > existing.severity.value:
                existing.severity = severity
            await self.db.flush()
            logger.debug(f"Alert deduplicated: {correlation_id} (#{existing.occurrence_count})")
            return existing

        alert = Alert(
            title=title,
            message=message,
            severity=severity,
            category=category,
            device_id=device_id,
            source_ip=source_ip,
            source_name=source_name,
            metric_name=metric_name,
            metric_value=metric_value,
            metric_unit=metric_unit,
            threshold_value=threshold_value,
            correlation_id=correlation_id,
            raw_data=raw_data or {},
            tags=tags or [],
        )
        self.db.add(alert)
        await self.db.flush()

        await self._send_notifications(alert)
        return alert

    async def acknowledge(self, alert_id: UUID, user_id: UUID, note: str = "") -> Alert:
        alert = await self._get(alert_id)
        if not alert:
            raise ValueError(f"Alert {alert_id} not found")
        alert.status = AlertStatus.ACKNOWLEDGED
        alert.acknowledged_by = user_id
        alert.acknowledged_at = datetime.utcnow()
        if note:
            alert.resolution_note = note
        await self.db.flush()
        return alert

    async def resolve(self, alert_id: UUID, user_id: UUID, note: str = "") -> Alert:
        alert = await self._get(alert_id)
        if not alert:
            raise ValueError(f"Alert {alert_id} not found")
        alert.status = AlertStatus.RESOLVED
        alert.resolved_by = user_id
        alert.resolved_at = datetime.utcnow()
        if note:
            alert.resolution_note = note
        await self.db.flush()
        return alert

    async def auto_resolve(self, device_id: UUID, metric_name: str, category: AlertCategory):
        """Résout automatiquement les alertes quand la condition disparaît."""
        stmt = select(Alert).where(
            and_(
                Alert.device_id == device_id,
                Alert.metric_name == metric_name,
                Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
            )
        )
        result = await self.db.execute(stmt)
        alerts = result.scalars().all()

        for alert in alerts:
            alert.status = AlertStatus.RESOLVED
            alert.resolved_at = datetime.utcnow()
            alert.resolution_note = "Résolution automatique — condition normalisée"

        if alerts:
            await self.db.flush()
            logger.info(f"Auto-resolved {len(alerts)} alerts for device {device_id} metric {metric_name}")

    async def check_threshold(
        self,
        device: Device,
        metric_name: str,
        value: float,
        unit: str = "",
    ) -> Optional[Alert]:
        """Vérifie une valeur contre les seuils configurés et crée une alerte si nécessaire."""
        from app.models.metric import MetricThreshold
        from sqlalchemy import and_

        stmt = select(MetricThreshold).where(
            and_(
                MetricThreshold.device_id == device.id,
                MetricThreshold.metric_name == metric_name,
                MetricThreshold.is_active == True,
            )
        )
        result = await self.db.execute(stmt)
        threshold = result.scalar_one_or_none()

        if not threshold:
            threshold = self._default_threshold(metric_name)
            if not threshold:
                return None

        severity = self._evaluate_threshold(value, threshold)
        if severity is None:
            await self.auto_resolve(device.id, metric_name, AlertCategory.PERFORMANCE)
            return None

        return await self.create_or_update(
            title=f"{device.name} — {metric_name} {severity.value.upper()}",
            message=f"{metric_name} = {value}{unit} (seuil {severity.value}: {threshold.get(severity.value)})",
            severity=severity,
            category=AlertCategory.PERFORMANCE,
            device_id=device.id,
            source_name=device.name,
            metric_name=metric_name,
            metric_value=value,
            metric_unit=unit,
        )

    def _evaluate_threshold(self, value: float, threshold) -> Optional[AlertSeverity]:
        if hasattr(threshold, "emergency_value") and threshold.emergency_value and value >= threshold.emergency_value:
            return AlertSeverity.EMERGENCY
        if hasattr(threshold, "critical_value") and threshold.critical_value and value >= threshold.critical_value:
            return AlertSeverity.CRITICAL
        if hasattr(threshold, "warning_value") and threshold.warning_value and value >= threshold.warning_value:
            return AlertSeverity.WARNING
        return None

    def _default_threshold(self, metric_name: str) -> Optional[object]:
        defaults = {
            "cpu_percent": {"warning_value": settings.CPU_WARN_THRESHOLD, "critical_value": settings.CPU_CRIT_THRESHOLD},
            "memory_percent": {"warning_value": settings.MEMORY_WARN_THRESHOLD, "critical_value": settings.MEMORY_CRIT_THRESHOLD},
            "disk_percent": {"warning_value": settings.DISK_WARN_THRESHOLD, "critical_value": settings.DISK_CRIT_THRESHOLD},
            "temperature": {"warning_value": settings.TEMPERATURE_WARN_THRESHOLD, "critical_value": settings.TEMPERATURE_CRIT_THRESHOLD},
            "battery_charge": {"warning_value": 30.0, "critical_value": 15.0},
        }

        class _T:
            def __init__(self, d):
                self.__dict__.update(d)
            emergency_value = None

        return _T(defaults[metric_name]) if metric_name in defaults else None

    async def _find_active(self, correlation_id: str) -> Optional[Alert]:
        cutoff = datetime.utcnow() - timedelta(hours=24)
        stmt = select(Alert).where(
            and_(
                Alert.correlation_id == correlation_id,
                Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
                Alert.last_seen >= cutoff,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _get(self, alert_id: UUID) -> Optional[Alert]:
        result = await self.db.execute(select(Alert).where(Alert.id == alert_id))
        return result.scalar_one_or_none()

    async def _send_notifications(self, alert: Alert):
        try:
            await self.notifications.send(alert)
            alert.notification_sent = True
        except Exception as e:
            logger.error(f"Notification failed for alert {alert.id}: {e}")
