#!/usr/bin/env bash
# =============================================================
#  Lord's Great Academy — one-shot VPS setup (Ubuntu/Debian)
#
#  1. Copy the whole project folder to the VPS, e.g.:
#       scp -r lga-fees user@your-server:/tmp/lga-fees
#  2. On the VPS run:
#       sudo bash /tmp/lga-fees/deploy/setup-vps.sh
#
#  The script installs Node 20 if needed, installs dependencies,
#  creates a 'fees' service user, and starts the app under
#  systemd so it auto-starts on boot and survives reboots.
# =============================================================
set -euo pipefail

APP_DIR="/opt/lga-fees"
APP_USER="fees"
PORT="${PORT:-3000}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo:  sudo bash deploy/setup-vps.sh"
  exit 1
fi

SRC="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -f "$SRC/server/index.js" ]; then
  echo "ERROR: run this script from inside the project folder."
  exit 1
fi

echo "==> Installing Node.js 20 (if missing or too old)…"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  MAJOR="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
  [ "$MAJOR" -ge 20 ] && NEED_NODE=0
fi
if [ "$NEED_NODE" -eq 1 ]; then
  apt-get update
  apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v && npm -v

echo "==> Placing app in $APP_DIR …"
mkdir -p "$APP_DIR"
cp -r "$SRC/server" "$SRC/public" "$SRC/package.json" "$SRC/package-lock.json" "$APP_DIR/" 2>/dev/null || true
cp -r "$SRC/deploy" "$APP_DIR/" 2>/dev/null || true
# keep any existing database
mkdir -p "$APP_DIR/data"

echo "==> Creating service user '$APP_USER' …"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Installing dependencies …"
su -s /bin/bash "$APP_USER" -c "cd $APP_DIR && npm ci --omit=dev --no-audit --no-fund"

echo "==> Installing systemd service …"
sed "s|{{PORT}}|$PORT|g" "$APP_DIR/deploy/lga-fees.service" > /etc/systemd/system/lga-fees.service
systemctl daemon-reload
systemctl enable --now lga-fees
sleep 2
systemctl status lga-fees --no-pager | head -5

echo
echo "============================================================"
echo " ✅ Done — the app is running on port $PORT."
echo "    Open:  http://<your-server-ip>:$PORT"
echo
echo " Recommended next step: put it behind Caddy/Nginx with a"
echo " domain + free HTTPS (Caddy does it automatically), e.g.:"
echo
echo "   # /etc/caddy/Caddyfile"
echo "   fees.yourschool.org {"
echo "       reverse_proxy 127.0.0.1:$PORT"
echo "   }"
echo
echo " Backups: Admin dashboard → Export → 'Download Database Backup',"
echo " or on the server:  sudo -u fees sqlite3 $APP_DIR/data/fees.db '.backup /backup/fees-$(date +%F).db'"
echo "============================================================"
