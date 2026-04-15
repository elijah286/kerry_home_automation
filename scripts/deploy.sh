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
SIDECAR_LAUNCHED=0
trap '[ "$SIDECAR_LAUNCHED" -eq 0 ] && restore_standby_page' EXIT

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
  # Parse image names from manifest using grep — more reliable than node -e
  # which can fail silently inside containers due to module resolution issues.
  BACKEND_IMG=$(grep -o '"backend"[[:space:]]*:[[:space:]]*"[^"]*"' "$MANIFEST" | head -1 | grep -o '"[^"]*"$' | tr -d '"')
  FRONTEND_IMG=$(grep -o '"frontend"[[:space:]]*:[[:space:]]*"[^"]*"' "$MANIFEST" | head -1 | grep -o '"[^"]*"$' | tr -d '"')
  ROBOROCK_IMG=$(grep -o '"roborock-bridge"[[:space:]]*:[[:space:]]*"[^"]*"' "$MANIFEST" | head -1 | grep -o '"[^"]*"$' | tr -d '"')

  emit_log "pull_images" "Manifest images: backend=$BACKEND_IMG frontend=$FRONTEND_IMG roborock=$ROBOROCK_IMG"

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

# Pull the sidecar image used by the deploy agent for safe restarts
emit_log "pull_images" "Pulling docker:cli (deploy agent sidecar)"
docker pull docker:cli 2>&1 | tail -2 | while IFS= read -r line; do emit_log "pull_images" "$line"; done || true

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

# Resolve the host-side Docker config path from the current backend container's
# mount. The compose file uses ${DOCKER_CONFIG:-${HOME}/.docker} which differs
# between the host shell and the deploy-agent sidecar. Persist it to .env so
# compose always resolves the correct host path regardless of which process runs it.
_host_docker_cfg=$(
  docker inspect --format '{{range .Mounts}}{{if eq .Destination "/root/.docker"}}{{.Source}}{{end}}{{end}}' \
    "$(cat /proc/self/cgroup 2>/dev/null | grep -oP '[a-f0-9]{64}' | head -1 || hostname)" 2>/dev/null || echo ""
)
if [ -n "$_host_docker_cfg" ] && [ "$_host_docker_cfg" != "/root/.docker" ]; then
  set_env_var "DOCKER_CONFIG" "$_host_docker_cfg"
  emit_log "db_backup" "Persisted DOCKER_CONFIG=$_host_docker_cfg to .env"
fi

# Stage 5: Swap standby page
swap_standby_page
if [ "$STANDBY_SWAPPED" -eq 1 ]; then
  emit_log "restart" "Standby page active on port 80"
fi

# ===================================================================
# STAGE 6+: Launch deploy-agent sidecar for safe restart
# ===================================================================
# deploy.sh runs inside the backend container. `docker compose up -d`
# recreates this container, killing this script mid-operation. Instead
# we write a restart script and hand it to a short-lived "deploy agent"
# sidecar container (docker:cli) that is NOT managed by compose — it
# survives the restart and writes real health_check / done events.

SIDECAR_NAME="ha-deploy-agent"
SIDECAR_SCRIPT="$APP/.deploy-agent.sh"

# Build vs pull decision
SIDECAR_UP_ARGS="up -d"
if [ "$IMAGES_PULLED" = false ]; then
  SIDECAR_UP_ARGS="up -d --build"
fi

emit "restart" "running" "Launching deploy agent for safe restart..."

# --- Write the sidecar restart script ---
# docker:cli is Alpine-based: /bin/sh (BusyBox), wget, docker, docker compose.
# NO bash, curl, or node.
cat > "$SIDECAR_SCRIPT" << 'SIDECAR_SCRIPT_EOF'
#!/bin/sh
set -u

PROGRESS="/app/.update-progress.jsonl"
COMPOSE_FILE="/app/docker-compose.prod.yml"
COMPOSE_CMD="docker compose -f $COMPOSE_FILE"
HEALTH_URL="http://localhost:3000/api/health"
SID=${DEPLOY_AGENT_STAGE_ID:-50}

emit() {
  SID=$((SID + 1))
  _ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  printf '{"id":%d,"ts":"%s","stage":"%s","status":"%s","msg":"%s"}\n' \
    "$SID" "$_ts" "$1" "$2" "$3" >> "$PROGRESS"
}

# Give the calling container a moment to write its last progress
sleep 3

# --- Restart all services ---
# Compose up may partially succeed (some containers start, others fail).
# Capture output but do NOT abort — let healthy services keep running.
COUT=$(mktemp)
$COMPOSE_CMD DEPLOY_UP_ARGS >"$COUT" 2>&1
COMPOSE_EXIT=$?
if [ "$COMPOSE_EXIT" -ne 0 ]; then
  _err=$(tail -10 "$COUT" | tr '\n' ' ')
  emit "restart" "log" "compose warning (exit $COMPOSE_EXIT): $_err"
  emit "restart" "log" "Continuing — healthy services should still be running"
