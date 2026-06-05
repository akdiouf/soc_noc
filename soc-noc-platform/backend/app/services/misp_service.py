"""
MISP Threat Intelligence service — wraps PyMISP for async use and manages the local IOC cache.
"""
import asyncio
import logging
from datetime import datetime, timedelta
from functools import partial
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    from pymisp import PyMISP
    PYMISP_AVAILABLE = True
except ImportError:
    PYMISP_AVAILABLE = False
    logger.warning("pymisp not installed — MISP integration disabled")


TLP_MAP = {
    "tlp:white": "white",
    "tlp:green": "green",
    "tlp:amber": "amber",
    "tlp:red": "red",
}

THREAT_LEVEL_LABELS = {1: "High", 2: "Medium", 3: "Low", 4: "Undefined"}


class MISPService:
    _client: Optional[Any] = None

    def _get_client(self) -> Any:
        if not PYMISP_AVAILABLE:
            raise RuntimeError("pymisp package is not installed")
        if not settings.MISP_URL or not settings.MISP_API_KEY:
            raise RuntimeError("MISP_URL or MISP_API_KEY not configured")
        if self._client is None:
            self._client = PyMISP(
                url=settings.MISP_URL,
                key=settings.MISP_API_KEY,
                ssl=settings.MISP_VERIFY_CERT,
                timeout=30,
            )
        return self._client

    async def _run(self, fn, *args, **kwargs):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, partial(fn, *args, **kwargs))

    # ── Status ──────────────────────────────────────────────────────────────────

    async def get_status(self) -> Dict[str, Any]:
        if not PYMISP_AVAILABLE or not settings.MISP_URL or not settings.MISP_API_KEY:
            return {
                "connected": False,
                "url": settings.MISP_URL or "",
                "error": "MISP not configured",
            }
        try:
            misp = self._get_client()
            # version() is a lightweight call
            info = await self._run(misp.get_version)
            return {
                "connected": True,
                "url": settings.MISP_URL,
                "version": info.get("version"),
                "organization": settings.MISP_ORG,
            }
        except Exception as exc:
            self._client = None  # reset so next call retries
            return {"connected": False, "url": settings.MISP_URL, "error": str(exc)}

    # ── IOC Lookup ──────────────────────────────────────────────────────────────

    async def search_attribute(
        self,
        value: str,
        ioc_type: Optional[str] = None,
    ) -> List[Dict]:
        """Real-time search in MISP for a given value."""
        try:
            misp = self._get_client()
            params: Dict[str, Any] = {"value": value, "pythonify": True, "limit": 50}
            if ioc_type:
                params["type_attribute"] = ioc_type
            results = await self._run(misp.search, controller="attributes", **params)
            return [a.to_dict() for a in (results or [])]
        except Exception as exc:
            logger.error("MISP attribute search failed: %s", exc)
            return []

    # ── Sync ────────────────────────────────────────────────────────────────────

    async def fetch_attributes(self, days: int = 30) -> Tuple[int, List[Dict]]:
        """
        Pull IDS-flagged attributes from the last `days` days.
        Returns (count, list_of_attribute_dicts).
        """
        try:
            misp = self._get_client()
            since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
            attrs = await self._run(
                misp.search,
                controller="attributes",
                date_from=since,
                to_ids=True,
                pythonify=True,
                limit=10000,
            )
            dicts = [a.to_dict() for a in (attrs or [])]
            return len(dicts), dicts
        except Exception as exc:
            logger.error("MISP fetch_attributes failed: %s", exc)
            return 0, []

    async def fetch_events(self, days: int = 7) -> List[Dict]:
        """Fetch recent MISP events (metadata only)."""
        try:
            misp = self._get_client()
            since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
            events = await self._run(
                misp.search,
                controller="events",
                date_from=since,
                pythonify=True,
                limit=200,
            )
            out = []
            for e in (events or []):
                d = e.to_dict()
                event = d.get("Event", d)
                tags = [t.get("name", "") for t in event.get("Tag", [])]
                out.append({
                    "event_id": int(event.get("id", 0)),
                    "uuid": event.get("uuid", ""),
                    "title": event.get("info", ""),
                    "org": event.get("Orgc", {}).get("name") if event.get("Orgc") else None,
                    "threat_level": int(event.get("threat_level_id", 4)),
                    "attribute_count": int(event.get("attribute_count", 0)),
                    "tags": tags,
                    "date": event.get("date"),
                })
            return out
        except Exception as exc:
            logger.error("MISP fetch_events failed: %s", exc)
            return []

    # ── Helpers ─────────────────────────────────────────────────────────────────

    @staticmethod
    def extract_tlp(tags: List[str]) -> str:
        for tag in tags:
            normalized = tag.lower().replace(" ", "")
            if normalized in TLP_MAP:
                return TLP_MAP[normalized]
        return "white"


misp_service = MISPService()
