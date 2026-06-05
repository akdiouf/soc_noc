#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "╔══════════════════════════════════════╗"
echo "║     SOC/NOC Platform — Démarrage     ║"
echo "╚══════════════════════════════════════╝"

if [ ! -f ".env" ]; then
    echo "[!] Fichier .env manquant — copie du template..."
    cp .env.example .env
    echo "[!] Modifiez le fichier .env avant de relancer."
    exit 1
fi

cd docker/
DC="docker compose --env-file ../.env"

echo "[*] Construction des images backend et frontend..."
$DC build backend frontend

echo "[*] Démarrage de tous les services..."
$DC up -d

echo ""
echo "[*] Attente de la disponibilité des services (20s)..."
sleep 20

echo ""
echo "✅ Plateforme démarrée !"
echo ""
echo "Accès :"
echo "  Portail NOC/SOC  : http://localhost:8090"
echo "  API Docs         : http://localhost:8000/docs"
echo "  Grafana          : http://localhost:3000   (admin/$(grep GRAFANA_PASSWORD ../.env | cut -d= -f2))"
echo "  Kibana           : http://localhost:5601"
echo "  NetBox (CMDB)    : http://localhost:8080"
echo "  TheHive          : http://localhost:9000"
echo "  Shuffle (SOAR)   : http://localhost:5001"
echo ""
$DC ps