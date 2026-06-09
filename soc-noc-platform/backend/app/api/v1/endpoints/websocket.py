"""
WebSocket endpoint — push des alertes et métriques en temps réel vers le frontend
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from aiokafka import AIOKafkaConsumer
from app.core.config import settings
from app.core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["WebSocket"])


class ConnectionManager:
    def __init__(self):
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)
        logger.info(f"WebSocket connected. Total: {len(self._connections)}")

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self._connections.discard(ws)
        logger.info(f"WebSocket disconnected. Total: {len(self._connections)}")

    async def broadcast(self, message: dict):
        if not self._connections:
            return
        data = json.dumps(message, default=str)
        dead = set()
        async with self._lock:
            connections = list(self._connections)
        for ws in connections:
            try:
                await ws.send_text(data)
            except Exception:
                dead.add(ws)
        if dead:
            async with self._lock:
                self._connections -= dead

    async def send_personal(self, ws: WebSocket, message: dict):
        try:
            await ws.send_text(json.dumps(message, default=str))
        except Exception as e:
            logger.error(f"WebSocket send error: {e}")


manager = ConnectionManager()

# Tâche de fond qui consomme Kafka et broadcast aux clients WS
_kafka_task: asyncio.Task | None = None


async def _kafka_consumer_task():
    consumer = AIOKafkaConsumer(
        settings.KAFKA_TOPIC_ALERTS,
        settings.KAFKA_TOPIC_METRICS,
        settings.KAFKA_TOPIC_SECURITY,
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        group_id="ws-broadcaster",
        auto_offset_reset="latest",
        value_deserializer=lambda v: json.loads(v.decode()),
    )
    try:
        await consumer.start()
        logger.info("Kafka consumer for WebSocket started")
        async for msg in consumer:
            event_type = {
                settings.KAFKA_TOPIC_ALERTS: "alert",
                settings.KAFKA_TOPIC_METRICS: "metric",
                settings.KAFKA_TOPIC_SECURITY: "security_event",
            }.get(msg.topic, "event")

            await manager.broadcast({
                "type": event_type,
                "topic": msg.topic,
                "data": msg.value,
                "ts": datetime.utcnow().isoformat(),
            })
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"Kafka consumer error: {e}")
    finally:
        await consumer.stop()


async def start_kafka_broadcaster():
    global _kafka_task
    if _kafka_task is None or _kafka_task.done():
        _kafka_task = asyncio.create_task(_kafka_consumer_task())


async def stop_kafka_broadcaster():
    global _kafka_task
    if _kafka_task and not _kafka_task.done():
        _kafka_task.cancel()
        try:
            await _kafka_task
        except asyncio.CancelledError:
            pass


@router.websocket("/alerts")
async def alerts_ws(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
):
    # Valider le token sans FastAPI Depends (WebSocket n'accepte pas Depends directement)
    from jose import JWTError, jwt
    from app.core.config import settings as cfg
    try:
        payload = jwt.decode(token, cfg.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "access":
            await websocket.close(code=4001)
            return
    except JWTError:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket)
    try:
        # Envoyer un message de bienvenue avec l'état actuel
        await manager.send_personal(websocket, {
            "type": "connected",
            "message": "Connecté au flux temps réel SOC/NOC",
            "ts": datetime.utcnow().isoformat(),
        })

        # Maintenir la connexion (ping/pong)
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if data == "ping":
                    await manager.send_personal(websocket, {"type": "pong"})
            except asyncio.TimeoutError:
                # Envoyer un heartbeat
                await manager.send_personal(websocket, {
                    "type": "heartbeat",
                    "ts": datetime.utcnow().isoformat(),
                })
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)


@router.websocket("/metrics/{device_id}")
async def device_metrics_ws(
    websocket: WebSocket,
    device_id: str,
    token: str = Query(...),
    interval: int = Query(5, ge=1, le=60),
):
    """Stream des métriques temps réel pour un équipement spécifique."""
    from jose import JWTError, jwt
    from app.core.config import settings as cfg
    from app.services.metrics_service import MetricsService

    try:
        payload = jwt.decode(token, cfg.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "access":
            await websocket.close(code=4001)
            return
    except JWTError:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    svc = MetricsService()

    try:
        while True:
            metrics_to_stream = ["cpu_percent", "memory_percent", "temperature", "battery_charge"]
            payload_data = {"type": "metrics", "device_id": device_id, "values": {}}

            for metric in metrics_to_stream:
                value = await svc.get_current_value(device_id, metric)
                if value is not None:
                    payload_data["values"][metric] = round(value, 2)

            payload_data["ts"] = datetime.utcnow().isoformat()
            await websocket.send_text(json.dumps(payload_data))
            await asyncio.sleep(interval)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Device metrics WS error: {e}")
