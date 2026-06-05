# Guide d'Utilisation — SOC/NOC Platform

## Table des matières
1. [Connexion et interface](#1-connexion-et-interface)
2. [Dashboard principal](#2-dashboard-principal)
3. [Gestion des équipements (NOC)](#3-gestion-des-équipements-noc)
4. [Gestion des alertes](#4-gestion-des-alertes)
5. [Gestion des incidents](#5-gestion-des-incidents)
6. [Métriques et supervision](#6-métriques-et-supervision)
7. [Fonctions SOC — Événements de sécurité](#7-fonctions-soc--événements-de-sécurité)
8. [Threat Intelligence (MISP)](#8-threat-intelligence-misp)
9. [Infrastructure physique](#9-infrastructure-physique)
10. [Accès aux plateformes intégrées](#10-accès-aux-plateformes-intégrées)
11. [Workflows recommandés](#11-workflows-recommandés)

---

## 1. Connexion et interface

### Accès à la plateforme

Ouvrir un navigateur et accéder à : **http://localhost:8090**

| Champ | Valeur |
|-------|--------|
| Identifiant | `admin` (ou votre login) |
| Mot de passe | Défini à l'installation |

### Structure de l'interface

```
┌──────────────┬─────────────────────────────────────┐
│   Sidebar    │           Zone de contenu            │
│              │                                      │
│  NOC         │                                      │
│  ├ Dashboard │                                      │
│  ├ Équipem.  │                                      │
│  ├ Alertes   │                                      │
│  ├ Incidents │                                      │
│  ├ Métriques │                                      │
│  └ Topologie │                                      │
│              │                                      │
│  Physique    │                                      │
│  SOC         │                                      │
│  Plateformes │                                      │
│  Admin       │                                      │
└──────────────┴─────────────────────────────────────┘
```

Le menu **Plateformes** (en bas de la sidebar) donne accès aux outils externes : Grafana, Kibana, Wazuh, TheHive, MISP, etc. Chaque lien s'ouvre dans un nouvel onglet.

---

## 2. Dashboard principal

Le dashboard présente une vue synthétique de l'état du datacenter :

- **Compteurs d'alertes** par sévérité (Info / Warning / Critical / Emergency)
- **État des équipements** (Up / Down / Warning / Maintenance)
- **Incidents ouverts** en cours
- **Flux d'alertes temps réel** (WebSocket)
- **Carte géographique** des équipements (si coordonnées configurées)

> Les données sont rafraîchies automatiquement toutes les 10 secondes via WebSocket.

---

## 3. Gestion des équipements (NOC)

### Types d'équipements supportés

**Réseau :** routeur, switch, firewall, load balancer, point d'accès  
**Serveurs :** serveur physique, hyperviseur, machine virtuelle  
**Stockage :** NAS, SAN  
**Physique :** UPS, PDU, CRAC, CRAH, groupe électrogène, ATS, chiller  
**Sécurité :** contrôle d'accès, caméra, détecteur de fumée  

### Protocoles de supervision

| Protocole | Usages typiques |
|-----------|-----------------|
| SNMP v1/v2c/v3 | Réseau, serveurs, UPS, PDU |
| Modbus TCP/RTU | Équipements industriels, onduleurs |
| BACnet/IP | Systèmes CVC, GTB |
| ICMP (ping) | Disponibilité simple |
| REST API | Équipements avec API |
| SSH / WMI / IPMI | Serveurs |

### Ajouter un équipement

1. Aller dans **Équipements** → cliquer **+ Ajouter**
2. Renseigner :
   - Nom, IP, type, site (Principal / Repli)
   - Protocole de monitoring + intervalle de polling
   - Rack / salle (pour la cartographie physique)
   - Cocher **Critique** si l'équipement doit déclencher des alertes P1
3. Sauvegarder — le polling démarre immédiatement

### Statuts des équipements

| Statut | Signification |
|--------|---------------|
| `Up` | Équipement opérationnel |
| `Down` | Équipement injoignable |
| `Warning` | Seuil d'avertissement dépassé |
| `Critical` | Seuil critique dépassé |
| `Unknown` | Pas encore pollé |
| `Maintenance` | Exclu de la supervision |

### Passer un équipement en maintenance

1. Dans la liste des équipements, cliquer sur l'équipement
2. Cliquer **Maintenance** → confirmer
3. Les alertes ne seront plus générées pendant la maintenance
4. Pensez à désactiver la maintenance à la fin des travaux

---

## 4. Gestion des alertes

### Sévérités

| Niveau | Couleur | Délai de réponse recommandé |
|--------|---------|----------------------------|
| Emergency | Rouge vif | Immédiat (< 5 min) |
| Critical | Rouge | < 15 min |
| Warning | Jaune | < 1h |
| Info | Bleu | Journalier |

### Catégories d'alertes

**NOC :** Disponibilité, Performance, Capacité, Configuration  
**Physique :** Alimentation, Température, Humidité, Climatisation, Accès  
**SOC :** Sécurité, Intrusion, Anomalie, Conformité  

### Actions sur les alertes

**Acquitter (`Acknowledge`)** : Signale que l'alerte a été prise en compte. Elle reste active mais n'est plus comptée comme "nouvelle".

**Résoudre (`Resolve`)** : Clôture l'alerte avec une note de résolution. Les alertes résolues sont automatiquement supprimées après 30 jours.

**Acquittement en masse** : Cocher plusieurs alertes → **Acquitter la sélection**

### Filtres disponibles

- Par sévérité, statut, catégorie
- Par équipement source
- Recherche textuelle

### Corrélation automatique

Le système corrèle automatiquement les alertes identiques provenant du même équipement dans une fenêtre de 24h. Le compteur `occurrence_count` indique combien de fois l'alerte s'est reproduite.

---

## 5. Gestion des incidents

### Cycle de vie d'un incident

```
OPEN → IN_PROGRESS → PENDING → RESOLVED → CLOSED
                                        ↘ POST_MORTEM
```

### Sévérités P1-P5

| Sévérité | Impact | SLA réponse |
|----------|--------|-------------|
| P1 | Total — service complètement indisponible | 15 min |
| P2 | Majeur — impact partiel significatif | 1h |
| P3 | Modéré — impact limité | 4h |
| P4 | Mineur — impact négligeable | 24h |
| P5 | Informatif / changement planifié | — |

### Créer un incident

1. **Incidents** → **+ Créer un incident**
2. Renseigner : titre, description, sévérité, type, services impactés, sites impactés
3. Optionnel : assigner à un membre de l'équipe, renseigner l'équipe responsable
4. **Créer** → un numéro de ticket est auto-généré (ex: `INC-20240605-A1B2C3D4`)

### Timeline d'incident

Chaque changement de statut, commentaire ou action est horodaté dans la timeline de l'incident. Pour ajouter une entrée :

1. Ouvrir l'incident → onglet **Timeline**
2. Saisir le message → **Ajouter**

### Exporter vers TheHive

Pour les incidents de sécurité, il est possible de créer automatiquement un case TheHive :

1. Ouvrir l'incident → **Exporter vers TheHive**
2. Un case est créé avec la sévérité mappée (P1→4, P2→3, P3→2)
3. L'ID du case TheHive est enregistré dans l'incident

### Post-mortem

Après résolution d'un incident P1/P2 :

1. Passer le statut en `POST_MORTEM`
2. Renseigner : **Cause racine**, **Étapes de résolution**, **Leçons apprises**, **Actions préventives**
3. Repasser en `CLOSED`

### MTTR (Mean Time To Resolve)

Le MTTR est calculé automatiquement entre `started_at` et `resolved_at`. Les statistiques sont visibles via le graphique MTTR par sévérité (menu **Métriques**).

---

## 6. Métriques et supervision

### Métriques collectées automatiquement

**Réseau (SNMP) :**
- Utilisation CPU, mémoire
- Trafic interfaces (in/out en Mbps)
- Erreurs/discards interfaces
- Latence, disponibilité

**Serveurs :**
- CPU, RAM, disque, load average
- Nombre de processus, connexions réseau

**UPS (RFC 1628 + APC MIB) :**
- Charge batterie (%)
- Tension entrée/sortie
- Température interne
- Autonomie restante (minutes)
- Statut : on-line, on-battery, bypass

**Modbus / BACnet :**
- Consommation électrique (kW)
- Température ambiante (°C)
- Humidité relative (%)

### Visualisation dans Grafana

Ouvrir **Plateformes → Grafana** (ou http://localhost:8090/grafana/).

Tableaux de bord préconfigurés :
- **NOC Overview** : vue globale tous équipements
- **Réseau** : trafic, erreurs interfaces
- **Serveurs** : CPU, RAM, disque
- **UPS & Alimentation** : batteries, puissance
- **Température** : carte thermique datacenter

### Seuils d'alerte configurables

Les seuils sont définis dans `.env` et dans la table `metric_thresholds` de PostgreSQL. Une modification dans `.env` nécessite un redémarrage du backend.

---

## 7. Fonctions SOC — Événements de sécurité

### Sources d'événements de sécurité

- **Syslog** : UDP/TCP sur le port 514/601 → détection de patterns (brute force, port scan, privilege escalation, malware…)
- **NetFlow** : port 2055 → analyse de trafic, ports suspects
- **Wazuh** : agents sur les hôtes, règles SIEM
- **Kafka** topic `soc.events` : événements corrélés

### Patterns détectés automatiquement

| Pattern | Description |
|---------|-------------|
| `auth_failure` | Échec d'authentification |
| `brute_force` | Tentatives répétées de connexion |
| `port_scan` | Scan de ports détecté |
| `privilege_escalation` | Élévation de privilèges |
| `malware` | Signature malware |
| `intrusion_attempt` | Tentative d'intrusion réseau |
| `data_exfiltration` | Transfert de données suspect |

### Wazuh SIEM

Accessible via **Plateformes → Wazuh** (http://localhost:8090/wazuh).

- Déployer les agents Wazuh sur les hôtes Linux/Windows à superviser
- Règles préconfigurées pour les attaques courantes
- Intégration avec le MISP pour l'enrichissement des alertes

---

## 8. Threat Intelligence (MISP)

### Accès

- **Interface MISP** : http://localhost:8081 (ou **Plateformes → MISP**)
- **Page TI dans la plateforme** : menu **SOC → Threat Intel**

### Fonctionnalités de la page Threat Intel

#### Statut MISP
Badge vert/rouge indiquant si la connexion à MISP est opérationnelle.

#### Recherche IOC (Indicateur de Compromission)
1. Saisir une valeur : adresse IP, nom de domaine, hash MD5/SHA256, URL
2. Cliquer **Vérifier**
3. Le système interroge d'abord le cache local, puis MISP en direct si absent
4. Résultat : trouvé (avec niveau de menace) ou propre

#### Cache IOC local
Tableau de tous les IOCs synchronisés depuis MISP, filtrable par :
- Type (ip-dst, domain, md5, sha256, url…)
- Niveau de menace (Élevé / Moyen / Faible / Indéfini)
- TLP (WHITE / GREEN / AMBER / RED)
- Valeur (recherche textuelle)

#### Niveaux de menace MISP

| Niveau | Signification |
|--------|---------------|
| 1 — Élevé | Menace active confirmée |
| 2 — Moyen | Menace probable |
| 3 — Faible | Information de faible criticité |
| 4 — Indéfini | Non classifié |

#### TLP (Traffic Light Protocol)

| TLP | Diffusion |
|-----|-----------|
| WHITE | Public |
| GREEN | Communauté |
| AMBER | Organisation + partenaires |
| RED | Équipe restreinte uniquement |

#### Synchronisation

La synchronisation est automatique toutes les 6h. Pour forcer une sync :
- Cliquer **Synchroniser** sur la page Threat Intel
- Ou via l'API : `POST /api/v1/threat-intel/sync`

#### Enrichissement automatique des alertes

Lorsqu'une alerte de sécurité avec une IP source est créée, le système vérifie automatiquement l'IP dans le cache MISP. Si un match est trouvé, les détails MISP sont ajoutés au champ `raw_data` de l'alerte.

### Ajouter des feeds MISP

Dans l'interface MISP (http://localhost:8081) :
1. **Sync → Feeds**
2. Cliquer **Load default feeds**
3. Activer les feeds souhaités (ex: CIRCL OSINT Feed, Abuse.ch URLhaus)
4. **Fetch and store all feeds**

---

## 9. Infrastructure physique

### Alimentation (Power)

- Vue de l'état de tous les UPS et PDU
- Charge batterie, autonomie restante
- Alertes configurées sur seuils batterie (30% warning, 15% critique)
- Historique de consommation électrique

### Climatisation

- Température ambiante par zone/salle
- Humidité relative
- État des CRAC/CRAH
- Alertes sur dépassement de température (30°C warning, 40°C critique)

### Contrôle d'accès

- Journal des entrées/sorties
- État des portes et accès
- Alertes sur accès non autorisés

---

## 10. Accès aux plateformes intégrées

Le menu **Plateformes** dans la sidebar donne accès en un clic à :

### Supervision
| Outil | URL | Usage |
|-------|-----|-------|
| Grafana | http://localhost:8090/grafana/ | Dashboards métriques |
| Prometheus | http://localhost:8090/prometheus/ | Requêtes PromQL brutes |
| Alertmanager | http://localhost:8090/alerts/ | Gestion des silences |
| Kibana | http://localhost:8090/kibana | Recherche dans les logs |

### SOC
| Outil | URL | Usage |
|-------|-----|-------|
| Wazuh | http://localhost:8090/wazuh | SIEM / EDR |
| TheHive | http://localhost:8090/thehive | Case management IR |
| Cortex | http://localhost:8090/cortex | Analyzers / Responders |
| MISP | http://localhost:8081 | Threat Intelligence |
| Shuffle | http://localhost:3002 | Playbooks SOAR |

### Infrastructure
| Outil | URL | Usage |
|-------|-----|-------|
| NetBox | http://localhost:8090/netbox | CMDB inventaire |

---

## 11. Workflows recommandés

### Workflow NOC — Alerte critique

```
1. Alerte Emergency reçue (notification Email/Slack/PagerDuty)
2. Vérifier dans la plateforme : Alertes → filtrer Emergency
3. Identifier l'équipement source → Équipements
4. Vérifier les métriques historiques (Grafana)
5. Si incident confirmé :
   a. Créer un incident P1 → assigner à l'équipe NOC
   b. Passer le statut en IN_PROGRESS
   c. Mettre l'équipement en maintenance si intervention physique
6. Documenter dans la timeline
7. À résolution : noter la cause racine + passer en RESOLVED
8. Post-mortem si P1/P2
```

### Workflow SOC — Incident de sécurité

```
1. Alerte de sécurité détectée (Wazuh, Syslog, Threat Intel)
2. Vérifier dans SOC → Événements de sécurité
3. Rechercher l'IP/domaine dans Threat Intel → lookup IOC
4. Si IOC connu (MISP) : escalader immédiatement
5. Créer un incident SOC (type : security_breach / intrusion_attempt)
6. Exporter vers TheHive → créer un case d'investigation
7. Utiliser Cortex pour enrichir les observables
8. Déclencher un playbook Shuffle si disponible
9. Contenir la menace, documenter dans la timeline
10. Clôturer avec post-mortem
```

### Workflow Threat Intelligence

```
Quotidien :
1. Vérifier les nouveaux événements MISP (Threat Intel → Événements)
2. Contrôler le statut de synchronisation
3. Comparer avec les alertes de sécurité actives

En réponse à un incident :
1. Copier l'IP/domaine/hash suspect
2. Threat Intel → Recherche IOC → Vérifier
3. Si trouvé dans MISP : documenter dans l'incident avec le niveau de menace
4. Partager la découverte dans MISP si elle est nouvelle (depuis l'interface MISP)
```
