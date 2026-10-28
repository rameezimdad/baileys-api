<!--
Developed by Mohammad Rameez Imdad (Rameez Scripts)
WhatsApp: https://wa.me/923435347417 (For Custom Projects)
YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
-->

# WhatsApp API — Google Apps Script client

Use the Baileys WhatsApp API from **any** Apps Script project — web apps, Google Sheets,
time-driven triggers, forms. `UrlFetchApp` runs server-side, so **there are no CORS issues
here at all** (CORS only affects browsers; Apps Script is a server).

One drop-in file: [`WhatsAppApi.gs`](./WhatsAppApi.gs).

## Setup (once)

1. Open your project → **Extensions ▸ Apps Script**.
2. Add a file and paste in everything from `WhatsAppApi.gs`.
3. Store your endpoint + key (keeps the file shareable without secrets):

```js
waSetup('https://thepashatraders.com/api', 'YOUR_API_KEY');
```

   …or in a Sheet, use the **📱 WhatsApp ▸ Settings…** menu.

> The file ships with **no API key** on purpose (safe to share/commit). Set it once with
> `waSetup()` and it's stored in that project's Script Properties.

## Send from anywhere

```js
waSendMessage('923001234567', 'Your fee of PKR 9,000 is due.');
waSendImage('923001234567', 'https://example.com/receipt.png', 'Receipt');
waSendDocument('923001234567', 'https://example.com/invoice.pdf', 'Invoice #1024', 'invoice.pdf');
waSendLocation('923001234567', 24.8607, 67.0011, 'Office', 'Karachi');

// upload a Drive file directly (no public URL needed)
const blob = DriveApp.getFileById('FILE_ID').getBlob();
waSendImageBlob('923001234567', blob, 'Here you go');

waStatus();        // { status, connected, user, ... }
waIsConnected();   // true / false
```

Phone numbers can be in any format (`+92 300 1234567`, `0300-1234567`, …) — the client strips
everything except digits before sending.

## Use inside a web app

Call the functions from your server code; the browser side uses `google.script.run`:

```js
// Code.gs
function sendReminder(phone, text) {
  return waSendMessage(phone, text); // throws on failure
}
```

```html
<!-- index.html -->
<script>
  google.script.run
    .withSuccessHandler(() => alert('Sent!'))
    .withFailureHandler(e => alert(e.message))
    .sendReminder('923001234567', 'Reminder text');
</script>
```

## Use inside Google Sheets

Open any sheet that has this script → a **📱 WhatsApp** menu appears.

- **Send to all rows** / **Send to selected rows** — auto-detects a phone column
  (`Phone`, `WhatsApp`, `Mobile`, `Number`, `Contact`, `Cell`) and a message column
  (`Message`, `Text`, `Reminder`, `Body`, `Note`). No message column? It asks for one
  text to broadcast to every row.
- Writes **WA Status** + **WA Sent At** columns back so you can see what went out.
- **Check connection** / **Settings…** — status + credentials.

If your project already has an `onOpen()`, just call `waBuildMenu_()` inside it.

> ⚠️ Custom functions (`=WA_SEND(...)` typed into a cell) **cannot** be used — Google blocks
> `UrlFetchApp` inside cell formulas. Use the menu or a button-bound script instead.

## Bulk sending & anti-ban

The server queues messages itself — one at a time with a **random 5–9s gap** (anti-ban), so
bulk sends are safe out of the box. Fire-and-forget: a response of `status: "queued"` means
the server accepted it and will send it when its turn comes. To add an EXTRA client-side gap
on top (rarely needed):

```js
PropertiesService.getScriptProperties().setProperty('WA_THROTTLE_MS', '2500'); // ms between sends
```

## Function reference

| Function | Purpose |
|---|---|
| `waSendMessage(to, message)` | Send text |
| `waSendImage(to, url, caption)` / `waSendImageBlob(to, blob, caption)` | Send image (URL or Drive blob) |
| `waSendDocument(to, url, caption, fileName)` / `waSendDocumentBlob(...)` | Send document |
| `waSendLocation(to, lat, lng, name, address)` | Send a pin |
| `waStatus()` / `waIsConnected()` / `waMe()` | Connection + key info |
| `waSetup(base, key, fallbackKey)` | Save config to Script Properties |
| `waTest()` | Send a test message to the dev number |
