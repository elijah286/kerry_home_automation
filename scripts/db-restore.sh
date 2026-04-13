#!/usr/bin/env bash
# Replace the Home Automation database on THIS machine with a pg_dump backup.
# Stops backend/frontend briefly to drop connections, then pg_restore --clean.
#
# ⚠️  This DESTROYS the current contents of database "home_automation" on the
#     Postgres instance used by the compose file (typically production).
#
# Production server (lcars), example:
#   cd /opt/home-automation
#   git pull
#   ./scripts/db-restore.sh ./backups/ha-postgres-YYYYMMDD-HHMMSS.dump
#
# Usage (after scp of the dump to the server):
#   ./scripts/db-restore.sh ./backups/ha-postgres-....dump
#   COMPOSE_FILE=docker-compose.prod.yml ./scripts/db-restore.sh ./backups/ha-postgres-....dump
#
# Default COMPOSE_FILE is docker-compose.prod.yml so a copy-paste on lcars works.
#
set -euo pipefail

echo "If this is production, consider running scripts/db-dump.sh here FIRST so you keep a rollback copy."
echo ""

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DUMP="${1:?Usage: $0 <backup.dump>}"

if [[ ! -f "$DUMP" ]]; then
  echo "File not found: $DUMP"
  exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U ha_user -d home_automation &>/dev/null; then
  echo "Postgres is not ready. Start the stack or at least postgres."
  exit 1
fi

echo "Stopping writers (backend, frontend) if present..."
docker compose -f "$COMPOSE_FILE" stop backend frontend 2>/dev/null || true

echo "Terminating other sessions on home_automation (if any)..."
docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U ha_user -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'home_automation' AND pid <> pg_backend_pid();
SQL

echo "Restoring from: $DUMP"
# --clean --if-exists: drop objects before recreate; --no-owner avoids role mismatch
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore -U ha_user -d home_automation --clean --if-exists --no-owner --no-acl -F c \
  < "$DUMP"

echo "Starting stack again..."
docker compose -f "$COMPOSE_FILE" up -d

echo "Done. Verify: docker compose -f $COMPOSE_FILE logs backend --tail 30"
echo "Note: Redis device state is separate — you may need to re-sync or clear ha4:device_state if things look stale."
