"""
Notification Service — Email, Slack, Teams, SMS, PagerDuty
"""
import logging
import aiohttp
import aiosmtplib
from email.message import EmailMessage
from typing import Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

SEVERITY_EMOJI = {
    "info": "ℹ️",
    "warning": "⚠️",
    "critical": "🔴",
    "emergency": "🚨",
}

SEVERITY_COLOR = {
    "info": "#36a64f",
    "warning": "#ff9000",
    "critical": "#ff0000",
    "emergency": "#7b0000",
}


class NotificationService:
    async def send(self, alert) -> bool:
        results = []

        if settings.SMTP_HOST and settings.ALERT_EMAIL_TO:
            results.append(await self._send_email(alert))

        if settings.SLACK_WEBHOOK_URL:
            results.append(await self._send_slack(alert))

        if settings.TEAMS_WEBHOOK_URL:
            results.append(await self._send_teams(alert))

        if settings.PAGERDUTY_SERVICE_KEY and alert.severity.value in ("critical", "emergency"):
            results.append(await self._send_pagerduty(alert))

        return all(results)

    async def _send_email(self, alert) -> bool:
        try:
            emoji = SEVERITY_EMOJI.get(alert.severity.value, "⚠️")
            msg = EmailMessage()
            msg["From"] = settings.ALERT_EMAIL_FROM
            msg["To"] = ", ".join(settings.ALERT_EMAIL_TO)
            msg["Subject"] = f"{emoji} [{alert.severity.value.upper()}] {alert.title}"
            msg.set_content(
                f"ALERTE SOC/NOC\n\n"
                f"Titre : {alert.title}\n"
                f"Sévérité : {alert.severity.value.upper()}\n"
                f"Catégorie : {alert.category.value}\n"
                f"Source : {alert.source_name or alert.source_ip or 'N/A'}\n"
                f"Métrique : {alert.metric_name} = {alert.metric_value} {alert.metric_unit or ''}\n"
                f"Message : {alert.message}\n"
                f"Heure : {alert.first_seen}\n"
                f"\nConnectez-vous au portail NOC pour plus de détails."
            )
            async with aiosmtplib.SMTP(
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                use_tls=False,
                start_tls=True,
            ) as smtp:
                if settings.SMTP_USER:
                    await smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                await smtp.send_message(msg)
            return True
        except Exception as e:
            logger.error(f"Email notification failed: {e}")
            return False

    async def _send_slack(self, alert) -> bool:
        try:
            color = SEVERITY_COLOR.get(alert.severity.value, "#ff9000")
            emoji = SEVERITY_EMOJI.get(alert.severity.value, "⚠️")
            payload = {
                "attachments": [{
                    "color": color,
                    "title": f"{emoji} {alert.title}",
                    "fields": [
                        {"title": "Sévérité", "value": alert.severity.value.upper(), "short": True},
                        {"title": "Catégorie", "value": alert.category.value, "short": True},
                        {"title": "Source", "value": alert.source_name or alert.source_ip or "N/A", "short": True},
                        {"title": "Métrique", "value": f"{alert.metric_name}: {alert.metric_value}", "short": True},
                    ],
                    "text": alert.message,
                    "footer": "SOC/NOC Platform",
                    "ts": int(alert.first_seen.timestamp()) if alert.first_seen else 0,
                }]
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(settings.SLACK_WEBHOOK_URL, json=payload) as resp:
                    return resp.status == 200
        except Exception as e:
            logger.error(f"Slack notification failed: {e}")
            return False

    async def _send_teams(self, alert) -> bool:
        try:
            color = SEVERITY_COLOR.get(alert.severity.value, "FF9000").replace("#", "")
            payload = {
                "@type": "MessageCard",
                "@context": "http://schema.org/extensions",
                "themeColor": color,
                "summary": alert.title,
                "sections": [{
                    "activityTitle": f"**{alert.title}**",
                    "activitySubtitle": f"Sévérité: {alert.severity.value.upper()}",
                    "facts": [
                        {"name": "Catégorie", "value": alert.category.value},
                        {"name": "Source", "value": alert.source_name or alert.source_ip or "N/A"},
                        {"name": "Métrique", "value": f"{alert.metric_name}: {alert.metric_value} {alert.metric_unit or ''}"},
                        {"name": "Message", "value": alert.message},
                    ],
                }],
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(settings.TEAMS_WEBHOOK_URL, json=payload) as resp:
                    return resp.status in (200, 202)
        except Exception as e:
            logger.error(f"Teams notification failed: {e}")
            return False

    async def _send_pagerduty(self, alert) -> bool:
        try:
            payload = {
                "routing_key": settings.PAGERDUTY_SERVICE_KEY,
                "event_action": "trigger",
                "payload": {
                    "summary": alert.title,
                    "severity": "critical" if alert.severity.value == "emergency" else alert.severity.value,
                    "source": alert.source_ip or alert.source_name or "SOC/NOC",
                    "custom_details": {
                        "message": alert.message,
                        "metric": alert.metric_name,
                        "value": alert.metric_value,
                        "category": alert.category.value,
                    },
                },
                "dedup_key": alert.correlation_id,
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://events.pagerduty.com/v2/enqueue",
                    json=payload,
                ) as resp:
                    return resp.status == 202
        except Exception as e:
            logger.error(f"PagerDuty notification failed: {e}")
            return False

    async def send_recovery(self, alert) -> bool:
        """Notifie la résolution d'une alerte."""
        if settings.SLACK_WEBHOOK_URL:
            payload = {
                "attachments": [{
                    "color": "#36a64f",
                    "title": f"✅ RÉSOLU: {alert.title}",
                    "text": f"Alerte résolue. Durée: {self._duration(alert)}",
                    "footer": "SOC/NOC Platform",
                }]
            }
            try:
                async with aiohttp.ClientSession() as session:
                    await session.post(settings.SLACK_WEBHOOK_URL, json=payload)
            except Exception as e:
                logger.error(f"Recovery notification failed: {e}")
        return True

    def _duration(self, alert) -> str:
        if alert.first_seen and alert.resolved_at:
            delta = alert.resolved_at - alert.first_seen
            minutes = int(delta.total_seconds() / 60)
            if minutes < 60:
                return f"{minutes} min"
            hours = minutes // 60
            return f"{hours}h{minutes % 60}min"
        return "N/A"
