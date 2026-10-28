#!/bin/bash
# Developed by Mohammad Rameez Imdad (Rameez Scripts)
# WhatsApp: https://wa.me/923435347417 (For Custom Projects)
# YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
#
# One-shot Baileys API installer for a fresh Ubuntu 22.04/24.04 VPS (run as root)
# usage: bash vps-install.sh [--fresh] [github-token-if-repo-private]
#   --fresh = wipe any old install first (new admin key, new WhatsApp session)
set -euo pipefail

REPO="rameezimdad/baileys-api"
APP_DIR=/opt/baileys-api
FRESH=0
TOKEN=""
for arg in "$@"; do
  if [ "$arg" = "--fresh" ]; then FRESH=1; else TOKEN="$arg"; fi
done

if [ "$FRESH" = 1 ]; then
  echo ">>> [0/7] removing old install (--fresh)"
  command -v pm2 >/dev/null 2>&1 && pm2 delete baileys-api >/dev/null 2>&1 || true
  rm -rf "$APP_DIR" "$HOME/baileys-api"
  rm -f /etc/nginx/sites-enabled/baileys-api /etc/nginx/sites-available/baileys-api
fi

echo ">>> [1/7] system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -q
apt-get install -y -q build-essential python3 nginx curl ca-certificates

echo ">>> [2/7] node.js 22 + pm2"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//;s/\..*//')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
npm install -g pm2 >/dev/null

echo ">>> [3/7] download app"
mkdir -p "$APP_DIR"
AUTH=()
[ -n "$TOKEN" ] && AUTH=(-H "Authorization: Bearer $TOKEN")
curl -fsSL "${AUTH[@]}" "https://codeload.github.com/$REPO/tar.gz/refs/heads/master" \
  | tar xz --strip-components=1 -C "$APP_DIR"
cd "$APP_DIR"

echo ">>> [4/7] npm dependencies (takes a minute)"
npm ci --omit=dev --no-audit --no-fund

echo ">>> [5/7] configuration"
PUB_IP=$(curl -fsSL --max-time 8 https://api.ipify.org || hostname -I | awk '{print $1}')
if [ ! -f .env ]; then
  ADMIN_KEY=$(openssl rand -base64 48 | tr -d '\n')
  PEPPER=$(openssl rand -base64 48 | tr -d '\n')
  cp .env.example .env
  sed -i "s|^ADMIN_API_KEY=.*|ADMIN_API_KEY=$ADMIN_KEY|" .env
  sed -i "s|^API_KEY_PEPPER=.*|API_KEY_PEPPER=$PEPPER|" .env
  sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=*|" .env
  sed -i "s|^PUBLIC_IP=.*|PUBLIC_IP=$PUB_IP|" .env
else
  ADMIN_KEY="(unchanged — using your existing .env)"
fi
mkdir -p data logs
chmod 700 data logs
chmod 600 .env

echo ">>> [6/7] nginx + pm2"
cp nginx/baileys-api.conf /etc/nginx/sites-available/baileys-api
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/baileys-api /etc/nginx/sites-enabled/baileys-api
nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl reload nginx
cp deploy/logrotate-baileys-api /etc/logrotate.d/baileys-api 2>/dev/null || true
pm2 delete baileys-api >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
pm2 save >/dev/null

echo ">>> [7/7] firewall"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
fi

sleep 2
HEALTH=$(curl -s --max-time 5 http://127.0.0.1:3000/healthz || echo '{"status":"not responding yet — check: pm2 logs baileys-api"}')
echo
echo "=================================================================="
echo "  DONE — Baileys API is live!"
echo "  Health: $HEALTH"
echo
echo "  Dashboard:  http://$PUB_IP/"
echo
echo "  ADMIN API KEY (copy and save it NOW — shown only once):"
echo "  $ADMIN_KEY"
echo
echo "  Open the dashboard, paste the key, scan the WhatsApp QR."
echo "=================================================================="
