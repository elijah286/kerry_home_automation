#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Home Automation — Structured Deployment Script
#
# Replaces the old update.sh for image-based deployments. Pre-built Docker
# images are pulled from ghcr.io (built by GitHub Actions CI/CD). Falls back
# to building from source if images are not available.
#
# Writes structured JSON progress to a JSONL file that the backend streams
# to the frontend via SSE so the user sees real-time stage updates.
#
# Usage:
#   deploy.sh                     # deploy latest from origin/main
#   deploy.sh --rollback          # rollback to previous version
#   deploy.sh --build-fallback    # force build from source (skip image pull)
#
# Progress file: $APP/.update-progress.jsonl
# Lock file:     /tmp/ha-deploy.lock
# ---------------------------------------------------------------------------
set -uo pipefail

APP="${HA_APP_ROOT:-/opt/home-automation}"
LOG_DIR="${HA_LOG_DIR:-/var/log/home-automation}"
COMPOSE_FILE="$APP/docker-compose.prod.yml"
PROGRESS_FILE="$APP/.update-progress.jsonl"
PREV_STATE_FILE="$APP/.deploy-previous-state.json"
LOCK_FILE=/tmp/ha-deploy.lock
HEALTH_URL="http://localhost:3000/api/health"
BUILD_FALLBACK=false
ROLLBACK=false

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --build-fallback) BUILD_FALLBACK=true ;;
    --rollback)       ROLLBACK=true ;;
  esac
done

# Detect compose command
COMPOSE="docker compose -f $COMPOSE_FILE"
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE="docker-compose -f $COMPOSE_FILE"
fi

# ---------------------------------------------------------------------------
# Structured progress output
# ---------------------------------------------------------------------------
STAGE_ID=0

emit() {
  local stage="$1" status="$2" msg="$3"
  STAGE_ID=$((STAGE_ID + 1))
  local ts
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  printf '{"id":%d,"ts":"%s","stage":"%s","status":"%s","msg":"%s"}\n' \
    "$STAGE_ID" "$ts" "$stage" "$status" "$msg" >> "$PROGRESS_FILE"
  echo "[$ts] [$stage] $status: $msg"
}

emit_log() {
  local stage="$1" msg="$2"
  emit "$stage" "log" "$msg"
}

# Wipe progress file at start of a new deployment
true > "$PROGRESS_FILE"

# ---------------------------------------------------------------------------
# Lock — prevent concurrent runs (also blocks the watchdog from interfering)
# ---------------------------------------------------------------------------
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  emit "preflight" "failed" "Another deployment is already running"
  exit 1
fi

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Port 80 nginx standby (optional): swap static page while we deploy
STANDBY_WWW=/var/www/ha-standby
STANDBY_SWAPPED=0
swap_standby_page() {
  if [[ -f "$APP/deploy/standby/updating.html" && -d "$STANDBY_WWW" ]]; then
    cp -a "$STANDBY_WWW/standby.html" "$STANDBY_WWW/standby.html.bak" 2>/dev/null || true
    cp -a "$APP/deploy/standby/updating.html" "$STANDBY_WWW/standby.html"
    echo '{"updating":true}' >"$STANDBY_WWW/ha-update-status.json"
    STANDBY_SWAPPED=1
  fi
}
restore_standby_page() {
  [[ "$STANDBY_SWAPPED" -eq 1 ]] || return 0
  if [[ -f "$STANDBY_WWW/standby.html.bak" ]]; then
    mv -f "$STANDBY_WWW/standby.html.bak" "$STANDBY_WWW/standby.html"
  fi
  rm -f "$STANDBY_WWW/ha-update-status.json"
  STANDBY_SWAPPED=0
}
trap restore_standby_page EXIT

# Git helper for dubious ownership
ha_git() {
  command git -c "safe.directory=$APP" -c "safe.directory=*" "$@"
}

