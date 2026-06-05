# Guide d'Intégration — SOC/NOC Platform

## Table des matières
1. [API REST — Référence](#1-api-rest--référence)
2. [Authentification](#2-authentification)
3. [WebSocket — Temps réel](#3-websocket--temps-réel)
4. [Intégration MISP](#4-intégration-misp)
5. [Intégration TheHive](#5-intégration-thehive)
6. [Intégration Cortex](#6-intégration-cortex)
7. [Intégration Wazuh](#7-intégration-wazuh)
8. [Intégration Shuffle (SOAR)](#8-intégration-shuffle-soar)
9. [Intégration NetBox (CMDB)](#9-intégration-netbox-cmdb)
10. [Intégration Grafana](#10-intégration-grafana)
11. [Notifications externes](#11-notifications-externes)
12. [Collecte de données — Protocoles](#12-collecte-de-données--protocoles)
13. [Kafka — Événements en streaming](#13-kafka--événements-en-streaming)
14. [Exemples d'automatisation](#14-exemples-dautomatisation)

---

## 1. API REST — Référence

### Base URL

```
http://localhost:8090/api/v1      # Via nginx (production)
http://localhost:8000/api/v1      # Accès direct backend (dev)
```

### Documentation interactive

| Interface | URL |
|-----------|-----|
| Swagger UI | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |

### Endpoints disponibles

#### Authentification (`/auth`)
| Méthode | Chemin | Description |
|---------|--------|-------------|
| POST | `/auth/login` | Connexion — retourne un JWT |
| GET | `/auth/me` | Profil de l'utilisateur connecté |
| POST | `/auth/refresh` | Renouveler le token |
| GET | `/auth/users` | Liste des utilisateurs (admin) |
| POST | `/auth/users` | Créer un utilisateur |
| PATCH | `/auth/users/{id}` | Modifier un utilisateur |
| DELETE | `/auth/users/{id}` | Supprimer un utilisateur |

#### Équipements (`/devices`)
| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/devices` | Liste paginée (filtres: site, type, status, search) |
| POST | `/devices` | Créer un équipement |
| GET | `/devices/{id}` | Détail d'un équipement |
| PUT | `/devices/{id}` | Modifier un équipement |
| DELETE | `/devices/{id}` | Supprimer un équipement |
| POST | `/devices/{id}/maintenance` | Activer/désactiver la maintenance |
| GET | `/devices/summary/by-type` | Compteurs par type |
| GET | `/devices/summary/by-status` | Compteurs par statut |

#### Alertes (`/alerts`)
| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/alerts` | Liste paginée (filtres: severity, status, category, device_id) |
| GET | `/alerts/{id}` | Détail d'une alerte |
| POST | `/alerts/{id}/acknowledge` | Acquitter |
| POST | `/alerts/{id}/resolve` | Résoudre |
| POST | `/alerts/bulk/acknowledge` | Acquitter en masse (body: `[id1, id2, ...]`) |
| GET | `/alerts/active/count` | Compteurs par sévérité |

#### Incidents (`/incidents`)
| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/incidents` | Liste paginée |
| POST | `/incidents` | Créer un incident |
| GET | `/incidents/{id}` | Détail |
| PUT | `/incidents/{id}` | Modifier (status, assignation, RCA…) |
| GET | `/incidents/{id}/timeline` | Timeline de l'incident |
| POST | `/incidents/{id}/timeline` | Ajouter une entrée timeline |
| POST | `/incidents/{id}/thehive` | Exporter vers TheHive |
| GET | `/incidents/stats/mttr` | MTTR moyen par sévérité |

#### Métriques (`/metrics`)
| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/metrics/device/{id}` | Série temporelle d'une métrique |
| GET | `/metrics/device/{id}/stats` | Statistiques (min, max, avg) |
| GET | `/metrics/device/{id}/current` | Valeur courante |
| GET | `/metrics/dashboard/overview` | Vue d'ensemble dashboard |

#### Threat Intelligence (`/threat-intel`)
| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/threat-intel/status` | Statut connexion MISP |
| GET | `/threat-intel/iocs` | Liste du cache IOC (filtres: type, level, tlp, search) |
| POST | `/threat-intel/iocs/lookup` | Rechercher un IOC |
| GET | `/threat-intel/iocs/stats` | Statistiques du cache |
| GET | `/threat-intel/events` | Événements MISP récents |
| POST | `/threat-intel/sync` | Déclencher une synchronisation |

#### WebSocket (`/ws`)
| Chemin | Description |
|--------|-------------|
| `/ws/alerts?token=<JWT>` | Flux temps réel alertes + métriques |

---

## 2. Authentification

### Obtenir un token JWT

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -F "username=admin" \
  -F "password=<mot_de_passe>"
```

Réponse :
```json
{
  "access_token": "eyJhbGci...",
  "token_type": "bearer",
  "expires_in": 28800
}
```

### Utiliser le token

```bash
# Header HTTP
Authorization: Bearer eyJhbGci...

# Exemple curl
curl http://localhost:8000/api/v1/alerts \
  -H "Authorization: Bearer eyJhbGci..."
```

### Durée de validité

- Token d'accès : 8 heures (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- Token de refresh : 7 jours

### Exemple Python

```python
import httpx

BASE_URL = "http://localhost:8000/api/v1"

# Connexion
resp = httpx.post(f"{BASE_URL}/auth/login", data={"username": "admin", "password": "..."})
token = resp.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Utilisation
alerts = httpx.get(f"{BASE_URL}/alerts", headers=headers).json()
print(alerts["items"])
```

---

## 3. WebSocket — Temps réel

### Connexion

```javascript
// JavaScript / TypeScript
const token = localStorage.getItem("access_token");
const ws = new WebSocket(`ws://localhost:8000/ws/alerts?token=${token}`);

ws.onopen = () => console.log("Connecté au flux temps réel");
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Type:", data.type, "Données:", data);
};
ws.onerror = (error) => console.error("WebSocket error:", error);
ws.onclose = () => console.log("Déconnecté");
```

### Format des messages reçus

```json
// Alerte
{
  "type": "alert",
  "data": {
    "id": "uuid",
    "title": "CPU critique",
    "severity": "critical",
    "device_id": "uuid",
    "status": "active"
  }
}

// Métrique
{
  "type": "metric",
  "data": {
    "device_id": "uuid",
    "metric": "cpu_usage",
    "value": 94.5,
    "timestamp": "2024-06-05T12:00:00Z"
  }
}

// Événement de sécurité
{
  "type": "security_event",
  "data": {
    "source_ip": "192.168.1.100",
    "event_type": "brute_force",
    "severity": "critical"
  }
}
```

### Topics Kafka consommés par le broadcaster WebSocket

| Topic | Contenu |
|-------|---------|
| `noc.alerts` | Alertes NOC créées/mises à jour |
| `noc.metrics` | Métriques de performance |
| `soc.events` | Événements de sécurité |

---

## 4. Intégration MISP

### Configuration

```env
MISP_URL=http://misp:80          # URL interne Docker
MISP_API_KEY=<votre_clé_api>
MISP_VERIFY_CERT=false           # true en production avec cert valide
MISP_ORG=SOCNOC
MISP_SYNC_DAYS=30                # Fenêtre de synchronisation
```

### Récupérer la clé API MISP

1. Ouvrir http://localhost:8081
2. `Administration → Auth keys → Add auth key`
3. Cocher les permissions nécessaires (READ suffisant pour la sync)
4. Copier la clé dans `.env`

### Utilisation via l'API de la plateforme

```bash
# Vérifier le statut
curl -s http://localhost:8000/api/v1/threat-intel/status \
  -H "Authorization: Bearer $TOKEN"

# Rechercher un IOC
curl -X POST http://localhost:8000/api/v1/threat-intel/iocs/lookup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": "198.51.100.1"}'

# Forcer une synchronisation
curl -X POST http://localhost:8000/api/v1/threat-intel/sync \
  -H "Authorization: Bearer $TOKEN"
```

### Utilisation directe via PyMISP

```python
from pymisp import PyMISP

misp = PyMISP(
    url="http://localhost:8081",
    key="<votre_clé_api>",
    ssl=False,
)

# Rechercher un attribut
results = misp.search(controller="attributes", value="198.51.100.1", pythonify=True)
for attr in results:
    print(attr.type, attr.value, attr.Event.info)

# Créer un événement
event = misp.new_event(info="Incident INC-20240605-ABCD")
misp.add_attribute(event, type="ip-dst", value="198.51.100.1", to_ids=True)
```

### Feeds MISP recommandés

| Feed | Source | Contenu |
|------|--------|---------|
| CIRCL OSINT Feed | CIRCL Luxembourg | IOCs multi-types |
| Abuse.ch URLhaus | URLhaus | URLs malveillantes |
| Abuse.ch Feodo Tracker | Feodo | C2 bancaires |
| MalwareBazaar | Abuse.ch | Hashes malware |
| PhishTank | PhishTank | Phishing URLs |

---

## 5. Intégration TheHive

### Configuration

```env
THEHIVE_URL=http://thehive:9000  # URL interne Docker
THEHIVE_API_KEY=<votre_clé>
```

### Obtenir une clé API TheHive

1. Ouvrir http://localhost:9000
2. Créer un compte administrateur
3. `Profil → API Key → Créer`

### Exporter un incident vers TheHive

```bash
# Via l'API de la plateforme
curl -X POST http://localhost:8000/api/v1/incidents/<incident_id>/thehive \
  -H "Authorization: Bearer $TOKEN"
```

Mapping automatique des sévérités :
| Sévérité incident | Sévérité TheHive |
|-------------------|-----------------|
| P1 | 4 (Critical) |
| P2 | 3 (High) |
| P3 | 2 (Medium) |
| P4/P5 | 1 (Low) |

### Créer un case TheHive directement

```python
import httpx

THEHIVE_URL = "http://localhost:9000"
API_KEY = "<votre_clé>"

headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

case = {
    "title": "Incident de sécurité — Brute force détecté",
    "description": "...",
    "severity": 3,       # 1=Low, 2=Medium, 3=High, 4=Critical
    "tlp": 2,            # 0=White, 1=Green, 2=Amber, 3=Red
    "pap": 2,
    "tags": ["brute_force", "SOC"],
}

response = httpx.post(f"{THEHIVE_URL}/api/v1/case", json=case, headers=headers)
case_id = response.json()["_id"]
```

### Lier MISP et TheHive

Depuis l'interface TheHive :
1. `Administration → Connectors → MISP`
2. Renseigner l'URL MISP et la clé API
3. Les observables TheHive sont automatiquement enrichis avec les données MISP

---

## 6. Intégration Cortex

### Configuration

```env
# Cortex est accessible via TheHive ou directement
CORTEX_URL=http://cortex:9001
CORTEX_API_KEY=<votre_clé>
```

### Analyzers disponibles (exemples)

| Analyzer | Usage |
|----------|-------|
| `VirusTotal_GetReport_3_0` | Analyse de hash/IP/domaine |
| `MaxMind_GeoIP_4_0` | Géolocalisation IP |
| `Shodan_Host_3_0` | Infos Shodan sur une IP |
| `MISP_2_1` | Enrichissement depuis MISP |
| `URLScan_io_Search_1_1` | Analyse d'URL |

### Déclencher une analyse depuis l'API Cortex

```python
import httpx

CORTEX_URL = "http://localhost:9001"
API_KEY = "<votre_clé>"

headers = {"Authorization": f"Bearer {API_KEY}"}

job = httpx.post(
    f"{CORTEX_URL}/api/analyzer/VirusTotal_GetReport_3_0/run",
    json={
        "data": "198.51.100.1",
        "dataType": "ip",
        "tlp": 2,
    },
    headers=headers,
).json()

print("Job ID:", job["id"])
```

---

## 7. Intégration Wazuh

### Configuration agents

#### Linux

```bash
# Sur l'hôte à superviser
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | apt-key add -
echo "deb https://packages.wazuh.com/4.x/apt/ stable main" > /etc/apt/sources.list.d/wazuh.list
apt-get update && apt-get install wazuh-agent

# Configurer le manager
echo "WAZUH_MANAGER='<IP_DU_SERVEUR>'" > /tmp/preloaded-vars.conf
WAZUH_MANAGER_PORT=1514
/var/ossec/bin/agent-auth -m <IP_DU_SERVEUR> -p 1515
systemctl enable --now wazuh-agent
```

#### Windows

```powershell
# Télécharger l'installeur depuis https://packages.wazuh.com/4.x/windows/
# Ou avec PowerShell :
Invoke-WebRequest -Uri "https://packages.wazuh.com/4.x/windows/wazuh-agent-4.7.0-1.msi" -OutFile wazuh-agent.msi
msiexec /i wazuh-agent.msi WAZUH_MANAGER="<IP_DU_SERVEUR>" WAZUH_REGISTRATION_SERVER="<IP_DU_SERVEUR>"
```

### API Wazuh

```bash
# Obtenir un token Wazuh
TOKEN=$(curl -u wazuh:$WAZUH_API_PASSWORD -k \
  https://localhost:55000/security/user/authenticate | jq -r '.data.token')

# Lister les agents
curl -k https://localhost:55000/agents \
  -H "Authorization: Bearer $TOKEN" | jq '.data.affected_items[] | {id, name, status}'

# Déclencher un scan actif
curl -k -X PUT "https://localhost:55000/active-response" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command": "restart-wazuh", "arguments": [], "alert": {}}'
```

### Intégration Wazuh → Alertes de la plateforme

Les alertes Wazuh sont envoyées via **Logstash** vers **Elasticsearch** (topic `soc-events`), puis consommées par le backend.

Pour configurer le forwarding Wazuh → Kafka :

```xml
<!-- /var/ossec/etc/ossec.conf dans le container wazuh-manager -->
<integration>
  <name>custom-kafka</name>
  <hook_url>http://backend:8000/api/v1/ingest/wazuh</hook_url>
  <level>7</level>
  <alert_format>json</alert_format>
</integration>
```

---

## 8. Intégration Shuffle (SOAR)

### Accès

- Interface : http://localhost:3002
- API : http://localhost:5001/api/v1

### Créer un workflow de réponse automatique

**Exemple : Workflow "Alerte critique → Incident TheHive"**

1. Ouvrir Shuffle → **New Workflow**
2. Ajouter un **Trigger** : Webhook
3. Copier l'URL du webhook Shuffle
4. Configurer le trigger dans la plateforme via l'API :

```bash
# Envoyer un événement au webhook Shuffle depuis un script
curl -X POST <SHUFFLE_WEBHOOK_URL> \
  -H "Content-Type: application/json" \
  -d '{
    "incident_id": "uuid",
    "title": "Alerte critique détectée",
    "severity": "critical",
    "source_ip": "198.51.100.1"
  }'
```

### Appeler l'API de la plateforme depuis Shuffle

Dans un nœud **HTTP** de Shuffle :

```
URL: http://backend:8000/api/v1/incidents
Method: POST
Headers: Authorization: Bearer <TOKEN>
Body: {"title": "$incident_title", "severity": "p1", ...}
```

### Apps Shuffle utiles pour la plateforme

- **TheHive** : créer/modifier des cases
- **MISP** : rechercher des IOCs, créer des événements
- **Cortex** : lancer des analyzers
- **Slack/Teams** : notifications
- **VirusTotal** : enrichissement
- **Shodan** : reconnaissance

---

## 9. Intégration NetBox (CMDB)

### Configuration

```env
NETBOX_URL=http://netbox:8080
NETBOX_TOKEN=<votre_token>
```

### Synchronisation automatique

La synchronisation NetBox → plateforme s'exécute automatiquement toutes les 4h.  
Les champs synchronisés par IP : `vendor`, `model`, `rack`, `rack_unit`, `netbox_id`.

### Déclencher une sync manuelle

```bash
docker compose exec celery-worker celery -A app.tasks.celery_app call \
  app.tasks.maintenance_tasks.sync_netbox_inventory
```

### API NetBox depuis la plateforme

```python
import httpx

headers = {"Authorization": f"Token {NETBOX_TOKEN}"}

# Récupérer les équipements
devices = httpx.get(
    "http://localhost:8080/api/dcim/devices/?limit=500",
    headers=headers
).json()["results"]

# Mettre à jour un équipement
httpx.patch(
    f"http://localhost:8080/api/dcim/devices/{device_id}/",
    json={"status": "active"},
    headers=headers,
)
```

---

## 10. Intégration Grafana

### Sources de données préconfigurées

| Source | Type | Usage |
|--------|------|-------|
| Prometheus | Prometheus | Métriques système et réseau |
| InfluxDB | InfluxDB v2 | Métriques applicatives collectées |
| Elasticsearch | Elasticsearch | Logs et événements de sécurité |

### Requête InfluxDB (Flux)

```flux
from(bucket: "metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r["device_id"] == "uuid-device")
  |> filter(fn: (r) => r["_field"] == "cpu_usage")
  |> aggregateWindow(every: 5m, fn: mean)
```

### Requête Prometheus

```promql
# CPU des équipements supervisés par SNMP
node_cpu_seconds_total{job="snmp-exporter"}

# Disponibilité
up{job="snmp-exporter"}

# Alertes actives
ALERTS{alertstate="firing"}
```

### Exporter un dashboard Grafana

```bash
# Via l'API Grafana
curl http://admin:$GRAFANA_PASSWORD@localhost:3000/api/dashboards/uid/<uid>
```

---

## 11. Notifications externes

### Email (SMTP)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noc@votre-domaine.com
SMTP_PASSWORD=<mot_de_passe_app>
ALERT_EMAIL_FROM=noc@votre-domaine.com
ALERT_EMAIL_TO=["equipe-noc@votre-domaine.com","on-call@votre-domaine.com"]
```

### Slack

```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
```

Format du message envoyé :
```json
{
  "text": "*[CRITICAL] CPU critique sur sw-core-01*\nValeur: 96% (seuil: 95%)\nHôte: 10.0.0.1"
}
```

### Microsoft Teams

```env
TEAMS_WEBHOOK_URL=https://votre-org.webhook.office.com/webhookb2/...
```

### PagerDuty

```env
PAGERDUTY_SERVICE_KEY=<clé_d_intégration>
```

Déclenche automatiquement pour les alertes `emergency`.

### Tester les notifications

```bash
# Tester Slack directement
curl -X POST $SLACK_WEBHOOK_URL \
  -H "Content-type: application/json" \
  -d '{"text": "Test SOC/NOC Platform"}'

# Vérifier les logs de notification
docker compose logs celery-worker 2>&1 | grep -i "notification\|slack\|email"
```

---

## 12. Collecte de données — Protocoles

### SNMP v3 (recommandé)

```env
SNMP_VERSION=v3
SNMP_COMMUNITY=public    # Utilisé pour v1/v2c uniquement
SNMP_POLL_INTERVAL=60
```

Configuration par équipement (via l'API) :
```json
{
  "monitoring_protocol": "snmp_v3",
  "snmp_auth_protocol": "SHA",
  "snmp_priv_protocol": "AES",
  "snmp_username": "noc_monitor",
  "snmp_auth_password": "...",
  "snmp_priv_password": "..."
}
```

### Syslog

```
# Configurer les équipements réseau pour envoyer vers :
UDP : <IP_SERVEUR>:514
TCP : <IP_SERVEUR>:601
```

Exemple Cisco IOS :
```
logging <IP_SERVEUR>
logging trap informational
logging facility local6
```

### NetFlow v5

```
# Sur les routeurs Cisco :
interface GigabitEthernet0/0
  ip flow ingress
  ip flow egress

ip flow-export destination <IP_SERVEUR> 2055
ip flow-export version 5
ip flow-export source Loopback0
```

### Modbus TCP

```json
{
  "ip_address": "192.168.1.100",
  "monitoring_protocol": "modbus_tcp",
  "modbus_port": 502,
  "modbus_unit_id": 1
}
```

---

## 13. Kafka — Événements en streaming

### Topics disponibles

| Topic | Producteurs | Consommateurs | Format |
|-------|-------------|---------------|--------|
| `noc.metrics` | Collecteurs SNMP/Modbus/BACnet | Backend WebSocket, InfluxDB | JSON |
| `noc.alerts` | AlertService | Backend WebSocket, Logstash | JSON |
| `noc.syslog` | SyslogCollector | Logstash, Backend | JSON |
| `noc.netflow` | NetFlowCollector | Backend, Elasticsearch | JSON |
| `soc.events` | Wazuh, Syslog (patterns sécurité) | Backend WebSocket, SIEM | JSON |

### Publier un événement sur Kafka (externe)

```python
from aiokafka import AIOKafkaProducer
import json, asyncio

async def publish():
    producer = AIOKafkaProducer(bootstrap_servers="localhost:29092")
    await producer.start()
    try:
        await producer.send(
            "soc.events",
            json.dumps({
                "type": "external_alert",
                "source": "mon_système",
                "severity": "critical",
                "message": "Événement de sécurité détecté",
                "source_ip": "198.51.100.1",
                "timestamp": "2024-06-05T12:00:00Z",
            }).encode()
        )
    finally:
        await producer.stop()

asyncio.run(publish())
```

### Consommer les événements Kafka (externe)

```python
from aiokafka import AIOKafkaConsumer
import json, asyncio

async def consume():
    consumer = AIOKafkaConsumer(
        "noc.alerts",
        bootstrap_servers="localhost:29092",
        group_id="mon-système",
        auto_offset_reset="latest",
    )
    await consumer.start()
    try:
        async for msg in consumer:
            alert = json.loads(msg.value)
            print(f"Alerte reçue: {alert['title']} [{alert['severity']}]")
    finally:
        await consumer.stop()

asyncio.run(consume())
```

---

## 14. Exemples d'automatisation

### Script Python — Créer une alerte depuis un système externe

```python
import httpx

BASE = "http://localhost:8000/api/v1"

# Connexion
token = httpx.post(f"{BASE}/auth/login",
    data={"username": "admin", "password": "..."}).json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Créer une alerte
alert = httpx.post(f"{BASE}/alerts", headers=headers, json={
    "title": "Anomalie détectée par système de monitoring externe",
    "message": "Pic de trafic anormal détecté sur le lien WAN",
    "severity": "critical",
    "category": "performance",
    "source_ip": "10.0.0.1",
    "source_name": "Router-WAN-01",
    "metric_name": "wan_traffic_mbps",
    "metric_value": 9850.0,
    "metric_unit": "Mbps",
    "threshold_value": 8000.0,
}).json()
print("Alerte créée:", alert["id"])
```

### Script Bash — Vérifier un IOC et créer un incident si trouvé

```bash
#!/bin/bash
IP_TO_CHECK="198.51.100.1"
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -F "username=admin" -F "password=<mdp>" | jq -r '.access_token')

# Vérifier l'IOC
RESULT=$(curl -s -X POST http://localhost:8000/api/v1/threat-intel/iocs/lookup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"value\": \"$IP_TO_CHECK\"}")

FOUND=$(echo $RESULT | jq -r '.found')
LEVEL=$(echo $RESULT | jq -r '.threat_level')

if [ "$FOUND" = "true" ] && [ "$LEVEL" -le 2 ]; then
  echo "IOC HIGH/MEDIUM trouvé — création d'un incident P1"
  curl -s -X POST http://localhost:8000/api/v1/incidents \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"title\": \"IOC détecté — IP $IP_TO_CHECK confirmée dans MISP\",
      \"severity\": \"p1\",
      \"incident_type\": \"intrusion_attempt\",
      \"description\": \"IP $IP_TO_CHECK identifiée avec niveau de menace $LEVEL dans MISP\",
      \"impacted_sites\": [\"primary\"]
    }"
fi
```

### Webhook entrant — Recevoir des alertes Zabbix

```python
# Script Python à placer dans Zabbix comme media type "Webhook"
import urllib.request
import json

token_resp = urllib.request.urlopen(urllib.request.Request(
    "http://soc-platform:8000/api/v1/auth/login",
    data=b"username=zabbix_integration&password=<mdp>",
))
token = json.loads(token_resp.read())["access_token"]

alert_data = json.dumps({
    "title": f"[Zabbix] {parameters['event.name']}",
    "message": parameters["event.opdata"],
    "severity": "critical" if parameters["event.severity"] == "5" else "warning",
    "category": "availability",
    "source_name": parameters["host.name"],
    "source_ip": parameters["host.ip"],
}).encode()

req = urllib.request.Request(
    "http://soc-platform:8000/api/v1/alerts",
    data=alert_data,
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    method="POST",
)
urllib.request.urlopen(req)
```
