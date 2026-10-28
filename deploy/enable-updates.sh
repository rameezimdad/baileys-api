#!/bin/bash
# Developed by Mohammad Rameez Imdad (Rameez Scripts)
# WhatsApp: https://wa.me/923435347417 (For Custom Projects)
# YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
#
# One-time setup so the VPS can pull the private repo with one command (wa-update).
# Uses a read-only GitHub deploy key — no token stored in chat or config.
# Run it, send the printed key to your developer, then run it again to finish.
set -euo pipefail

REPO_SSH="git@github.com:rameezimdad/baileys-api.git"
APP=/opt/baileys-api
KEY="$HOME/.ssh/id_github"

mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"
[ -f "$KEY" ] || ssh-keygen -t ed25519 -f "$KEY" -N "" -q -C "baileys-vps-deploy"
grep -q "Host github.com" "$HOME/.ssh/config" 2>/dev/null || \
  printf 'Host github.com\n  IdentityFile %s\n  IdentitiesOnly yes\n' "$KEY" >> "$HOME/.ssh/config"
ssh-keyscan -t ed25519,rsa github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null || true

# can we reach the repo over SSH yet?
if ! ssh -o StrictHostKeyChecking=no -T git@github.com 2>&1 | grep -qi "authenticat"; then
  echo
  echo "=================================================================="
  echo "  STEP 1/2 — copy the line below and send it to your developer:"
  echo "=================================================================="
  cat "$KEY.pub"
  echo "=================================================================="
  echo "  After they confirm, run this script again to finish:"
  echo "      bash /tmp/eu.sh"
  echo "=================================================================="
  exit 0
fi

echo ">>> GitHub access OK — wiring $APP to git"
cd "$APP"
[ -d .git ] || git init -q
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_SSH"
git fetch origin master -q
git reset --hard origin/master          # .env, data/, logs/, node_modules/ are gitignored — preserved
git branch -M master 2>/dev/null || true
git branch --set-upstream-to=origin/master master 2>/dev/null || true

echo ">>> deps + restart"
npm ci --omit=dev --no-audit --no-fund
pm2 restart baileys-api --update-env

grep -q "alias wa-update" "$HOME/.bashrc" 2>/dev/null || \
  echo "alias wa-update='cd /opt/baileys-api && git fetch origin master -q && git reset --hard origin/master && npm ci --omit=dev --no-audit --no-fund && pm2 restart baileys-api --update-env && echo && curl -s http://127.0.0.1:3000/healthz && echo'" >> "$HOME/.bashrc"

sleep 2
echo -n ">>> health: "; curl -s http://127.0.0.1:3000/healthz; echo
echo
echo "=================================================================="
echo "  DONE — auto-update is enabled."
echo "  To update the server anytime, just run:   wa-update"
echo "  (open a fresh terminal first, or run: source ~/.bashrc)"
echo "=================================================================="
