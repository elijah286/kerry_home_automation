#!/bin/bash
# ---------------------------------------------------------------------------
# Home Automation — Auto-Update Script
# Runs every 5 minutes via cron. Checks for new commits on main, pulls them,
# rebuilds containers, and health-checks. On failure, rolls back through
# increasingly aggressive recovery layers before giving up and rebooting.
#
# Postgres data (users/passwords) live in the Docker volume postgres_data.
# Normal deploys do NOT reset them. Never run: docker compose ... down -v
# (that deletes volumes). Use scripts/db-dump.sh for backups.
#
# For first-time empty DB installs, set ADMIN_INITIAL_PASSWORD in .env (see backend main.ts).
#
# OS reboot is NOT required for routine updates (only containers restart). A full reboot only
# happens in this script as a last-resort recovery step. If nginx + deploy/standby are
# installed, http://<server>/ (port 80) shows a static page while the app is unavailable;
# during automated updates we temporarily swap in "software update in progress".
#
# Updates are NOT scheduled by default. Use Settings → Software update (or run this script
# manually). To re-enable periodic pulls, see deploy/cron-home-automation.example.
# ---------------------------------------------------------------------------
set -euo pipefail

APP=/opt/home-automation
LOG=/var/log/home-automation/update.log
COMPOSE="docker compose -f $APP/docker-compose.prod.yml"
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE="docker-compose -f $APP/docker-compose.prod.yml"
fi
MAX_LOG_LINES=500
LOCK_FILE=/tmp/ha-update.lock

# Prefer --wait so Compose blocks until healthchecks pass (Compose plugin v2.12+).
compose_build_up() {
  if $COMPOSE up --help 2>&1 | grep -qE '[[:space:]]--wait[[:space:]]'; then
    $COMPOSE up -d --build --wait
  else
    $COMPOSE up -d --build
  fi
}

compose_up() {
  if $COMPOSE up --help 2>&1 | grep -qE '[[:space:]]--wait[[:space:]]'; then
    $COMPOSE up -d --wait
  else
    $COMPOSE up -d
  fi
}

# Port 80 nginx standby (optional): swap static page while we rebuild containers
STANDBY_WWW=/var/www/ha-standby
STANDBY_SWAPPED=0
restore_standby_page() {
  [[ "$STANDBY_SWAPPED" -eq 1 ]] || return 0
  if [[ -f "$STANDBY_WWW/standby.html.bak" ]]; then
    mv -f "$STANDBY_WWW/standby.html.bak" "$STANDBY_WWW/standby.html"
  fi
  rm -f "$STANDBY_WWW/ha-update-status.json"
  STANDBY_SWAPPED=0
}

# Prevent concurrent runs
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0  # Another instance is running
fi

# Ensure log directory exists
mkdir -p "$(dirname "$LOG")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"
}

trim_log() {
  if [ -f "$LOG" ]; then
    tail -n $MAX_LOG_LINES "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
}

# Health check: curl /api/health with retries
# Usage: health_check <num_retries>  (each retry waits 5s)
health_check() {
  local retries=$1
  local i
  for i in $(seq 1 "$retries"); do
    if curl -sf --max-time 5 http://localhost:3000/api/health > /dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  return 1
}

# ---------------------------------------------------------------------------
# Check for updates
# ---------------------------------------------------------------------------
# Git 2.35+ refuses repos whose owner differs from the current user (common with Docker mounts).
# Per-invocation safe.directory avoids needing `git config --global safe.directory` on the host.
ha_git() {
  command git -c "safe.directory=$APP" "$@"
}

cd "$APP"

# Ensure we're on main and fetch latest
ha_git fetch origin main --quiet 2>/dev/null

CURRENT=$(ha_git rev-parse HEAD)
REMOTE=$(ha_git rev-parse origin/main)

if [ "$CURRENT" = "$REMOTE" ]; then
  exit 0  # Nothing to do
fi

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Update available: ${CURRENT:0:7} → ${REMOTE:0:7}"
PREV_COMMIT="$CURRENT"

# ---------------------------------------------------------------------------
# Layer 1: Pull + rebuild
# ---------------------------------------------------------------------------
log "Pulling new code..."
ha_git pull origin main --quiet

if [[ -f "$APP/deploy/standby/updating.html" && -d "$STANDBY_WWW" ]]; then
  cp -a "$STANDBY_WWW/standby.html" "$STANDBY_WWW/standby.html.bak" 2>/dev/null || true
  cp -a "$APP/deploy/standby/updating.html" "$STANDBY_WWW/standby.html"
  echo '{"updating":true}' >"$STANDBY_WWW/ha-update-status.json"
  STANDBY_SWAPPED=1
  log "Standby page (port 80): showing software update message until health checks pass"
  trap restore_standby_page EXIT
fi

log "Rebuilding containers..."
COMPOSE_OUT=$(mktemp)
if ! compose_build_up >"$COMPOSE_OUT" 2>&1; then
  log "✗ Docker compose build/up failed — full log:"
  while IFS= read -r line; do log "  [compose] $line"; done <"$COMPOSE_OUT"
  rm -f "$COMPOSE_OUT"
  log "Rolling back git to ${PREV_COMMIT:0:7} so cron can retry (avoids repo ahead of running images)."
  ha_git reset --hard "$PREV_COMMIT"
  restore_standby_page || true
  trap - EXIT
  trim_log
  exit 1
fi
tail -n 24 "$COMPOSE_OUT" | while IFS= read -r line; do log "  [compose] $line"; done
rm -f "$COMPOSE_OUT"

log "Waiting for health check..."
if health_check 12; then
  restore_standby_page
  trap - EXIT
  log "✓ Update successful — running ${REMOTE:0:7}"
  trim_log
  exit 0
fi

# ---------------------------------------------------------------------------
# Layer 2: Rollback to previous commit + rebuild
# ---------------------------------------------------------------------------
log "✗ Health check failed after update"
log "Rolling back to ${PREV_COMMIT:0:7}..."

ha_git reset --hard "$PREV_COMMIT"

compose_build_up 2>&1 | tail -5 | while IFS= read -r line; do
  log "  [compose] $line"
done

if health_check 12; then
  restore_standby_page
  trap - EXIT
  log "✓ Rollback successful — bad commit was ${REMOTE:0:7}"
  trim_log
  exit 0
fi

# ---------------------------------------------------------------------------
# Layer 3: Cold restart (down + up, keep current code)
# ---------------------------------------------------------------------------
log "✗ Rollback health check failed"
log "Attempting cold restart..."

$COMPOSE down --timeout 30
sleep 5
compose_up 2>&1 | tail -5 | while IFS= read -r line; do
  log "  [compose] $line"
done

if health_check 24; then
  restore_standby_page
  trap - EXIT
  log "✓ Recovered via cold restart"
  trim_log
  exit 0
fi

# ---------------------------------------------------------------------------
# Layer 4: System reboot — last resort
# ---------------------------------------------------------------------------
log "✗ All recovery attempts failed"
log "Rebooting system as last resort..."
trim_log

restore_standby_page || true
trap - EXIT
sudo reboot
