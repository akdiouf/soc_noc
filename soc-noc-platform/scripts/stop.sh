#!/bin/bash
cd "$(dirname "${BASH_SOURCE[0]}")/../docker"
echo "Arrêt de la plateforme SOC/NOC..."
docker-compose down
echo "✅ Tous les services sont arrêtés."
