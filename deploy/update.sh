#!/bin/bash
# Developed by Mohammad Rameez Imdad (Rameez Scripts)
# WhatsApp: https://wa.me/923435347417 (For Custom Projects)
# YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
#
# Pull the latest code and restart. Needs `enable-updates.sh` to have run once.
# Tip: the `wa-update` alias does the same thing — just type: wa-update
set -euo pipefail

APP=/opt/baileys-api
cd "$APP"
echo ">>> pulling latest code"
git fetch origin master -q
git reset --hard origin/master          # .env, data/, logs/, node_modules/ stay (gitignored)
echo ">>> installing dependencies"
npm ci --omit=dev --no-audit --no-fund
echo ">>> restarting app"
pm2 restart baileys-api --update-env
sleep 2
echo -n ">>> health: "; curl -s http://127.0.0.1:3000/healthz; echo
echo ">>> updated."
