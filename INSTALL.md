# VPS Install Guide — Step by Step

Developed by Mohammad Rameez Imdad (Rameez Scripts)
WhatsApp: https://wa.me/923435347417 (For Custom Projects)
YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)

Complete guide to install this Baileys WhatsApp API on a fresh VPS.
Every step is one small command. Run them one by one, in order.

---

## 1. Buy the VPS

- Any provider (Hostinger, DigitalOcean, Contabo, etc.)
- OS: **Ubuntu 24.04 LTS** (22.04 LTS also works)
- 1 GB RAM is enough

---

## 2. Open the server terminal

Easiest: Hostinger hPanel → your VPS → **Browser terminal** (login as `root`).

Or from your PC:

```bash
ssh root@YOUR_VPS_IP
```

> Browser terminal paste tip: long commands break into two lines and fail.
> Paste SHORT commands one at a time (that is why this guide uses small commands).

---

## 3. Get the code onto the VPS

Install git:

```bash
apt install -y git
```

This repo is **private**, so cloning needs a GitHub token. Two options:

**Option A — temporary public (easiest):**
On github.com → this repo → Settings → scroll down → "Change visibility" → make **Public**. Then on the VPS:

```bash
git clone https://github.com/rameezimdad/baileys-api.git
```

After install finishes, set the repo back to **Private** the same way.

**Option B — keep private, use a token:**
github.com → your avatar → Settings → Developer settings → Personal access tokens → Generate new token (classic, `repo` scope). Then:

```bash
git clone https://YOUR_TOKEN@github.com/rameezimdad/baileys-api.git
```

---

## 4. Automatic install (one command)

```bash
bash baileys-api/deploy/vps-install.sh
```

Wait 3–5 minutes. At the end it prints:

- **Dashboard URL** → `http://YOUR_VPS_IP/`
- **ADMIN API KEY** → shown ONLY ONCE. Copy and save it immediately.

Then open the dashboard, paste the key, scan the WhatsApp QR. Done — skip to step 6.

---

## 5. Manual install (what the script does, one small command at a time)

Use this if you want to do it yourself, or the script fails somewhere.

### 5a. System packages

```bash
apt update
```
```bash
apt install -y build-essential python3 nginx curl
```

### 5b. Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
```
```bash
apt install -y nodejs
```
```bash
node -v
```
(should print v22.x)

### 5c. PM2 (keeps the app running 24/7)

```bash
npm install -g pm2
```

### 5d. Put the app in place

```bash
mkdir -p /opt/baileys-api
```
```bash
cp -r baileys-api/. /opt/baileys-api/
```
```bash
cd /opt/baileys-api
```

### 5e. Install dependencies

```bash
npm ci --omit=dev
```

### 5f. Create the .env config

```bash
cp .env.example .env
```

Generate two different secrets (run twice, save both outputs):

```bash
openssl rand -base64 48
```
```bash
openssl rand -base64 48
```

Edit the config:

```bash
nano .env
```

Set these lines (paste your generated values):

- `ADMIN_API_KEY=` first generated secret  ← this is your main API key
- `API_KEY_PEPPER=` second generated secret
- `CORS_ORIGINS=` leave empty
- `PUBLIC_IP=` your VPS IP (e.g. 2.25.192.86)
- `PUBLIC_DOMAIN=` your domain if you have one, else leave empty

Save: `Ctrl+O`, Enter, `Ctrl+X`.

Secure the files:

```bash
mkdir -p data logs
```
```bash
chmod 700 data logs && chmod 600 .env
```

### 5g. Nginx (makes the app reachable on port 80)

```bash
cp nginx/baileys-api.conf /etc/nginx/sites-available/baileys-api
```
```bash
rm -f /etc/nginx/sites-enabled/default
```
```bash
ln -sf /etc/nginx/sites-available/baileys-api /etc/nginx/sites-enabled/baileys-api
```
```bash
nginx -t
```
(must say "syntax is ok")
```bash
systemctl reload nginx
```

### 5h. Start the app with PM2

```bash
pm2 start ecosystem.config.cjs
```
```bash
pm2 startup
```
```bash
pm2 save
```

### 5i. Firewall

```bash
ufw allow OpenSSH
```
```bash
ufw allow 'Nginx Full'
```
```bash
ufw --force enable
```

### 5j. Check it works

```bash
curl http://127.0.0.1:3000/healthz
```
(should print `"status":"ok"`)

---

## 6. Connect WhatsApp (dashboard)

1. Open `http://YOUR_VPS_IP/` in your browser
2. Paste your **ADMIN_API_KEY** → Unlock
3. Phone: WhatsApp → Settings → **Linked devices** → **Link a device** → scan the QR
4. Connected ✅ — the page now shows the test-send form + Domain API / VPS IP API sections

The server is **send-only**: incoming messages are ignored, nothing is read or stored.

---

## 7. Send messages from your apps

```bash
curl -X POST http://YOUR_VPS_IP/api/send-message \
  -H "X-API-Key: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"923001234567","message":"Hello"}'
```

- Number = country code + number, NO `+` (e.g. `923001234567`)
- Other endpoints: `/api/send-image`, `/api/send-document`, `/api/send-audio` (multipart field `file`), `/api/send-location`

Better practice: create a separate key per app (keep admin key for yourself):

```bash
curl -X POST http://YOUR_VPS_IP/api/admin/generate-key \
  -H "X-API-Key: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-shop-app","role":"api"}'
```

---

## 8. Add a domain + free SSL (optional)

Point your domain's **A record** to the VPS IP first, then:

```bash
sed -i 's/api.example.com/yourdomain.com/' /etc/nginx/sites-available/baileys-api
```
```bash
nginx -t && systemctl reload nginx
```
```bash
apt install -y certbot python3-certbot-nginx
```
```bash
certbot --nginx -d yourdomain.com
```

Then tell the dashboard about it:

```bash
nano /opt/baileys-api/.env
```
Set `PUBLIC_DOMAIN=yourdomain.com`, save, then:

```bash
pm2 restart baileys-api --update-env
```

Now use `https://yourdomain.com/api/...` in your apps.

---

## 9. Daily operations

| What | Command |
|------|---------|
| App status | `pm2 status` |
| Live logs | `pm2 logs baileys-api` |
| Restart app | `pm2 restart baileys-api` |
| Health check | `curl http://127.0.0.1:3000/healthz` |
| Logout WhatsApp (re-scan QR) | use Logout button on dashboard |

### Update the app to latest code

```bash
cd /opt/baileys-api
```
```bash
git -C ~/baileys-api pull
```
```bash
cp -r ~/baileys-api/. /opt/baileys-api/
```
```bash
npm ci --omit=dev && pm2 restart baileys-api
```

---

## 10. Troubleshooting

| Problem | Fix |
|---------|-----|
| Dashboard not opening | `pm2 status` → if errored: `pm2 logs baileys-api` |
| "WhatsApp is not connected" | Open dashboard, scan QR again |
| QR not appearing | `pm2 restart baileys-api`, wait 10s, refresh page |
| Forgot admin key | `nano /opt/baileys-api/.env` → read `ADMIN_API_KEY` |
| Change admin key | edit `ADMIN_API_KEY` in `.env` → `pm2 restart baileys-api --update-env` |
| nginx error | `nginx -t` shows the broken line |
| Logged out by phone | dashboard shows fresh QR automatically — re-scan |

⚠️ Never run two PM2 instances of this app — one WhatsApp session = one process.

⚠️ Backup: download `/opt/baileys-api/data/baileys.sqlite` sometimes (it holds your WhatsApp session + API keys + message log).
