# Guide d'Administration — SOC/NOC Platform

## Table des matières
1. [Prérequis](#1-prérequis)
2. [Déploiement initial](#2-déploiement-initial)
3. [Architecture des services](#3-architecture-des-services)
4. [Gestion des services Docker](#4-gestion-des-services-docker)
5. [Gestion des utilisateurs](#5-gestion-des-utilisateurs)
6. [Configuration](#6-configuration)
7. [Réseau et ports](#7-réseau-et-ports)
8. [Sauvegardes](#8-sauvegardes)
9. [Mise à jour](#9-mise-à-jour)
10. [Sécurité](#10-sécurité)
11. [Tâches planifiées](#11-tâches-planifiées)

---

## 1. Prérequis

| Composant | Version minimale |
|-----------|-----------------|
| Docker Engine | 24.x |
| Docker Compose | v2.20+ |
| RAM | 16 Go (32 Go recommandés) |
| CPU | 8 cœurs |
| Disque | 100 Go SSD |
| OS | Ubuntu 22.04 / Debian 12 / RHEL 9 |

```bash
# Vérifier les versions
docker --version
docker compose version
```

---

## 2. Déploiement initial

### 2.1 Cloner et configurer

```bash
git clone <repo_url> soc-noc-platform
cd soc-noc-platform

# Copier et adapter le fichier d'environnement
cp .env.example .env
nano .env   # ou vim .env
```

### 2.2 Fichier `.env` — variables obligatoires

```env
POSTGRES_PASSWORD=<mot_de_passe_fort>
INFLUXDB_PASSWORD=<mot_de_passe_fort>
INFLUXDB_TOKEN=<token_64_chars>
REDIS_PASSWORD=<mot_de_passe_fort>
SECRET_KEY=<clé_JWT_64_chars>

FIRST_SUPERUSER_USERNAME=admin
FIRST_SUPERUSER_EMAIL=admin@votre-domaine.local
FIRST_SUPERUSER_PASSWORD=<mot_de_passe_fort>

# MISP (à renseigner après le 1er démarrage)
MISP_MYSQL_ROOT_PASSWORD=<mot_de_passe_fort>
MISP_MYSQL_PASSWORD=<mot_de_passe_fort>
MISP_ADMIN_PASSWORD=<mot_de_passe_fort>
MISP_API_KEY=    # vide au départ
```

### 2.3 Premier démarrage

```bash
cd docker/

# Démarrer les services d'infrastructure en premier
docker compose up -d postgres redis influxdb kafka zookeeper elasticsearch

# Attendre que les bases soient prêtes (~30s)
docker compose ps

# Démarrer tous les services
docker compose up -d

# Vérifier les logs du backend
docker compose logs -f backend
```

### 2.4 Initialisation de MISP

MISP nécessite un démarrage initial plus long (~3-5 min) :

```bash
# Surveiller l'initialisation
docker compose logs -f misp

# Une fois MISP opérationnel, récupérer la clé API
# 1. Ouvrir http://localhost:8081
# 2. Se connecter : admin@socnoc.local / MISPAdmin@2024
# 3. Administration → Auth keys → Ajouter
# 4. Copier la clé dans .env : MISP_API_KEY=<clé>
# 5. Redémarrer le backend
docker compose restart backend celery-worker celery-beat
```

---

## 3. Architecture des services

```
172.20.0.0/16 — réseau soc_noc_net
│
├── 172.20.0.10  postgres          PostgreSQL 16       (port 5432)
├── 172.20.0.11  influxdb          InfluxDB 2.7        (port 8086)
├── 172.20.0.12  redis             Redis 7             (interne)
├── 172.20.0.13  zookeeper         Zookeeper           (interne)
├── 172.20.0.14  kafka             Kafka               (port 29092)
│
├── 172.20.0.20  elasticsearch     Elasticsearch 8.11  (interne)
├── 172.20.0.21  logstash          Logstash 8.11       (port 5800)
├── 172.20.0.22  kibana            Kibana 8.11         (/kibana)
│
├── 172.20.0.30  prometheus        Prometheus 2.48     (/prometheus/)
├── 172.20.0.31  alertmanager      Alertmanager 0.26   (/alerts/)
├── 172.20.0.32  grafana           Grafana 10.2        (/grafana/)
├── 172.20.0.33  snmp-exporter     SNMP Exporter       (interne)
│
├── 172.20.0.40  netbox            NetBox 3.7          (/netbox)
│
├── 172.20.0.50  wazuh-manager     Wazuh Manager 4.7   (port 55000)
├── 172.20.0.51  wazuh-indexer     Wazuh Indexer       (interne)
├── 172.20.0.52  wazuh-dashboard   Wazuh Dashboard     (/wazuh)
│
├── 172.20.0.60  thehive           TheHive 5.2         (/thehive)
├── 172.20.0.61  cortex            Cortex 3.1.7        (/cortex)
├── 172.20.0.62  misp              MISP Core           (port 8081)
├── 172.20.0.63  misp-db           MariaDB 10.11       (interne)
├── 172.20.0.64  misp-modules      MISP Modules        (interne)
│
├── 172.20.0.70  shuffle-backend   Shuffle Backend     (port 5001)
├── 172.20.0.71  shuffle-frontend  Shuffle Frontend    (port 3002)
├── 172.20.0.72  shuffle-opensearch                    (interne)
├── 172.20.0.73  shuffle-orborus   Orborus executor    (interne)
│
├── 172.20.0.80  backend           FastAPI             (port 8000)
├── 172.20.0.81  celery-worker     Celery Worker       (interne)
├── 172.20.0.82  celery-beat       Celery Beat         (interne)
├── 172.20.0.90  frontend          React SPA           (interne)
│
└── 172.20.0.100 nginx             Reverse Proxy       (port 8090 HTTP, 8443 HTTPS)
```

---

## 4. Gestion des services Docker

### Commandes de base

```bash
cd docker/

# État de tous les services
docker compose ps

# Démarrer tous les services
docker compose up -d

# Arrêter tous les services
docker compose down

# Redémarrer un service spécifique
docker compose restart backend

# Voir les logs en temps réel
docker compose logs -f backend
docker compose logs -f celery-worker --tail=100

# Reconstruire l'image backend après modification du code
docker compose build backend
docker compose up -d backend celery-worker celery-beat
```

### Démarrage par groupe

```bash
# Infrastructure uniquement (bases de données + brokers)
docker compose up -d postgres redis influxdb kafka zookeeper elasticsearch

# Monitoring
docker compose up -d prometheus alertmanager grafana snmp-exporter

# Stack SOC
docker compose up -d wazuh-manager wazuh-indexer wazuh-dashboard \
                      thehive cortex misp-db misp misp-modules \
                      shuffle-opensearch shuffle-backend shuffle-frontend shuffle-orborus

# Application
docker compose up -d backend celery-worker celery-beat frontend nginx
```

### Vérification de santé

```bash
# Santé du backend
curl http://localhost:8000/health

# Santé PostgreSQL
docker compose exec postgres pg_isready -U socnoc -d socnoc_db

# Santé Redis
docker compose exec redis redis-cli -a $REDIS_PASSWORD ping

# Santé Elasticsearch
curl http://localhost:9200/_cluster/health?pretty
```

---

## 5. Gestion des utilisateurs

### Rôles disponibles

| Rôle | Permissions |
|------|-------------|
| `super_admin` | Accès total, gestion des utilisateurs |
| `noc_manager` | Gestion NOC complète |
| `soc_manager` | Gestion SOC complète |
| `noc_analyst` | Lecture + acquittement alertes NOC |
| `soc_analyst` | Lecture + gestion incidents SOC |
| `read_only` | Lecture seule sur toutes les sections |

### Créer un utilisateur via l'API

```bash
# Se connecter d'abord
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -F "username=admin" -F "password=<mot_de_passe>" | jq -r '.access_token')

# Créer un utilisateur
curl -X POST http://localhost:8000/api/v1/auth/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "analyst01",
    "email": "analyst01@socnoc.local",
    "full_name": "Analyste SOC",
    "password": "MotDePasseFort123!",
    "role": "soc_analyst"
  }'
```

### Réinitialiser le mot de passe super-admin

```bash
# Modifier la variable dans .env puis relancer
# ATTENTION : ne fonctionne que si la table users est vide
docker compose exec backend python -c "
from app.core.database import AsyncSessionLocal
# utiliser l'API PATCH /api/v1/auth/users/{id} avec le rôle super_admin
"

# Méthode recommandée : utiliser l'API avec un token super_admin existant
curl -X PATCH http://localhost:8000/api/v1/auth/users/<user_id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password": "NouveauMotDePasse123!"}'
```

---

## 6. Configuration

### Variables d'environnement clés

| Variable | Valeur par défaut | Description |
|----------|-------------------|-------------|
| `ENVIRONMENT` | `development` | `development` ou `production` |
| `DEBUG` | `false` | Active les logs détaillés |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Durée de validité du token JWT (8h) |
| `DATABASE_POOL_SIZE` | `20` | Pool de connexions PostgreSQL |
| `REDIS_CACHE_TTL` | `300` | TTL cache Redis (secondes) |
| `SNMP_POLL_INTERVAL` | `60` | Intervalle polling SNMP (secondes) |
| `MODBUS_POLL_INTERVAL` | `30` | Intervalle polling Modbus |
| `MISP_SYNC_DAYS` | `30` | Fenêtre de sync MISP (jours) |

### Seuils d'alerte (modifiables dans `.env`)

```env
CPU_WARN_THRESHOLD=80.0
CPU_CRIT_THRESHOLD=95.0
MEMORY_WARN_THRESHOLD=85.0
MEMORY_CRIT_THRESHOLD=95.0
DISK_WARN_THRESHOLD=80.0
DISK_CRIT_THRESHOLD=90.0
TEMPERATURE_WARN_THRESHOLD=30.0
TEMPERATURE_CRIT_THRESHOLD=40.0
UPS_BATTERY_WARN_THRESHOLD=30.0
UPS_BATTERY_CRIT_THRESHOLD=15.0
```

---

## 7. Réseau et ports

### Ports exposés sur l'hôte

| Port | Service | URL |
|------|---------|-----|
| `8090` | Nginx (HTTP) | Point d'entrée principal |
| `8443` | Nginx (HTTPS) | Point d'entrée sécurisé |
| `8000` | Backend API | `http://localhost:8000` |
| `3001` | Frontend | `http://localhost:3001` |
| `8081` | MISP | `http://localhost:8081` |
| `3002` | Shuffle | `http://localhost:3002` |
| `9000` | TheHive | `http://localhost:9000` |
| `9001` | Cortex | `http://localhost:9001` |
| `5432` | PostgreSQL | Accès direct BDD |
| `29092` | Kafka | Accès direct broker |
| `9090` | Prometheus | `http://localhost:9090` |
| `9093` | Alertmanager | `http://localhost:9093` |
| `55000` | Wazuh API | API REST Wazuh |
| `1514` | Wazuh Agent (UDP) | Collecte agents |
| `1515` | Wazuh Agent (TCP) | Enrôlement agents |
| `5800` | Logstash Syslog | UDP/TCP 514→5800 |
| `2055` | NetFlow | Réception NetFlow v5 |

### Accès via nginx (port 8090)

| Chemin | Service |
|--------|---------|
| `/` | Frontend React |
| `/api/v1/` | Backend FastAPI |
| `/docs` | Swagger UI |
| `/grafana/` | Grafana |
| `/kibana` | Kibana |
| `/prometheus/` | Prometheus |
| `/alerts/` | Alertmanager |
| `/thehive` | TheHive |
| `/cortex` | Cortex |
| `/wazuh` | Wazuh Dashboard |
| `/netbox` | NetBox |
| `/shuffle/` | Shuffle SOAR |
| `/misp/` | MISP (proxy) |

---

## 8. Sauvegardes

### Sauvegarde PostgreSQL

```bash
# Sauvegarde complète
docker compose exec postgres pg_dump -U socnoc socnoc_db \
  | gzip > backup_postgres_$(date +%Y%m%d_%H%M).sql.gz

# Restauration
gunzip -c backup_postgres_YYYYMMDD_HHMM.sql.gz \
  | docker compose exec -T postgres psql -U socnoc socnoc_db
```

### Sauvegarde InfluxDB

```bash
docker compose exec influxdb influx backup /tmp/influx-backup \
  --token $INFLUXDB_TOKEN

docker compose cp influxdb:/tmp/influx-backup ./backups/influxdb_$(date +%Y%m%d)
```

### Sauvegarde des volumes Docker

```bash
# Lister les volumes
docker volume ls | grep soc

# Sauvegarder un volume
docker run --rm -v soc_noc_postgres_data:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/postgres_data_$(date +%Y%m%d).tar.gz /data
```

### Script de sauvegarde automatique

```bash
#!/bin/bash
# /etc/cron.daily/socnoc-backup

BACKUP_DIR="/opt/backups/socnoc"
DATE=$(date +%Y%m%d_%H%M)
mkdir -p $BACKUP_DIR

cd /opt/soc-noc-platform/docker

# PostgreSQL
docker compose exec -T postgres pg_dump -U socnoc socnoc_db \
  | gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# Nettoyer les sauvegardes de plus de 30 jours
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

---

## 9. Mise à jour

### Mise à jour du backend

```bash
cd /opt/soc-noc-platform

# Récupérer les modifications
git pull origin main

# Reconstruire et redémarrer
cd docker/
docker compose build backend
docker compose up -d backend celery-worker celery-beat

# Vérifier
docker compose logs -f backend --tail=50
```

### Mise à jour des images tierces

```bash
# Télécharger les nouvelles images
docker compose pull elasticsearch grafana prometheus wazuh-manager

# Redémarrer les services mis à jour
docker compose up -d elasticsearch grafana prometheus
```

### Migrations de base de données

Les tables sont créées automatiquement au démarrage du backend via SQLAlchemy (`create_all`). Pour les migrations complexes avec Alembic :

```bash
docker compose exec backend alembic revision --autogenerate -m "description"
docker compose exec backend alembic upgrade head
```

---

## 10. Sécurité

### Certificats TLS

```bash
# Générer un certificat auto-signé pour les tests
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout docker/nginx/ssl/server.key \
  -out docker/nginx/ssl/server.crt \
  -subj "/C=SN/ST=Dakar/O=SOCNOC/CN=datacenter.local"

# Pour la production, utiliser Let's Encrypt ou un certificat d'entreprise
```

### Rotation des secrets

```bash
# Générer un nouveau SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(64))"

# Mettre à jour .env et redémarrer le backend
# ATTENTION : invalide tous les tokens JWT actifs
docker compose restart backend
```

### Pare-feu (exemple UFW)

```bash
# Autoriser uniquement l'accès au port nginx
ufw allow 8090/tcp
ufw allow 8443/tcp

# Restreindre les ports internes (ne pas exposer en production)
ufw deny 5432/tcp   # PostgreSQL
ufw deny 9200/tcp   # Elasticsearch
ufw deny 6379/tcp   # Redis
```

---

## 11. Tâches planifiées (Celery Beat)

| Tâche | Fréquence | Description |
|-------|-----------|-------------|
| `poll_all_snmp_devices` | Toutes les 60s | Polling SNMP v1/v2c/v3 |
| `poll_all_modbus_devices` | Toutes les 30s | Polling Modbus TCP/RTU |
| `poll_all_bacnet_devices` | Toutes les 60s | Polling BACnet/IP |
| `check_all_devices_reachability` | Toutes les 30s | Ping ICMP |
| `sync_misp_iocs` | Toutes les 6h | Sync IOCs depuis MISP |
| `sync_netbox_inventory` | Toutes les 4h | Sync CMDB depuis NetBox |
| `send_daily_report` | 08h00 UTC | Rapport journalier Slack |
| `cleanup_old_alerts` | 02h00 UTC | Nettoyage alertes > 30j |
| `generate_sla_report` | 1er du mois 06h00 | Rapport SLA mensuel |

```bash
# Voir les tâches en cours
docker compose exec celery-worker celery -A app.tasks.celery_app inspect active

# Déclencher une tâche manuellement
docker compose exec celery-worker celery -A app.tasks.celery_app call \
  app.tasks.misp_tasks.sync_misp_iocs

# Voir le statut du scheduler
docker compose logs celery-beat --tail=20
```
