#!/bin/bash
set -e
cd "$(dirname "${BASH_SOURCE[0]}")/../docker"

echo "⚠️  ATTENTION: Cette opération supprime TOUTES les données (volumes Docker)."
read -p "Êtes-vous sûr ? (oui/non): " confirm
if [ "$confirm" != "oui" ]; then
    echo "Annulé."
    exit 0
fi

echo "Arrêt des services..."
docker-compose down -v
echo "Suppression des images construites..."
docker-compose rm -f
echo "✅ Reset complet. Relancez avec: bash scripts/start.sh"
