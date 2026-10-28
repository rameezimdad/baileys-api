# Baileys WhatsApp Send API

Developed by Mohammad Rameez Imdad (Rameez Scripts)
WhatsApp: https://wa.me/923435347417 (For Custom Projects)
YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)

Send WhatsApp messages from any app with a simple HTTP call. Scan a QR once — done.
**Send-only and fire-and-forget** — incoming messages are ignored and delivery/seen receipts
are not tracked. Built-in **anti-ban protection** (all automatic): one message at a time with a
**random 5–9s gap**, **"typing…" simulation** before each send, a **30–60s cool-down every 20
messages**, a **daily send limit** (default 500/day), and recipients are **verified on WhatsApp**
before sending. Tune everything in `.env` (`MESSAGE_DELAY_MIN/MAX_MS`, `TYPING_SIMULATION`,
`BURST_SIZE`, `DAILY_SEND_LIMIT`…). **CORS is open to any origin** by default (`CORS_ORIGINS=*`) —
call it from any website, app, localhost or `file://` page.

**Use it from Google Apps Script / Sheets:** see [`clients/apps-script`](./clients/apps-script).

[![Watch the setup video: Free WhatsApp API on a VPS, send messages from Google Sheets and Apps Script](https://img.youtube.com/vi/vh1EFdjqIwE/maxresdefault.jpg)](https://youtu.be/vh1EFdjqIwE)

---

## Install — 3 steps

> Needs: a VPS with **Ubuntu 24.04** (or 22.04), logged in as `root`.
> Repo note: make this repo **Public** on GitHub before installing, set back to **Private** after.

**1.** Open the VPS terminal (Hostinger hPanel → your VPS → **Browser terminal**)

**2.** Paste this and press Enter:

```bash
curl -fsSLo i.sh https://raw.githubusercontent.com/rameezimdad/baileys-api/master/deploy/vps-install.sh && bash i.sh
```

**3.** Wait 3–5 min. It prints your **ADMIN API KEY** — copy and save it (shown only once).
Open `http://YOUR_VPS_IP/` → paste the key → scan the QR with WhatsApp (**Settings → Linked devices → Link a device**).

That's it. The dashboard now shows a test-send form, an **API Keys** panel, and ready-made code examples.

**Reinstall from zero** (new key + new QR): same command but `bash i.sh --fresh`

## Update an existing install (one command)

Already installed? Get the latest code **without losing anything** — same `.env`, same API
keys, same WhatsApp session (no QR re-scan), message history intact:

```bash
curl -fsSLo u.sh https://raw.githubusercontent.com/rameezimdad/baileys-api/master/deploy/vps-update.sh && bash u.sh
```

> Repo note: same as install — make the repo **Public** while running this, set back to
> **Private** after (or pass a GitHub token: `bash u.sh YOUR_TOKEN`).

Run it on every client VPS whenever you ship a new version — takes ~1 minute.

## Delete old install (manual cleanup)

Run these one by one if you want to remove everything yourself:

```bash
pm2 delete baileys-api
```
```bash
rm -rf /opt/baileys-api ~/baileys-api ~/i.sh
```
```bash
rm -f /etc/nginx/sites-enabled/baileys-api /etc/nginx/sites-available/baileys-api
```
```bash
systemctl reload nginx
```

(`bash i.sh --fresh` does the same cleanup automatically before installing.)

---

## Send a message

```bash
curl -X POST http://YOUR_VPS_IP/api/send-message \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"923001234567","message":"Hello"}'
```

- Number = country code + number, **no `+`**
- Also: `/api/send-image`, `/api/send-document`, `/api/send-audio` (multipart field `file`), `/api/send-location`
- Bulk? Fire away — extra messages reply `"status":"queued"` instantly and send automatically, safely spaced
- Make one key per app from the dashboard's **API Keys** panel

## Domain + HTTPS (optional)

1. Cloudflare → add domain → DNS: `A @ → VPS_IP` and `A www → VPS_IP`, both **Proxied** (orange cloud)
2. Set Cloudflare's nameservers at your registrar
3. Cloudflare → **SSL/TLS → Overview → "Flexible"** (otherwise error 522)
4. On the VPS:

```bash
sed -i 's|^PUBLIC_DOMAIN=.*|PUBLIC_DOMAIN=yourdomain.com|' /opt/baileys-api/.env && pm2 restart baileys-api --update-env
```

## Update to latest code

```bash
bash i.sh
```

(Same installer — it keeps your `.env`, API keys, and WhatsApp session. Repo must be Public for the moment.)

## Daily commands

| What | Command |
|------|---------|
| Status / logs | `pm2 status` · `pm2 logs baileys-api` |
| Restart | `pm2 restart baileys-api` |
| Forgot admin key | `grep ADMIN_API_KEY /opt/baileys-api/.env` |
| Anti-ban gap | `MESSAGE_DELAY_MIN_MS` / `MESSAGE_DELAY_MAX_MS` in `/opt/baileys-api/.env` (then restart) — default 5000–9000 |

Detailed manual install & troubleshooting: **[INSTALL.md](INSTALL.md)**
