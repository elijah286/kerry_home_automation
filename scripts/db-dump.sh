#!/usr/bin/env bash
# Export the Home Automation Postgres database to a custom-format dump file.
#
# Run on the machine that has the data you want to KEEP (usually your dev box
# with `docker compose` running, or any host that can reach Postgres).
#
# Usage:
#   ./scripts/db-dump.sh [output.dump]
#   COMPOSE_FILE=docker-compose.yml ./scripts/db-dump.sh
#
# Default COMPOSE_FILE is docker-compose.yml (dev). Use docker-compose.prod.yml
# only if you mean to dump production (e.g. backup before restore).
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${1:-${ROOT}/backups/ha-postgres-${STAMP}.dump}"
mkdir -p "$(dirname "$OUT")"

if ! docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U ha_user -d home_automation &>/dev/null; then
  echo "Postgres is not ready. Start it first, e.g.:"
  echo "  docker compose -f $COMPOSE_FILE up -d postgres"
  exit 1
fi

echo "Dumping from compose file: $COMPOSE_FILE -> $OUT"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U ha_user -d home_automation -Fc -Z 9 \
  > "$OUT"

echo "Done. Copy this file to the production server (scp), then run scripts/db-restore.sh there."
ls -la "$OUT"
