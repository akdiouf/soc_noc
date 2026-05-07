#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "╔══════════════════════════════════════╗"
echo "║     SOC/NOC Platform — Démarrage     ║"
echo "╚══════════════════════════════════════╝"

# Vérifier que .env existe
if [ ! -f ".env" ]; then
    echo "[!] Fichier .env manquant — copie du template..."
    cp .env.example .env
    echo "[!] Modifiez le fichier .env avant de relancer."
    exit 1
fi

# Construire et démarrer
cd docker/
echo "[*] Construction des images..."
docker-compose build --no-cache backend frontend

echo "[*] Démarrage des services d'infrastructure..."
docker-compose up -d postgres influxdb redis zookeeper kafka elasticsearch
echo "[*] Attente initialisation des bases de données (30s)..."
sleep 30

echo "[*] Démarrage des services de monitoring..."
docker-compose up -d prometheus alertmanager grafana snmp-exporter logstash kibana

echo "[*] Démarrage du backend et Celery..."
docker-compose up -d backend celery-worker celery-beat

echo "[*] Démarrage des services SOC..."
docker-compose up -d wazuh-manager thehive cortex shuffle-backend

echo "[*] Démarrage du frontend et proxy..."
docker-compose up -d frontend nginx

echo ""
echo "✅ Plateforme démarrée !"
echo ""
echo "Accès :"
echo "  🌐 Portail NOC/SOC : http://localhost"
echo "  📊 Grafana         : http://localhost/grafana (admin/$(grep GRAFANA_PASSWORD ../.env | cut -d= -f2))"
echo "  🔍 Kibana (SOC)    : http://localhost/kibana"
echo "  📚 API Docs        : http://localhost/docs"
echo "  📦 NetBox (CMDB)   : http://localhost:8080"
echo "  🔔 TheHive         : http://localhost:9000"
echo "  🤖 Shuffle (SOAR)  : http://localhost:5001"
echo ""
docker-compose ps
