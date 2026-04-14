#!/usr/bin/env bash
# Self-heal the production stack when the API is down (missing containers, stuck backend, etc.).
# Installed by scripts/install-systemd.sh as home-automation-watchdog.timer — no SSH required for recovery.
#
# Env (optional):
#   HA_APP_ROOT           — repo root (default /opt/home-automation)
#   HA_COMPOSE_FILE       — compose file (default $HA_APP_ROOT/docker-compose.prod.yml)
#   HA_BACKEND_HEALTH_URL — probe URL (default http://127.0.0.1:3000/api/health)
set -euo pipefail

WORKDIR="${HA_APP_ROOT:-/opt/home-automation}"
COMPOSE_FILE="${HA_COMPOSE_FILE:-$WORKDIR/docker-compose.prod.yml}"
HEALTH_URL="${HA_BACKEND_HEALTH_URL:-http://127.0.0.1:3000/api/health}"

if ! command -v docker >/dev/null 2>&1; then
  echo "$(date -Iseconds 2>/dev/null || date) watchdog: docker not in PATH" >&2
  exit 1
fi

compose() {
  (cd "$WORKDIR" && /usr/bin/docker compose -f "$COMPOSE_FILE" "$@")
}

check() {
  curl -sf --max-time 8 "$HEALTH_URL" >/dev/null
}

recover() {
  echo "$(date -Iseconds 2>/dev/null || date) watchdog: API unhealthy — reconciling stack..." >&2
  compose up -d --remove-orphans

  local i
  for i in 1 2 3 4 5; do
    sleep 4
    if check; then
      echo "$(date -Iseconds 2>/dev/null || date) watchdog: API healthy after compose up" >&2
      return 0
    fi
  done

  echo "$(date -Iseconds 2>/dev/null || date) watchdog: still unhealthy — restarting backend + frontend" >&2
  compose restart backend frontend 2>/dev/null || compose restart backend 2>/dev/null || true

  sleep 12
  if check; then
    echo "$(date -Iseconds 2>/dev/null || date) watchdog: API healthy after service restart" >&2
    return 0
  fi

  echo "$(date -Iseconds 2>/dev/null || date) watchdog: still unhealthy — recreating backend container" >&2
  compose up -d --force-recreate --no-deps backend

  sleep 20
  if check; then
    echo "$(date -Iseconds 2>/dev/null || date) watchdog: API healthy after backend recreate" >&2
    return 0
  fi

  echo "$(date -Iseconds 2>/dev/null || date) watchdog: API still down after recovery steps" >&2
  return 1
}

if check; then
  exit 0
fi

echo "$(date -Iseconds 2>/dev/null || date) watchdog: API check failed, waiting 15s..." >&2
sleep 15

if check; then
  exit 0
fi

recover || exit 1
exit 0