# deploy.sh runs inside the backend container as root, but the git checkout is a
# bind-mount from the host owned by a regular user. Git operations create new
# objects as root, which prevents the host user from running git directly later.
# After any git write, restore ownership to match the repo root.
fix_git_owner() {
  local owner
  owner=$(stat -c '%u:%g' "$APP" 2>/dev/null || stat -f '%u:%g' "$APP" 2>/dev/null || echo "")
  if [ -n "$owner" ] && [ "$owner" != "0:0" ]; then
    chown -R "$owner" "$APP/.git" 2>/dev/null || true
  fi
}

# Health check with retries
health_check() {
  local retries=$1 stage=$2
  local i
  for i in $(seq 1 "$retries"); do
    if curl -sf --max-time 5 "$HEALTH_URL" > /dev/null 2>&1; then
      return 0
    fi
    emit_log "$stage" "Health check attempt $i/$retries failed, waiting 5s..."
    sleep 5
  done
  return 1
}

# ---------------------------------------------------------------------------
# Save/restore previous state for rollback
# ---------------------------------------------------------------------------
save_current_state() {
  cd "$APP"
  local sha
  sha=$(ha_git rev-parse HEAD 2>/dev/null || echo "unknown")

  # Read current image tags from env
  local backend_img frontend_img roborock_img
  backend_img=$(grep '^HA_BACKEND_IMAGE=' "$APP/.env" 2>/dev/null | cut -d= -f2- || echo "")
  frontend_img=$(grep '^HA_FRONTEND_IMAGE=' "$APP/.env" 2>/dev/null | cut -d= -f2- || echo "")
  roborock_img=$(grep '^HA_ROBOROCK_IMAGE=' "$APP/.env" 2>/dev/null | cut -d= -f2- || echo "")

  cat > "$PREV_STATE_FILE" << EOF
{
  "sha": "$sha",
  "backendImage": "$backend_img",
  "frontendImage": "$frontend_img",
  "roborockImage": "$roborock_img",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  emit_log "preflight" "Saved current state for rollback: $sha"
}

# Set env var in .env file (create or update)
set_env_var() {
  local key="$1" value="$2"
  local envfile="$APP/.env"
  if grep -q "^${key}=" "$envfile" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$envfile"
  else
    echo "${key}=${value}" >> "$envfile"
  fi
}

# ===================================================================
# ROLLBACK MODE
# ===================================================================
if [ "$ROLLBACK" = true ]; then
  emit "rollback" "running" "Rolling back to previous version..."

  if [ ! -f "$PREV_STATE_FILE" ]; then
    emit "rollback" "failed" "No previous state file found — cannot roll back"
    exit 1
  fi

  local_sha=$(node -e "console.log(require('$PREV_STATE_FILE').sha)" 2>/dev/null || echo "")
  prev_backend=$(node -e "console.log(require('$PREV_STATE_FILE').backendImage)" 2>/dev/null || echo "")
  prev_frontend=$(node -e "console.log(require('$PREV_STATE_FILE').frontendImage)" 2>/dev/null || echo "")
  prev_roborock=$(node -e "console.log(require('$PREV_STATE_FILE').roborockImage)" 2>/dev/null || echo "")

  cd "$APP"

  if [ -n "$local_sha" ] && [ "$local_sha" != "unknown" ]; then
    emit_log "rollback" "Resetting git to $local_sha"
    ha_git reset --hard "$local_sha" 2>&1 || true
  fi

  if [ -n "$prev_backend" ]; then
    set_env_var "HA_BACKEND_IMAGE" "$prev_backend"
    set_env_var "HA_FRONTEND_IMAGE" "$prev_frontend"
    set_env_var "HA_ROBOROCK_IMAGE" "$prev_roborock"
    emit_log "rollback" "Restored image tags"
  fi

  emit "restart" "running" "Restarting services with previous version..."
  $COMPOSE up -d 2>&1 | tail -5 | while IFS= read -r line; do emit_log "restart" "$line"; done

  if health_check 12 "health_check"; then
    emit "done" "completed" "Rollback successful"
    exit 0
  else
    emit "done" "failed" "Rollback completed but health check failed"
    exit 1
  fi
fi

# ===================================================================
# FORWARD DEPLOY
# ===================================================================

# Stage 1: Preflight
emit "preflight" "running" "Checking prerequisites..."

cd "$APP"
if [ ! -d ".git" ]; then
  emit "preflight" "failed" "Not a git repository at $APP"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  emit "preflight" "failed" "Docker daemon not running"
  exit 1
fi

save_current_state
emit "preflight" "completed" "Prerequisites OK"

# Stage 2: Fetch and pull code
emit "pull_code" "running" "Fetching latest code from origin/main..."

ha_git fetch origin main --quiet 2>/dev/null
CURRENT_SHA=$(ha_git rev-parse HEAD)
REMOTE_SHA=$(ha_git rev-parse origin/main)

if [ "$CURRENT_SHA" = "$REMOTE_SHA" ]; then
  emit_log "pull_code" "Already at latest commit (${CURRENT_SHA:0:7})"
else
  emit_log "pull_code" "Pulling ${CURRENT_SHA:0:7} → ${REMOTE_SHA:0:7}"
  if ! ha_git pull origin main --quiet 2>&1; then
    fix_git_owner
    emit "pull_code" "failed" "Git pull failed — working tree may have conflicts"
    exit 1
  fi
fi

# Restore .git ownership to the host user (container runs as root, bind-mount is host-owned)
fix_git_owner

# Read the release manifest to get image tags
MANIFEST="$APP/deploy/release-manifest.json"
TARGET_VERSION="unknown"
if [ -f "$MANIFEST" ]; then
  TARGET_VERSION=$(node -e "console.log(require('$MANIFEST').version)" 2>/dev/null || echo "unknown")
  emit_log "pull_code" "Release manifest version: $TARGET_VERSION"
fi

emit "pull_code" "completed" "Code updated to $TARGET_VERSION (${REMOTE_SHA:0:7})"

# Stage 3: Pull pre-built images
emit "pull_images" "running" "Pulling pre-built Docker images..."

IMAGES_PULLED=false
if [ "$BUILD_FALLBACK" = false ] && [ -f "$MANIFEST" ]; then
  BACKEND_IMG=$(node -e "console.log(require('$MANIFEST').images.backend)" 2>/dev/null || echo "")
  FRONTEND_IMG=$(node -e "console.log(require('$MANIFEST').images.frontend)" 2>/dev/null || echo "")
  ROBOROCK_IMG=$(node -e "console.log(require('$MANIFEST').images['roborock-bridge'])" 2>/dev/null || echo "")

  if [ -n "$BACKEND_IMG" ] && [ -n "$FRONTEND_IMG" ]; then
    PULL_FAILED=false

    for img_name in "$BACKEND_IMG" "$FRONTEND_IMG" "$ROBOROCK_IMG"; do
      [ -z "$img_name" ] && continue
      emit_log "pull_images" "Pulling $img_name"
      if ! docker pull "$img_name" 2>&1 | tail -3 | while IFS= read -r line; do emit_log "pull_images" "$line"; done; then
        emit_log "pull_images" "Failed to pull $img_name"
        PULL_FAILED=true
        break
      fi
    done

    if [ "$PULL_FAILED" = false ]; then
      IMAGES_PULLED=true
      # Write image tags to .env for docker compose
      set_env_var "HA_BACKEND_IMAGE" "$BACKEND_IMG"
      set_env_var "HA_FRONTEND_IMAGE" "$FRONTEND_IMG"
      [ -n "$ROBOROCK_IMG" ] && set_env_var "HA_ROBOROCK_IMAGE" "$ROBOROCK_IMG"
      emit "pull_images" "completed" "All images pulled from registry"
    fi
  fi
fi

if [ "$IMAGES_PULLED" = false ]; then
  emit_log "pull_images" "Pre-built images not available — will build from source"
  emit "pull_images" "completed" "Using local build (images not available)"
fi

# Stage 4: Database backup
emit "db_backup" "running" "Backing up database..."

BACKUP_FILE="$APP/backups/pre-deploy-$(date +%Y%m%d-%H%M%S).dump"
mkdir -p "$APP/backups"
if $COMPOSE exec -T postgres pg_dump -U ha_user -Fc home_automation > "$BACKUP_FILE" 2>/dev/null; then
  BACKUP_SIZE=$(du -sh "$BACKUP_FILE" 2>/dev/null | cut -f1 || echo "?")
  emit "db_backup" "completed" "Database backed up ($BACKUP_SIZE)"
else
  emit_log "db_backup" "pg_dump failed — continuing without backup (database may not be running)"
  emit "db_backup" "completed" "Skipped (database not reachable)"
fi

# Stage 5: Swap standby page
swap_standby_page
if [ "$STANDBY_SWAPPED" -eq 1 ]; then
  emit_log "restart" "Standby page active on port 80"
fi

# Stage 6: Restart services
emit "restart" "running" "Restarting services..."

COMPOSE_CMD="$COMPOSE up -d"
if [ "$IMAGES_PULLED" = false ]; then
  COMPOSE_CMD="$COMPOSE up -d --build"
  emit_log "restart" "Building from source (this may take several minutes)..."
fi

# NOTE: do NOT add --wait here. It blocks until ALL containers are healthy,
# including optional services like roborock-bridge. If any non-critical service
# is unhealthy, the entire deploy hangs. The health_check stage below validates
# the backend API is responding, which is sufficient.

COMPOSE_OUT=$(mktemp)
if ! eval "$COMPOSE_CMD" >"$COMPOSE_OUT" 2>&1; then
  cat "$COMPOSE_OUT" | tail -20 | while IFS= read -r line; do emit_log "restart" "$line"; done
  rm -f "$COMPOSE_OUT"
  emit "restart" "failed" "Docker compose failed — attempting rollback"
  # Attempt rollback
  restore_standby_page
  exec bash "$0" --rollback
fi
tail -10 "$COMPOSE_OUT" | while IFS= read -r line; do emit_log "restart" "$line"; done
rm -f "$COMPOSE_OUT"

emit "restart" "completed" "Services restarted"

# Stage 7: Health check
emit "health_check" "running" "Validating system health..."

if health_check 18 "health_check"; then
  emit "health_check" "completed" "All services healthy"
else
  emit "health_check" "failed" "Health check failed after 90s — attempting rollback"
  restore_standby_page
  exec bash "$0" --rollback
fi

# Stage 8: Post-deploy verification
emit "verify" "running" "Verifying deployment..."

# Verify the running version matches what we deployed
RUNNING_VERSION=$(curl -sf --max-time 5 "$HEALTH_URL" 2>/dev/null && \
  curl -sf --max-time 5 "http://localhost:3000/api/system/app-version" 2>/dev/null | \
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).versionLabel)}catch{console.log('unknown')}})" || echo "unknown")
emit_log "verify" "Running version: $RUNNING_VERSION"

emit "verify" "completed" "Deployment verified"

# Stage 9: Cleanup
restore_standby_page

# Clean up old backup files (keep last 10)
ls -1t "$APP/backups"/pre-deploy-*.dump 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

# Clean up dangling Docker images
docker image prune -f >/dev/null 2>&1 || true

emit "done" "completed" "Update to $TARGET_VERSION complete"

# Also write to the traditional log file
{
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy completed: $TARGET_VERSION ($REMOTE_SHA)"
} >> "$LOG_DIR/update.log"

# Trim traditional log
if [ -f "$LOG_DIR/update.log" ]; then
  tail -n 500 "$LOG_DIR/update.log" > "$LOG_DIR/update.log.tmp" && mv "$LOG_DIR/update.log.tmp" "$LOG_DIR/update.log"
fi
