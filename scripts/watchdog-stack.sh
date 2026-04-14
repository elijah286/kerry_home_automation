#!/usr/bin/env bash
# Ensure the production stack (at least backend API on :3000) is running.
# Intended for systemd timer on the hub host. Docker's restart policy handles
# crashed containers; this catches "service missing", failed partial compose, etc.
#
# Env (optional):
#   HA_APP_ROOT        — repo root (default /opt/home-automation)
#   HA_COMPOSE_FILE    — compose file path (default $HA_APP_ROOT/docker-compose.prod.yml)
#   HA_BACKEND_HEALTH_URL — URL to probe (default http://127.0.0.1:3000/api/health)
set -euo pipefail

WORKDIR="${HA_APP_ROOT:-/opt/home-automation}"
COMPOSE_FILE="${HA_COMPOSE_FILE:-$WORKDIR/docker-compose.prod.yml}"
HEALTH_URL="${HA_BACKEND_HEALTH_URL:-http://127.0.0.1:3000/api/health}"

check() {
  curl -sf --max-time 8 "$HEALTH_URL" >/dev/null
}

if check; then
  exit 0
fi

echo "$(date -Iseconds 2>/dev/null || date) watchdog: API unhealthy, retrying in 15s..." >&2
sleep 15

if check; then
  exit 0
fi

echo "$(date -Iseconds 2>/dev/null || date) watchdog: still unhealthy; docker compose up -d" >&2
cd "$WORKDIR"
exec /usr/bin/docker compose -f "$COMPOSE_FILE" up -d
