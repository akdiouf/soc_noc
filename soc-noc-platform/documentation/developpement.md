# Guide de Développement — SOC/NOC Platform

## Table des matières
1. [Stack technique](#1-stack-technique)
2. [Structure du projet](#2-structure-du-projet)
3. [Environnement de développement](#3-environnement-de-développement)
4. [Backend — FastAPI](#4-backend--fastapi)
5. [Frontend — React](#5-frontend--react)
6. [Base de données](#6-base-de-données)
7. [Tâches Celery](#7-tâches-celery)
8. [Collecteurs de données](#8-collecteurs-de-données)
9. [Conventions de code](#9-conventions-de-code)
10. [Tests](#10-tests)
11. [Ajouter une fonctionnalité — guide pas à pas](#11-ajouter-une-fonctionnalité--guide-pas-à-pas)

---

## 1. Stack technique

### Backend
| Composant | Technologie | Version |
|-----------|-------------|---------|
| Framework | FastAPI | 0.109 |
| ORM | SQLAlchemy (async) | 2.0.25 |
| Validation | Pydantic v2 | 2.5.3 |
| Serveur ASGI | Uvicorn | 0.27 |
| Task queue | Celery + Redis | 5.4 |
| BDD principale | PostgreSQL | 16 |
| Time-series | InfluxDB | 2.7 |
| Cache | Redis | 7 |
| Messaging | Kafka | 7.5 |

### Frontend
| Composant | Technologie | Version |
|-----------|-------------|---------|
| Framework | React | 18.2 |
| Langage | TypeScript | 5.3 |
| Build tool | Vite | 5.0 |
| Styles | TailwindCSS | 3.4 |
| State | TanStack Query + Zustand | 5.17 / 4.4 |
| Charts | Recharts | 2.10 |
| Icons | Lucide React | — |
| HTTP | Axios | — |
| WebSocket | Socket.io client | 4.6 |

---

## 2. Structure du projet

```
soc-noc-platform/
├── .env                          # Variables d'environnement
├── documentation/                # Cette documentation
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py               # Point d'entrée FastAPI, lifespan
│       ├── api/
│       │   └── v1/
│       │       ├── router.py     # Agrège tous les routers
│       │       └── endpoints/
│       │           ├── auth.py
│       │           ├── devices.py
│       │           ├── alerts.py
│       │           ├── incidents.py
│       │           ├── metrics.py
│       │           ├── websocket.py
│       │           └── threat_intelligence.py
│       ├── core/
│       │   ├── config.py         # Settings Pydantic (lecture .env)
│       │   ├── database.py       # Engine SQLAlchemy, sessions async
│       │   └── security.py       # JWT, bcrypt, dépendances FastAPI
│       ├── models/               # Tables SQLAlchemy
│       │   ├── alert.py
│       │   ├── device.py
│       │   ├── incident.py
│       │   ├── metric.py
│       │   ├── threat_intel.py
│       │   ├── topology.py
│       │   └── user.py
│       ├── schemas/              # Modèles Pydantic (request/response)
│       │   ├── alert.py
│       │   ├── device.py
│       │   ├── incident.py
│       │   ├── threat_intel.py
│       │   └── user.py
│       ├── services/             # Logique métier
│       │   ├── alert_service.py
│       │   ├── metrics_service.py
│       │   ├── misp_service.py
│       │   └── notification_service.py
│       ├── collectors/           # Collecteurs de données
│       │   ├── snmp_collector.py
│       │   ├── modbus_collector.py
│       │   ├── bacnet_collector.py
│       │   ├── syslog_collector.py
│       │   └── netflow_collector.py
│       └── tasks/                # Tâches Celery
│           ├── celery_app.py
│           ├── polling_tasks.py
│           ├── maintenance_tasks.py
│           └── misp_tasks.py
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── App.tsx               # Routes React
│       ├── types/index.ts        # Tous les types TypeScript
│       ├── services/api.ts       # Client HTTP Axios + toutes les fonctions API
│       ├── components/
│       │   └── layout/
│       │       ├── Sidebar.tsx
│       │       └── TopBar.tsx
│       └── pages/
│           ├── Dashboard.tsx
│           ├── DevicesPage.tsx
│           ├── AlertsPage.tsx
│           ├── IncidentsPage.tsx
│           ├── MetricsPage.tsx
│           ├── SettingsPage.tsx
│           ├── physical/
│           │   ├── PowerPage.tsx
│           │   ├── CoolingPage.tsx
│           │   └── AccessControlPage.tsx
│           └── soc/
│               ├── SecurityEventsPage.tsx
│               ├── SecurityIncidentsPage.tsx
│               └── ThreatIntelPage.tsx
│
└── docker/
    ├── docker-compose.yml
    ├── nginx/nginx.conf
    ├── prometheus/
    ├── grafana/
    ├── logstash/
    ├── wazuh/
    ├── thehive/
    └── cortex/
```

---

## 3. Environnement de développement

### Développement local sans Docker

#### Backend

```bash
cd backend

# Créer l'environnement virtuel
python3.12 -m venv .venv
source .venv/bin/activate   # Linux/Mac
# .venv\Scripts\activate    # Windows

# Installer les dépendances
pip install -r requirements.txt

# Configurer les variables d'environnement
export DATABASE_URL="postgresql+asyncpg://socnoc:password@localhost:5432/socnoc_db"
export REDIS_URL="redis://:password@localhost:6379/0"
export INFLUXDB_URL="http://localhost:8086"
export SECRET_KEY="dev-secret-key-change-in-production"
export KAFKA_BOOTSTRAP_SERVERS="localhost:29092"

# Démarrer le serveur de développement (rechargement automatique)
uvicorn app.main:app --reload --port 8000
```

#### Frontend

```bash
cd frontend

npm install

# Créer .env.local pour pointer vers le backend local
echo "VITE_API_URL=http://localhost:8000/api/v1" > .env.local

# Démarrer le serveur de développement
npm run dev
# Accessible sur http://localhost:5173
```

### Développement avec Docker (recommandé)

```bash
cd docker/

# Démarrer uniquement l'infrastructure
docker compose up -d postgres redis influxdb kafka zookeeper elasticsearch

# Le backend en mode dev avec rechargement automatique
docker compose up backend
# Le code dans ../backend/app est monté en volume → rechargement auto

# Frontend en mode dev (hors Docker, plus rapide)
cd ../frontend && npm run dev
```

---

## 4. Backend — FastAPI

### Ajouter un endpoint

**Exemple : créer `GET /api/v1/devices/{id}/history`**

#### 1. Créer le schéma Pydantic

```python
# backend/app/schemas/device.py
class DeviceHistoryResponse(BaseModel):
    device_id: UUID
    entries: list[dict]
    model_config = {"from_attributes": True}
```

#### 2. Ajouter l'endpoint

```python
# backend/app/api/v1/endpoints/devices.py
@router.get("/{device_id}/history")
async def get_device_history(
    device_id: UUID,
    hours: int = Query(24, ge=1, le=720),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # logique ici
    return {"device_id": device_id, "entries": []}
```

Le router est automatiquement inclus via `router.py` — aucun enregistrement supplémentaire n'est nécessaire.

### Pattern de dépendances FastAPI

```python
# Dépendances disponibles pour injection
db: AsyncSession = Depends(get_db)              # Session PostgreSQL async
current_user: User = Depends(get_current_user)  # Utilisateur connecté (JWT)
redis = Depends(get_redis)                       # Client Redis async
influxdb = Depends(get_influxdb)                 # Client InfluxDB async
```

### Authentification

Tous les endpoints (sauf `/auth/login` et `/health`) nécessitent un token JWT Bearer.

```python
# Restricter à un rôle spécifique
from app.models.user import UserRole

async def require_soc_manager(user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SOC_MANAGER]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user

@router.post("/sensitive-action")
async def sensitive(current_user: User = Depends(require_soc_manager)):
    ...
```

### Gestion des erreurs

```python
from fastapi import HTTPException, status

raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ressource non trouvée")
raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Conflit de données")
raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Service externe indisponible")
```

### Documentation API interactive

Disponible en développement : http://localhost:8000/docs (Swagger UI)  
Alternative ReDoc : http://localhost:8000/redoc

---

## 5. Frontend — React

### Ajouter une page

#### 1. Créer le composant de page

```tsx
// frontend/src/pages/mon-module/MaPage.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { monApi } from "../../services/api";

export function MaPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["ma-donnee"],
    queryFn: monApi.list,
  });

  if (isLoading) return <div className="p-6">Chargement...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Ma Page</h1>
      {/* contenu */}
    </div>
  );
}
```

#### 2. Ajouter la route dans App.tsx

```tsx
// App.tsx
import { MaPage } from "./pages/mon-module/MaPage";

// Dans <Routes> :
<Route path="/mon-module" element={<MaPage />} />
```

#### 3. Ajouter la navigation dans Sidebar.tsx

```tsx
// Dans NAV_ITEMS, dans la section appropriée :
{ to: "/mon-module", icon: MonIcone, label: "Mon Module" }
```

### Pattern de requête avec TanStack Query

```tsx
// Lecture (GET)
const { data, isLoading, error } = useQuery({
  queryKey: ["alerts", { severity, status, page }],  // clé unique incluant les filtres
  queryFn: () => alerts.list({ severity, status, page }),
  refetchInterval: 30_000,  // rafraîchir toutes les 30s
});

// Mutation (POST/PUT/DELETE)
const mutation = useMutation({
  mutationFn: (id: string) => alerts.acknowledge(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["alerts"] });  // invalider le cache
    toast.success("Alerte acquittée");
  },
  onError: () => toast.error("Erreur lors de l'acquittement"),
});
```

### Ajouter une fonction API

```typescript
// frontend/src/services/api.ts
export const monModule = {
  list: async (params?: { page?: number }): Promise<PaginatedResponse<MonType>> =>
    (await http.get("/mon-endpoint", { params })).data,

  create: async (payload: Partial<MonType>): Promise<MonType> =>
    (await http.post("/mon-endpoint", payload)).data,

  delete: async (id: string): Promise<void> =>
    void (await http.delete(`/mon-endpoint/${id}`)),
};
```

### Ajouter un type TypeScript

```typescript
// frontend/src/types/index.ts
export interface MonType {
  id: string;
  name: string;
  status: "active" | "inactive";
  created_at: string;
}
```

---

## 6. Base de données

### Ajouter un modèle SQLAlchemy

```python
# backend/app/models/mon_modele.py
import uuid
from sqlalchemy import Column, String, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base

class MonModele(Base):
    __tablename__ = "mon_modele"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nom = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

**Enregistrer dans `models/__init__.py` :**

```python
from app.models.mon_modele import MonModele
__all__ = [..., "MonModele"]
```

La table est créée automatiquement au démarrage grâce à `Base.metadata.create_all`.

### Requêtes SQLAlchemy async

```python
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

# SELECT
result = await db.execute(
    select(MonModele)
    .where(and_(MonModele.nom == "test", MonModele.actif == True))
    .order_by(MonModele.created_at.desc())
    .limit(50)
)
items = result.scalars().all()

# COUNT
total = (await db.execute(select(func.count()).select_from(MonModele))).scalar()

# INSERT
obj = MonModele(nom="nouveau")
db.add(obj)
await db.flush()        # valide sans commit (reste dans la transaction)
await db.refresh(obj)   # recharge l'objet depuis la BDD

# UPDATE
obj.nom = "modifié"
db.add(obj)

# DELETE
await db.execute(delete(MonModele).where(MonModele.id == some_id))

# Commit (géré automatiquement par get_db dans les endpoints)
await db.commit()
```

### InfluxDB — écrire des métriques

```python
from app.services.metrics_service import MetricsService

svc = MetricsService()
await svc.write_metric(
    device_id="uuid-here",
    device_name="sw-core-01",
    metric_name="cpu_usage",
    value=78.5,
    unit="%",
    tags={"site": "primary", "type": "switch"},
)
```

---

## 7. Tâches Celery

### Ajouter une tâche

```python
# backend/app/tasks/mes_taches.py
from celery import shared_task
import asyncio
from app.core.database import AsyncSessionLocal

def run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def ma_tache(self):
    return run_async(_ma_tache())

async def _ma_tache():
    async with AsyncSessionLocal() as db:
        # logique async ici
        pass
```

**Enregistrer dans `celery_app.py` :**

```python
include=["app.tasks.polling_tasks", "app.tasks.maintenance_tasks",
         "app.tasks.misp_tasks", "app.tasks.mes_taches"]

# Optionnel : planifier
beat_schedule={
    "ma-tache-periodique": {
        "task": "app.tasks.mes_taches.ma_tache",
        "schedule": crontab(hour=3, minute=0),  # 3h du matin
    },
}
```

### Déclencher une tâche manuellement depuis l'API

```python
from app.tasks.mes_taches import ma_tache
task = ma_tache.apply_async(countdown=0)
return {"task_id": task.id}
```

---

## 8. Collecteurs de données

### Architecture des collecteurs

Chaque collecteur est une classe async démarrée dans le `lifespan` de `main.py`.

```python
class MonCollecteur:
    def __init__(self, port: int):
        self.port = port
        self._running = False

    async def start(self):
        self._running = True
        asyncio.create_task(self._run())

    async def stop(self):
        self._running = False

    async def _run(self):
        while self._running:
            # logique de collecte
            await asyncio.sleep(1)
```

### Publier sur Kafka

```python
from aiokafka import AIOKafkaProducer
import json

producer = AIOKafkaProducer(bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS)
await producer.start()
await producer.send(
    settings.KAFKA_TOPIC_SECURITY,
    json.dumps({"type": "alert", "value": "..."}).encode()
)
```

---

## 9. Conventions de code

### Python (backend)

- **Style** : PEP 8, f-strings pour l'interpolation
- **Async** : toutes les fonctions I/O sont `async def`
- **Imports** : stdlib → third-party → local, séparés par une ligne vide
- **Nommage** : `snake_case` pour variables/fonctions, `PascalCase` pour classes
- **Pas de commentaires** sauf pour les WHY non-évidents
- **Validation** : Pydantic aux frontières (API), pas de validation défensive interne

```python
# Bien
async def get_active_alerts(db: AsyncSession, limit: int = 50) -> list[Alert]:
    result = await db.execute(
        select(Alert).where(Alert.status == AlertStatus.ACTIVE).limit(limit)
    )
    return result.scalars().all()

# À éviter
async def get_active_alerts(db, limit=50):
    # Cette fonction récupère les alertes actives
    if db is None:   # inutile, FastAPI garantit la session
        return []
    ...
```

### TypeScript (frontend)

- **Style** : ESLint + Prettier (config Vite par défaut)
- **Nommage** : `camelCase` variables, `PascalCase` composants, `SCREAMING_SNAKE` constantes
- **Types** : toujours typer explicitement les props et return types des fonctions
- **Composants** : functions nommées (pas d'arrow functions anonymes pour les composants)

```tsx
// Bien
interface Props {
  severity: AlertSeverity;
  onAcknowledge: (id: string) => void;
}

export function AlertBadge({ severity, onAcknowledge }: Props) {
  return <span className="...">{severity}</span>;
}
```

---

## 10. Tests

### Backend

```bash
cd backend

# Installer les dépendances de test
pip install pytest pytest-asyncio httpx

# Lancer les tests
pytest tests/ -v

# Avec couverture de code
pytest tests/ --cov=app --cov-report=html
```

Structure de test recommandée :

```python
# tests/test_alerts.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_list_alerts_requires_auth():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/v1/alerts")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_list_alerts_with_auth(auth_headers):
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/v1/alerts", headers=auth_headers)
    assert response.status_code == 200
    assert "items" in response.json()
```

### Frontend

```bash
cd frontend

npm test              # Vitest (si configuré)
npm run type-check    # Vérification des types TypeScript uniquement
npm run build         # Vérification de compilation + types
```

---

## 11. Ajouter une fonctionnalité — guide pas à pas

Exemple : ajouter un module "Rapports" avec une liste de rapports générés.

### Étape 1 — Modèle (backend)

```python
# backend/app/models/report.py
class Report(Base):
    __tablename__ = "reports"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(500))
    report_type = Column(String(100))
    content = Column(JSON)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
```

### Étape 2 — Schema (backend)

```python
# backend/app/schemas/report.py
class ReportResponse(BaseModel):
    id: UUID; title: str; report_type: str; generated_at: datetime
    model_config = {"from_attributes": True}
```

### Étape 3 — Endpoint (backend)

```python
# backend/app/api/v1/endpoints/reports.py
router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("", response_model=list[ReportResponse])
async def list_reports(db: AsyncSession = Depends(get_db), ...):
    ...
```

### Étape 4 — Enregistrer le router

```python
# backend/app/api/v1/router.py
from app.api.v1.endpoints import reports
api_router.include_router(reports.router)
```

### Étape 5 — Types TypeScript (frontend)

```typescript
// frontend/src/types/index.ts
export interface Report {
  id: string; title: string; report_type: string; generated_at: string;
}
```

### Étape 6 — API client (frontend)

```typescript
// frontend/src/services/api.ts
export const reports = {
  list: async (): Promise<Report[]> => (await http.get("/reports")).data,
};
```

### Étape 7 — Page React (frontend)

```tsx
// frontend/src/pages/ReportsPage.tsx
export function ReportsPage() { ... }
```

### Étape 8 — Route + Navigation

```tsx
// App.tsx : <Route path="/reports" element={<ReportsPage />} />
// Sidebar.tsx : { to: "/reports", icon: FileBarChart, label: "Rapports" }
```
