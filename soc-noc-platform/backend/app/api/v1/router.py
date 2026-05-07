from fastapi import APIRouter
from app.api.v1.endpoints import auth, devices, alerts, incidents, metrics, websocket

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(devices.router)
api_router.include_router(alerts.router)
api_router.include_router(incidents.router)
api_router.include_router(metrics.router)
api_router.include_router(websocket.router)
