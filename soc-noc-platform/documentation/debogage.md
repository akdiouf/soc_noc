# Guide de Débogage — SOC/NOC Platform

## Table des matières
1. [Diagnostics rapides](#1-diagnostics-rapides)
2. [Logs des services](#2-logs-des-services)
3. [Problèmes courants — Backend](#3-problèmes-courants--backend)
4. [Problèmes courants — Frontend](#4-problèmes-courants--frontend)
5. [Problèmes courants — Docker](#5-problèmes-courants--docker)
6. [Problèmes courants — Base de données](#6-problèmes-courants--base-de-données)
7. [Problèmes courants — Celery](#7-problèmes-courants--celery)
8. [Problèmes courants — Intégrations](#8-problèmes-courants--intégrations)
9. [Outils de diagnostic](#9-outils-de-diagnostic)
10. [Référence des codes d'erreur HTTP](#10-référence-des-codes-derreur-http)

---

## 1. Diagnostics rapides

### Checklist de santé globale

```bash
cd docker/

# 1. État de tous les containers
docker compose ps

# 2. Santé du backend
curl -s http://localhost:8000/health | jq

# 3. PostgreSQL accessible
docker compose exec postgres pg_isready -U socnoc -d socnoc_db

# 4. Redis accessible
docker compose exec redis redis-cli -a $REDIS_PASSWORD ping

# 5. Elasticsearch cluster
curl -s http://localhost:9200/_cluster/health | jq .status

# 6. Kafka topics
docker compose exec kafka kafka-topics --list --bootstrap-server localhost:9092

# 7. Celery workers actifs
docker compose exec celery-worker celery -A app.tasks.celery_app inspect ping
```

### Script de diagnostic en une ligne

```bash
echo "=== DOCKER ===" && docker compose ps --format "table {{.Name}}\t{{.Status}}" && \
echo "=== BACKEND ===" && curl -s http://localhost:8000/health && \
echo "=== DB ===" && docker compose exec -T postgres pg_isready -U socnoc && \
echo "=== REDIS ===" && docker compose exec -T redis redis-cli -a $REDIS_PASSWORD ping
```

---

## 2. Logs des services

### Commandes de logs essentielles

```bash
# Logs en temps réel (suivre)
docker compose logs -f backend
docker compose logs -f celery-worker
docker compose logs -f misp

# Dernières N lignes
docker compose logs --tail=100 backend

# Logs avec timestamp
docker compose logs -t backend

# Logs de tous les services depuis 1h
docker compose logs --since=1h

# Rechercher une erreur dans les logs
docker compose logs backend 2>&1 | grep -i "error\|exception\|traceback"

# Logs d'un service avec niveau DEBUG (nécessite DEBUG=true dans .env)
docker compose logs celery-worker 2>&1 | grep "DEBUG"
```

### Fichiers de logs applicatifs

```bash
# Logs Nginx (access + error)
docker compose exec nginx cat /var/log/nginx/error.log
docker compose exec nginx tail -f /var/log/nginx/access.log

# Logs Wazuh Manager
docker compose exec wazuh-manager tail -f /var/ossec/logs/ossec.log

# Logs Logstash
docker compose logs logstash --tail=50
```

### Activer les logs DEBUG du backend

```bash
# Dans .env
DEBUG=true

# Redémarrer
docker compose restart backend

# Désactiver après diagnostic (verbose en production = risque performance)
```

---

## 3. Problèmes courants — Backend

### ❌ `500 Internal Server Error` sur tous les endpoints

**Cause probable :** Connexion à la base de données impossible.

```bash
# Vérifier la connexion
docker compose logs backend --tail=20 | grep -i "database\|connection\|error"

# Tester la connexion manuellement
docker compose exec backend python -c "
import asyncio
from app.core.database import AsyncSessionLocal
from sqlalchemy import text

async def test():
    async with AsyncSessionLocal() as db:
        r = await db.execute(text('SELECT 1'))
        print('DB OK:', r.scalar())

asyncio.run(test())
"
```

### ❌ `401 Unauthorized` — token expiré ou invalide

```bash
# Vérifier la configuration JWT
docker compose exec backend python -c "
from app.core.config import settings
print('SECRET_KEY set:', bool(settings.SECRET_KEY))
print('Token expires in:', settings.ACCESS_TOKEN_EXPIRE_MINUTES, 'minutes')
"

# Re-générer un token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -F "username=admin" -F "password=<mot_de_passe>"
```

### ❌ Import error `ModuleNotFoundError`

```bash
# Reconstruire l'image avec les nouvelles dépendances
docker compose build backend --no-cache
docker compose up -d backend
```

### ❌ `422 Unprocessable Entity`

L'entrée ne correspond pas au schéma Pydantic attendu.

```bash
# Activer le détail d'erreur en mode dev
curl -v -X POST http://localhost:8000/api/v1/... \
  -H "Content-Type: application/json" \
  -d '{"champ": "valeur"}'
# Lire le corps de la réponse — Pydantic détaille chaque champ invalide
```

### ❌ Syslog/NetFlow ne reçoit pas de données

```bash
# Vérifier que les ports sont bien bindés dans le container
docker compose exec backend ss -ulnp | grep -E "514|601|2055"

# Tester l'envoi d'un message syslog
echo "test message" | nc -u localhost 514

# Vérifier les logs du collecteur
docker compose logs backend 2>&1 | grep -i "syslog\|netflow"
```

### ❌ WebSocket déconnecté en permanence

```bash
# Vérifier que Kafka tourne
docker compose ps kafka zookeeper

# Vérifier que le broadcaster WebSocket a démarré
docker compose logs backend | grep -i "websocket\|kafka broadcaster"

# Tester la connexion WebSocket
# Dans la console du navigateur :
# const ws = new WebSocket("ws://localhost:8000/ws/alerts?token=<TOKEN>");
# ws.onmessage = (e) => console.log(e.data);
```

---

## 4. Problèmes courants — Frontend

### ❌ Écran blanc au chargement

```bash
# Vérifier la console du navigateur (F12)
# Chercher les erreurs JavaScript

# Vérifier que le build est correct
docker compose logs frontend --tail=20

# Rebuild le frontend
docker compose build frontend --no-cache
docker compose up -d frontend
```

### ❌ `Network Error` sur toutes les requêtes API

**Cause :** Le frontend ne peut pas joindre le backend.

```bash
# Vérifier la variable VITE_API_URL (doit pointer vers le backend)
# En développement : http://localhost:8000/api/v1
# Via Nginx : http://localhost:8090/api/v1

# Tester directement
curl http://localhost:8000/api/v1/auth/me -H "Authorization: Bearer <token>"
```

### ❌ Erreur CORS

```
Access to XMLHttpRequest... has been blocked by CORS policy
```

```bash
# Vérifier ALLOWED_ORIGINS dans .env
# Doit inclure l'origine du frontend (ex: http://localhost:3001)

# Dans config.py, la liste par défaut inclut :
# http://localhost, http://localhost:3000, http://localhost:3001
```

### ❌ Page blanche après login (redirection échoue)

```bash
# Vérifier que le token est bien stocké
# Dans la console du navigateur :
localStorage.getItem("access_token")
# Si null → le login a échoué silencieusement

# Tester le login directement
curl -X POST http://localhost:8000/api/v1/auth/login \
  -F "username=admin" -F "password=<mot_de_passe>"
```

---

## 5. Problèmes courants — Docker

### ❌ Container en état `Exited` ou `Restarting`

```bash
# Voir le code de sortie
docker compose ps

# Lire les logs d'erreur au démarrage
docker compose logs <nom_service> --tail=50

# Inspecter le container
docker inspect soc_backend | jq '.[0].State'
```

### ❌ `Error: No such file or directory` au démarrage

Volume non monté ou chemin incorrect.

```bash
# Vérifier les volumes
docker compose exec backend ls -la /app/app/

# Si le volume est vide, reconstruire
docker compose down -v  # ATTENTION : supprime les données
docker compose up -d
```

### ❌ Port déjà utilisé (`bind: address already in use`)

```bash
# Trouver le processus qui utilise le port
# Linux/Mac
lsof -i :8090
# Windows
netstat -ano | findstr :8090

# Changer le port dans docker-compose.yml ou arrêter le processus conflictuel
```

### ❌ Mémoire insuffisante

```bash
# Vérifier la mémoire utilisée
docker stats --no-stream

# Services consommateurs de mémoire (réduire si nécessaire dans docker-compose.yml)
# Elasticsearch : ES_JAVA_OPTS=-Xms512m -Xmx512m  (au lieu de 1g)
# Wazuh Indexer : -Xms256m -Xmx256m
```

### ❌ Réseau Docker saturé

```bash
# Lister les réseaux
docker network ls

# Inspecter le réseau de la plateforme
docker network inspect docker_soc_noc_net

# Recréer le réseau (arrêt de tous les services requis)
docker compose down
docker network rm docker_soc_noc_net
docker compose up -d
```

---

## 6. Problèmes courants — Base de données

### ❌ PostgreSQL refuse les connexions

```bash
# Vérifier le healthcheck
docker compose exec postgres pg_isready -U socnoc -d socnoc_db

# Vérifier les logs PostgreSQL
docker compose logs postgres --tail=30

# Se connecter manuellement
docker compose exec postgres psql -U socnoc -d socnoc_db -c "SELECT version();"

# Vérifier les connexions actives
docker compose exec postgres psql -U socnoc -d socnoc_db \
  -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

### ❌ Pool de connexions épuisé

```
asyncpg.exceptions.TooManyConnectionsError
```

```bash
# Voir les connexions actives
docker compose exec postgres psql -U socnoc -d socnoc_db \
  -c "SELECT pid, state, query_start, query FROM pg_stat_activity WHERE datname='socnoc_db';"

# Tuer les connexions idle
docker compose exec postgres psql -U socnoc -d socnoc_db \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
      WHERE datname='socnoc_db' AND state='idle' AND query_start < NOW() - INTERVAL '10 minutes';"

# Augmenter le pool dans .env
DATABASE_POOL_SIZE=30
DATABASE_MAX_OVERFLOW=60
```

### ❌ Table manquante ou colonne inexistante

```bash
# Les tables sont auto-créées au démarrage (SQLAlchemy create_all)
# Si une table manque, redémarrer le backend
docker compose restart backend

# Vérifier les tables existantes
docker compose exec postgres psql -U socnoc -d socnoc_db \
  -c "\dt"

# Voir la structure d'une table
docker compose exec postgres psql -U socnoc -d socnoc_db \
  -c "\d ioc_cache"
```

### ❌ Conflits de migration Alembic

```bash
# Voir la version de migration actuelle
docker compose exec backend alembic current

# Voir l'historique
docker compose exec backend alembic history

# En cas de conflit, résoudre manuellement ou reset (ATTENTION : perte de données)
docker compose exec backend alembic downgrade base
docker compose exec backend alembic upgrade head
```

---

## 7. Problèmes courants — Celery

### ❌ Les tâches ne s'exécutent pas

```bash
# Vérifier que le worker tourne
docker compose ps celery-worker

# Voir les tâches enregistrées
docker compose exec celery-worker celery -A app.tasks.celery_app inspect registered

# Voir les tâches actives
docker compose exec celery-worker celery -A app.tasks.celery_app inspect active

# Tester une tâche manuellement
docker compose exec celery-worker celery -A app.tasks.celery_app call \
  app.tasks.misp_tasks.sync_misp_iocs
```

### ❌ `Task not found` ou `Unregistered task`

```bash
# Vérifier que le module est bien dans `include` de celery_app.py
docker compose exec celery-worker python -c "
from app.tasks.celery_app import celery_app
print(list(celery_app.tasks.keys()))
"
```

### ❌ Celery Beat ne planifie pas

```bash
# Vérifier les logs du scheduler
docker compose logs celery-beat --tail=30

# Voir le prochain déclenchement
docker compose exec celery-beat celery -A app.tasks.celery_app beat --dry-run 2>&1 | head -20
```

### ❌ Tâche bloquée / timeout

```bash
# Révoquer une tâche bloquée
docker compose exec celery-worker celery -A app.tasks.celery_app control revoke <task_id> --terminate

# Purger la file d'attente
docker compose exec celery-worker celery -A app.tasks.celery_app purge
```

---

## 8. Problèmes courants — Intégrations

### ❌ MISP — connexion impossible

```bash
# Tester la connexion directe
curl -s http://localhost:8081/servers/getVersion \
  -H "Authorization: <MISP_API_KEY>" \
  -H "Accept: application/json"

# Vérifier que MISP_API_KEY est bien configuré
docker compose exec backend python -c "
from app.core.config import settings
print('MISP URL:', settings.MISP_URL)
print('MISP key set:', bool(settings.MISP_API_KEY))
"

# Tester depuis le container backend (réseau interne)
docker compose exec backend curl -s http://misp:80/servers/getVersion \
  -H "Authorization: <MISP_API_KEY>"
```

### ❌ MISP — premier démarrage lent

MISP initialise sa base de données MySQL et génère des clés au premier démarrage (~3-10 min).

```bash
# Surveiller l'initialisation
docker compose logs -f misp | grep -E "Initialization|ready|error|Error"

# MISP est prêt quand les logs indiquent "Apache is running"
```

### ❌ TheHive — export d'incident échoue

```bash
# Tester la connexion TheHive
curl -s http://localhost:9000/api/v1/health \
  -H "Authorization: Bearer $THEHIVE_API_KEY"

# Vérifier la clé dans .env
grep THEHIVE_API_KEY .env
```

### ❌ Wazuh — agents ne remontent pas

```bash
# Vérifier que le manager écoute
docker compose exec wazuh-manager ss -tlnp | grep 1514

# Lister les agents enregistrés
docker compose exec wazuh-manager /var/ossec/bin/agent_control -la

# Voir les erreurs d'enregistrement
docker compose logs wazuh-manager | grep -i "error\|agent"
```

### ❌ Notifications Slack/Teams ne s'envoient pas

```bash
# Tester le webhook directement
curl -X POST $SLACK_WEBHOOK_URL \
  -H "Content-type: application/json" \
  -d '{"text": "Test depuis SOC/NOC Platform"}'

# Vérifier la configuration
docker compose exec backend python -c "
from app.core.config import settings
print('Slack URL set:', bool(settings.SLACK_WEBHOOK_URL))
print('SMTP host:', settings.SMTP_HOST)
"
```

---

## 9. Outils de diagnostic

### Accès direct aux bases de données

```bash
# PostgreSQL (toutes les tables, données)
docker compose exec postgres psql -U socnoc -d socnoc_db

# InfluxDB CLI
docker compose exec influxdb influx query \
  --org socnoc \
  --token $INFLUXDB_TOKEN \
  'from(bucket:"metrics") |> range(start: -1h) |> limit(n:10)'

# Redis CLI
docker compose exec redis redis-cli -a $REDIS_PASSWORD
# Commandes utiles :
# KEYS *          → lister toutes les clés
# DBSIZE          → nombre de clés
# INFO            → statistiques
# FLUSHDB         → vider le cache (DANGEREUX)
```

### Kafka — inspecter les topics

```bash
# Lister les topics
docker compose exec kafka kafka-topics \
  --list --bootstrap-server localhost:9092

# Voir les messages récents d'un topic
docker compose exec kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic soc.events \
  --from-beginning \
  --max-messages 10

# Statistiques d'un topic
docker compose exec kafka kafka-topics \
  --describe --topic noc.alerts \
  --bootstrap-server localhost:9092
```

### API REST — tester avec curl

```bash
# Obtenir un token
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -F "username=admin" \
  -F "password=<mot_de_passe>" | jq -r '.access_token')

# Tester un endpoint
curl -s http://localhost:8000/api/v1/alerts \
  -H "Authorization: Bearer $TOKEN" | jq

# Tester le statut MISP
curl -s http://localhost:8000/api/v1/threat-intel/status \
  -H "Authorization: Bearer $TOKEN" | jq

# Déclencher une sync MISP
curl -X POST http://localhost:8000/api/v1/threat-intel/sync \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Surveiller les ressources

```bash
# Consommation CPU/RAM en temps réel
docker stats

# Utilisation disque des volumes
docker system df -v

# Nettoyer les ressources inutilisées (images, containers arrêtés)
docker system prune -f
```

---

## 10. Référence des codes d'erreur HTTP

| Code | Signification | Action |
|------|---------------|--------|
| `400` | Données de requête invalides | Vérifier le corps de la requête vs le schéma Pydantic |
| `401` | Token absent ou expiré | Re-authentification requise |
| `403` | Droits insuffisants | Vérifier le rôle de l'utilisateur |
| `404` | Ressource non trouvée | Vérifier l'ID ou le chemin |
| `409` | Conflit (ex: case TheHive déjà créé) | Consulter le message d'erreur |
| `422` | Validation échouée | Lire le détail Pydantic dans la réponse |
| `500` | Erreur interne serveur | Consulter les logs backend |
| `502` | Service externe inaccessible (TheHive, MISP) | Vérifier l'intégration concernée |
| `503` | Service non configuré (clé API manquante) | Vérifier les variables d'environnement |
