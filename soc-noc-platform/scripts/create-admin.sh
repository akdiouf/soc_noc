#!/bin/bash
# Créer l'utilisateur admin initial via l'API
set -e

API_URL="${1:-http://localhost:8000/api/v1}"
ADMIN_USER="${2:-admin}"
ADMIN_PASS="${3:-AdminSOCNOC2024!}"
ADMIN_EMAIL="${4:-admin@datacenter.local}"

echo "Création de l'utilisateur admin sur $API_URL..."

# Se connecter en tant que root (si l'API est fraîche, le premier admin est créé sans auth)
curl -s -X POST "$API_URL/auth/users" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$ADMIN_EMAIL\",
    \"username\": \"$ADMIN_USER\",
    \"full_name\": \"Administrateur SOC/NOC\",
    \"password\": \"$ADMIN_PASS\",
    \"role\": \"super_admin\"
  }" | python3 -m json.tool

echo ""
echo "✅ Admin créé: $ADMIN_USER / $ADMIN_PASS"
echo "   URL: $API_URL/docs"
