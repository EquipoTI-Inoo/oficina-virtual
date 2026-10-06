#!/usr/bin/env sh
# Borra la base local y la vuelve a crear con el esquema y las semillas.
set -e
cd "$(dirname "$0")"
docker compose stop postgres
docker compose rm -f postgres
docker volume rm inoo-pruebas_datos-postgres 2>/dev/null || true
docker compose up -d postgres
echo "Base reiniciada con database/migraciones + database/semillas"
