#!/bin/bash
# ---------------------------------------------------------------------------
# Home Automation — Auto-Update Script
# Runs every 5 minutes via cron. Checks for new commits on main, pulls them,
# rebuilds containers, and health-checks. On failure, rolls back through
# increasingly aggressive recovery layers before giving up and rebooting.
# ---------------------------------------------------------------------------
set -euo pipefail

APP=/opt/home-automation
LOG=/var/log/home-automation/update.log
COMPOSE="docker compose -f $APP/docker-compose.prod.yml"
MAX_LOG_LINES=500
LOCK_FILE=/tmp/ha-update.lock

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
cd "$APP"

# Ensure we're on main and fetch latest
git fetch origin main --quiet 2>/dev/null

CURRENT=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

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
git pull origin main --quiet

log "Rebuilding containers..."
$COMPOSE up -d --build 2>&1 | tail -5 | while IFS= read -r line; do
  log "  [compose] $line"
done

log "Waiting for health check..."
if health_check 12; then
  log "✓ Update successful — running ${REMOTE:0:7}"
  trim_log
  exit 0
fi

# ---------------------------------------------------------------------------
# Layer 2: Rollback to previous commit + rebuild
# ---------------------------------------------------------------------------
log "✗ Health check failed after update"
log "Rolling back to ${PREV_COMMIT:0:7}..."

git reset --hard "$PREV_COMMIT"

$COMPOSE up -d --build 2>&1 | tail -3 | while IFS= read -r line; do
  log "  [compose] $line"
done

if health_check 12; then
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
$COMPOSE up -d

if health_check 24; then
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

sudo reboot