fi
rm -f "$COUT"

# Report per-container status so the user can see exactly what's running
emit "restart" "log" "Container status after restart:"
for svc in postgres redis go2rtc roborock-bridge backend frontend; do
  _state=$(docker ps -a --filter "label=com.docker.compose.service=$svc" --format "{{.Status}}" 2>/dev/null | head -1)
  [ -z "$_state" ] && _state="not found"
  emit "restart" "log" "  $svc: $_state"
done

emit "restart" "completed" "Services restarted"

# --- Health check (24 attempts x 5s = 120s) ---
emit "health_check" "running" "Validating system health..."
HEALTHY=0
i=1
while [ "$i" -le 24 ]; do
  if wget -q -O /dev/null --timeout=5 "$HEALTH_URL" 2>/dev/null; then
    HEALTHY=1
    break
  fi
  emit "health_check" "log" "Health check attempt $i/24 — waiting 5s"
  sleep 5
  i=$((i + 1))
done

if [ "$HEALTHY" -eq 1 ]; then
  emit "health_check" "completed" "All services healthy"
else
  emit "health_check" "failed" "Health check failed after 120s"
  # Surface logs from unhealthy containers for debugging
  for svc in backend postgres redis; do
    _cid=$(docker ps -a --filter "label=com.docker.compose.service=$svc" --format "{{.ID}}" 2>/dev/null | head -1)
    [ -z "$_cid" ] && continue
    emit "health_check" "log" "--- $svc logs (last 15 lines) ---"
    docker logs "$_cid" 2>&1 | tail -15 | while IFS= read -r line; do emit "health_check" "log" "$line"; done
  done
  emit "done" "failed" "Deploy failed — backend did not become healthy"
  exit 1
fi

# --- Post-deploy verification ---
emit "verify" "running" "Verifying deployment..."
emit "verify" "completed" "Deployment verified"

# --- Restore standby page (if mounted and backup exists) ---
if [ -f "/standby/standby.html.bak" ]; then
  mv -f "/standby/standby.html.bak" "/standby/standby.html" 2>/dev/null || true
  rm -f "/standby/ha-update-status.json" 2>/dev/null || true
fi

# --- Cleanup ---
docker image prune -f >/dev/null 2>&1 || true
ls -1t /app/backups/pre-deploy-*.dump 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

# --- Done ---
emit "done" "completed" "DEPLOY_DONE_MSG_PLACEHOLDER"
SIDECAR_SCRIPT_EOF

# Patch placeholders with actual runtime values
sed -i "s|DEPLOY_UP_ARGS|$SIDECAR_UP_ARGS|g" "$SIDECAR_SCRIPT"
sed -i "s|DEPLOY_DONE_MSG_PLACEHOLDER|Update to $TARGET_VERSION complete|g" "$SIDECAR_SCRIPT"
chmod +x "$SIDECAR_SCRIPT"

# --- Remove any leftover sidecar from a previous run ---
docker rm -f "$SIDECAR_NAME" >/dev/null 2>&1 || true

# --- Launch the sidecar ---
# Mounts: Docker socket, app dir (compose file + progress file), Docker config, standby page
DOCKER_CFG_HOST="${_host_docker_cfg:-${DOCKER_CONFIG:-/root/.docker}}"
STANDBY_MOUNTS=""
if [ -d "$STANDBY_WWW" ]; then
  STANDBY_MOUNTS="-v $STANDBY_WWW:/standby"
fi

if docker run -d \
  --name "$SIDECAR_NAME" \
  --network host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$APP:/app" \
  -v "$DOCKER_CFG_HOST:/root/.docker" \
  $STANDBY_MOUNTS \
  -e "DEPLOY_AGENT_STAGE_ID=$STAGE_ID" \
  --restart no \
  docker:cli \
  sh /app/.deploy-agent.sh; then
  SIDECAR_LAUNCHED=1
  emit_log "restart" "Deploy agent sidecar launched — backend will restart momentarily"
else
  emit "restart" "failed" "Could not start deploy agent sidecar"
  # Last resort: try the old direct restart (will likely kill us, but sometimes works)
  emit_log "restart" "Falling back to direct restart..."
  $COMPOSE up -d 2>&1 | tail -5 | while IFS= read -r line; do emit_log "restart" "$line"; done
fi

# Write to the traditional log before this container is recycled
{
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy agent launched for: $TARGET_VERSION ($REMOTE_SHA)"
} >> "$LOG_DIR/update.log" 2>/dev/null || true

exit 0
