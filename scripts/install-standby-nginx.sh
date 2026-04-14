#!/usr/bin/env bash
# Install nginx on the host to:
#   - Listen on port 80 (http://<server-ip>/)
#   - Proxy to HomeOS frontend on 127.0.0.1:3001 when it is up
#   - Show deploy/standby/standby.html when the frontend returns 502/503/504
#
# Does NOT help while the machine is fully powered off (nothing to answer HTTP).
#
# Usage on lcars:
#   cd /opt/home-automation && git pull && sudo ./scripts/install-standby-nginx.sh
set -euo pipefail

if [[ $(id -u) -ne 0 ]]; then
  echo "Run with sudo"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STANDBY_SRC="$ROOT/deploy/standby/standby.html"
NGINX_SITE_SRC="$ROOT/deploy/standby/nginx-ha.conf"
WWW=/var/www/ha-standby
SITE=/etc/nginx/sites-available/home-automation.conf

if ! command -v nginx >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
fi

mkdir -p "$WWW"
cp -a "$STANDBY_SRC" "$WWW/standby.html"
cp -a "$NGINX_SITE_SRC" "$SITE"

if [[ -f /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi
ln -sf "$SITE" /etc/nginx/sites-enabled/home-automation.conf

nginx -t
systemctl enable nginx
systemctl reload nginx

echo "Done. Open http://$(hostname -I | awk '{print $1}')/ (port 80) — standby page until :3001 is healthy."
echo "Direct http://...:3001/ still works; only :80 uses the friendly fallback."
