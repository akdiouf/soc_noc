import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from app.core.config import settings
from app.core.database import engine, Base, close_redis
from app.api.v1.router import api_router
from app.collectors.syslog_collector import SyslogServer
from app.collectors.netflow_collector import NetFlowCollector
from app.api.v1.endpoints.websocket import start_kafka_broadcaster, stop_kafka_broadcaster

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_syslog_server: SyslogServer | None = None
_netflow_collector: NetFlowCollector | None = None


async def _seed_admin() -> None:
    from sqlalchemy import select, func
    from sqlalchemy.exc import IntegrityError
    from app.core.database import AsyncSessionLocal as async_session_factory
    from app.core.security import get_password_hash
    from app.models.user import User, UserRole

    async with async_session_factory() as session:
        count = await session.scalar(select(func.count()).select_from(User))
        if count:
            return
        admin = User(
            username=settings.FIRST_SUPERUSER_USERNAME,
            email=settings.FIRST_SUPERUSER_EMAIL,
            full_name=settings.FIRST_SUPERUSER_FULLNAME,
            hashed_password=get_password_hash(settings.FIRST_SUPERUSER_PASSWORD),
            role=UserRole.SUPER_ADMIN,
            is_active=True,
            is_verified=True,
        )
        session.add(admin)
        try:
            await session.commit()
            logger.info(
                "Super-admin créé : username=%s", settings.FIRST_SUPERUSER_USERNAME
            )
        except IntegrityError:
            await session.rollback()
            logger.info("Super-admin already exists, skipping seed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _syslog_server, _netflow_collector

    # Créer les tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created")

    # Créer le super-admin initial si aucun utilisateur n'existe
    await _seed_admin()
    logger.info("Admin seeding done")

    # Démarrer le serveur Syslog
    try:
        _syslog_server = SyslogServer(
            udp_port=settings.SYSLOG_UDP_PORT,
            tcp_port=settings.SYSLOG_TCP_PORT,
        )
        await _syslog_server.start()
        logger.info("Syslog server started")
    except Exception as exc:
        logger.warning("Syslog server could not start: %s", exc)
        _syslog_server = None

    # Démarrer le collecteur NetFlow
    try:
        _netflow_collector = NetFlowCollector(port=settings.NETFLOW_PORT)
        await _netflow_collector.start()
        logger.info("NetFlow collector started")
    except Exception as exc:
        logger.warning("NetFlow collector could not start: %s", exc)
        _netflow_collector = None

    # Démarrer le broadcaster WebSocket (consomme Kafka → clients WS)
    try:
        await start_kafka_broadcaster()
        logger.info("WebSocket Kafka broadcaster started")
    except Exception as exc:
        logger.warning("WebSocket Kafka broadcaster could not start: %s", exc)

    yield

    # Arrêt propre
    await stop_kafka_broadcaster()
    if _syslog_server:
        await _syslog_server.stop()
    if _netflow_collector:
        await _netflow_collector.stop()
    await close_redis()
    await engine.dispose()
    logger.info("Application shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="""
## SOC/NOC Platform API

Plateforme complète de supervision et sécurité pour datacenter.

### Fonctionnalités
- **NOC** : Monitoring des équipements réseau, serveurs, UPS, PDU, climatiseurs
- **SOC** : SIEM, gestion des incidents de sécurité, corrélation d'événements
- **Alertes** : Temps réel avec escalade multi-canaux (Email, Slack, Teams, PagerDuty)
- **Collecte** : SNMP v1/v2c/v3, Modbus TCP, BACnet/IP, Syslog, NetFlow
- **CMDB** : Inventaire des équipements avec intégration NetBox
    """,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(api_router)


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
    }


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
    }
