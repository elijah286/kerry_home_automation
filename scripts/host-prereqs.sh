#!/usr/bin/env bash
# Idempotent host-level provisioning.
#
# Runs as root (via the home-automation.service systemd unit's
# ExecStartPre=+ directive, or manually with sudo). Ensures the host has
# everything the Docker stack needs before bringing containers up:
#
#   1. Intel media drivers installed (intel-media-va-driver-non-free), so
#      /dev/dri/renderD128 shows up and VAAPI works.
#   2. RENDER_GID / VIDEO_GID written to .env, matching whatever the host
#      system actually uses (Ubuntu 24.04 "noble" uses render=993; earlier
#      releases used 109; the wrong GID means the go2rtc container can't
#      open the iGPU and all camera transcoding falls back to software).
#   3. Sanity check: /dev/dri/renderD128 is present. If it isn't, we
#      print a loud warning about BIOS config — nothing in software can
#      fix an iGPU disabled at the firmware level.
#
# Safe to run repeatedly. Exits 0 even if some checks warn — we never want
# to block the stack from starting because of a prereq hiccup, just make
# the problem visible in the systemd journal.

set -u
# Do NOT set -e: a failing apt-get on a metered connection shouldn't
# prevent the stack from starting. Individual steps check their own exit
# codes and print loud warnings.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

log()  { printf '[host-prereqs] %s\n' "$*"; }
warn() { printf '[host-prereqs] WARNING: %s\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# 1. Intel media drivers
# ---------------------------------------------------------------------------

ensure_intel_drivers() {
  if ! command -v apt-get >/dev/null 2>&1; then
    warn "apt-get not found — skipping driver install (non-Debian host?). Ensure intel-media-va-driver-non-free is installed another way."
    return
  fi

  local needed=()
  for pkg in intel-media-va-driver-non-free intel-gpu-tools vainfo; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
      needed+=("$pkg")
    fi
  done

  if [[ ${#needed[@]} -eq 0 ]]; then
    log "Intel media drivers already installed."
    return
  fi

  if [[ $(id -u) -ne 0 ]]; then
    warn "Need root to install packages: ${needed[*]}. Re-run with sudo."
    return
  fi

  log "Installing: ${needed[*]}"
  DEBIAN_FRONTEND=noninteractive apt-get update -qq || warn "apt-get update failed"
  if DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${needed[@]}"; then
    log "Installed Intel media drivers."
    # i915 may already be loaded, but re-trigger so the render node gets created
    # when the driver was added to a running system for the first time.
    modprobe -r i915 2>/dev/null
    modprobe i915 2>/dev/null || true
  else
    warn "apt-get install failed — continuing without HW accel. Check apt logs."
  fi
}

# ---------------------------------------------------------------------------
# 2. Populate .env with RENDER_GID / VIDEO_GID
# ---------------------------------------------------------------------------

set_env_var() {
  local key="$1" value="$2"
  if [[ ! -f "$ENV_FILE" ]]; then
    log ".env does not exist — creating."
    touch "$ENV_FILE"
    chmod 600 "$ENV_FILE"
  fi

  if grep -q "^${key}=" "$ENV_FILE"; then
    # Already set. Update in place only if different.
    local current
    current="$(grep "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
    if [[ "$current" != "$value" ]]; then
      log "Updating ${key} in .env: ${current} → ${value}"
      # sed -i with a pipe delimiter so a digit-only value can't clash
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    fi
  else
    log "Adding ${key}=${value} to .env"
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

detect_gid() {
  local group="$1"
  getent group "$group" 2>/dev/null | cut -d: -f3
}

sync_gids() {
  local render_gid video_gid
  render_gid="$(detect_gid render)"
  video_gid="$(detect_gid video)"

  if [[ -z "$render_gid" ]]; then
    warn "No 'render' group on this host — leaving RENDER_GID unset. The go2rtc container will use its compose default."
  else
    set_env_var "RENDER_GID" "$render_gid"
  fi

  if [[ -z "$video_gid" ]]; then
    warn "No 'video' group on this host."
  else
    set_env_var "VIDEO_GID" "$video_gid"
  fi
}

# ---------------------------------------------------------------------------
# 3. /dev/dri sanity check
# ---------------------------------------------------------------------------

check_igpu() {
  if [[ -c /dev/dri/renderD128 ]]; then
    log "/dev/dri/renderD128 present — iGPU ready for hardware-accelerated transcoding."
  elif [[ -c /dev/dri/card0 ]]; then
    warn "/dev/dri/card0 present but /dev/dri/renderD128 missing. Intel media drivers may not be fully loaded. Try: sudo modprobe -r i915 && sudo modprobe i915"
  else
    warn "/dev/dri does not exist. The iGPU is either disabled in BIOS or the i915 driver is not loaded."
    warn "Check BIOS: Chipset > System Agent > Graphics Configuration > Internal Graphics = Enabled."
    warn "Then: lsmod | grep i915 — should show the module. If missing, reboot after installing drivers."
  fi
}

# ---------------------------------------------------------------------------

log "Starting host prereqs check."
ensure_intel_drivers
sync_gids
check_igpu
log "Host prereqs complete."

exit 0
