#!/usr/bin/env bash
# Install systemd unit so the stack starts after reboot and Docker is up.
# Run on the production server:
#   cd /opt/home-automation && git pull && sudo ./scripts/install-systemd.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_SRC="$ROOT/deploy/systemd/home-automation.service"
UNIT_DST=/etc/systemd/system/home-automation.service

if [[ ! -f "$UNIT_SRC" ]]; then
  echo "Missing $UNIT_SRC"
  exit 1
fi

if [[ $(id -u) -ne 0 ]]; then
  echo "Run with sudo: sudo $0"
  exit 1
fi

cp -a "$UNIT_SRC" "$UNIT_DST"
systemctl daemon-reload
systemctl enable home-automation.service
systemctl start home-automation.service
echo "Installed $UNIT_DST"
systemctl status home-automation.service --no-pager || true
