#!/bin/bash
# Developed by Mohammad Rameez Imdad (Rameez Scripts)
# WhatsApp: https://wa.me/923435347417 (For Custom Projects)
# YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
#
# One-command updater — refreshes code only. KEEPS .env (same API keys),
# data/ (same WhatsApp session, no QR re-scan) and logs/. No git needed.
# usage: bash vps-update.sh [github-token-if-repo-private]
set -euo pipefail

REPO="rameezimdad/baileys-api"
APP_DIR=/opt/baileys-api
TOKEN="${1:-}"

[ -d "$APP_DIR" ] || { echo "ERROR: $APP_DIR not found — run the installer first."; exit 1; }
cd "$APP_DIR"

echo ">>> [1/4] downloading latest code"
AUTH=()
[ -n "$TOKEN" ] && AUTH=(-H "Authorization: Bearer $TOKEN")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "${AUTH[@]}" "https://codeload.github.com/$REPO/tar.gz/refs/heads/master" \
  | tar xz --strip-components=1 -C "$TMP"

echo ">>> [2/4] applying update (keeping .env, data, logs)"
rm -rf "$TMP/data" "$TMP/logs"
rm -f "$TMP/.env"
cp -rf "$TMP"/. "$APP_DIR"/

echo ">>> [3/4] dependencies"
npm ci --omit=dev --no-audit --no-fund

echo ">>> [4/4] restart"
cp nginx/baileys-api.conf /etc/nginx/sites-available/baileys-api 2>/dev/null && nginx -t -q && systemctl reload nginx || true
pm2 restart baileys-api --update-env

sleep 2
echo
echo "=================================================================="
echo -n "  Health: "; curl -s --max-time 5 http://127.0.0.1:3000/healthz || echo "not responding — check: pm2 logs baileys-api"
echo
echo "  UPDATED — same API keys, same WhatsApp session, latest code."
echo "=================================================================="
