#!/usr/bin/env bash
# Install systemd units so the stack starts after reboot and self-heals when the API is down.
# Run on the production server:
#   cd /opt/home-automation && git pull && sudo ./scripts/install-systemd.sh
#
# Installs:
#   - home-automation.service  — compose up on boot
#   - home-automation-watchdog.timer — runs scripts/watchdog-stack.sh every 2 minutes + shortly after boot
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_MAIN_SRC="$ROOT/deploy/systemd/home-automation.service"
UNIT_MAIN_DST=/etc/systemd/system/home-automation.service
UNIT_WD_SRC="$ROOT/deploy/systemd/home-automation-watchdog.service"
UNIT_WD_DST=/etc/systemd/system/home-automation-watchdog.service
TIMER_SRC="$ROOT/deploy/systemd/home-automation-watchdog.timer"
TIMER_DST=/etc/systemd/system/home-automation-watchdog.timer
WATCHDOG_SCRIPT="$ROOT/scripts/watchdog-stack.sh"

if [[ ! -f "$UNIT_MAIN_SRC" ]]; then
  echo "Missing $UNIT_MAIN_SRC"
  exit 1
fi

if [[ $(id -u) -ne 0 ]]; then
  echo "Run with sudo: sudo $0"
  exit 1
fi

DEPLOY_USER="${SUDO_USER:-elijah286}"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "User $DEPLOY_USER does not exist"
  exit 1
fi
DEPLOY_GROUP="$(id -gn "$DEPLOY_USER")"
DEPLOY_HOME="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
if [[ -z "$DEPLOY_HOME" ]]; then
  DEPLOY_HOME="/home/$DEPLOY_USER"
fi

apply_user_to_unit() {
  local src="$1" dst="$2"
  sed \
    -e "s/^User=.*/User=$DEPLOY_USER/" \
    -e "s/^Group=.*/Group=$DEPLOY_GROUP/" \
    -e "s|^Environment=HOME=.*|Environment=HOME=$DEPLOY_HOME|" \
    "$src" >"$dst"
}

apply_user_to_unit "$UNIT_MAIN_SRC" "$UNIT_MAIN_DST"
apply_user_to_unit "$UNIT_WD_SRC" "$UNIT_WD_DST"

cp -a "$TIMER_SRC" "$TIMER_DST"

chmod +x "$WATCHDOG_SCRIPT"

systemctl daemon-reload

systemctl enable home-automation.service
systemctl start home-automation.service

systemctl enable home-automation-watchdog.timer
systemctl start home-automation-watchdog.timer

echo "Installed:"
echo "  $UNIT_MAIN_DST"
echo "  $UNIT_WD_DST"
echo "  $TIMER_DST"
echo ""
systemctl status home-automation.service --no-pager || true
echo ""
systemctl status home-automation-watchdog.timer --no-pager || true
