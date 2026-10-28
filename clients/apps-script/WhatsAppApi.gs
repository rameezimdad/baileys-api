/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 *
 * WhatsApp API client for Google Apps Script — drop this one file into ANY project.
 * Works inside web apps (call from server via google.script.run) AND from Google
 * Sheets menus/triggers. UrlFetchApp runs server-side, so there are NO CORS issues.
 *
 * Quick start:
 *   1) Paste this file into your Apps Script project (Extensions ▸ Apps Script).
 *   2) Run waSetup('https://thepashatraders.com/api', 'YOUR_KEY') once (or use the menu ▸ Settings).
 *   3) Anywhere: waSendMessage('923001234567', 'Hello from Apps Script');
 */

// config — set your key once via waSetup() or the Settings menu (stored in Script Properties).
// keep keys OUT of this file so it stays safe to share/commit.
const WA_DEFAULTS = {
  base: 'https://thepashatraders.com/api', // your API base (not secret)
  key: '',                                 // set via waSetup('...', 'YOUR_KEY')
  fallbackKey: '',                         // optional 2nd key, tried if the first fails
  throttleMs: 0                            // extra client-side gap for bulk sends; server already queues 5-9s anti-ban
};

const waCfg_ = () => {
  const p = PropertiesService.getScriptProperties();
  return {
    base: p.getProperty('WA_BASE') || WA_DEFAULTS.base,
    key: p.getProperty('WA_KEY') || WA_DEFAULTS.key,
    fallbackKey: p.getProperty('WA_FALLBACK_KEY') || WA_DEFAULTS.fallbackKey,
    throttleMs: Number(p.getProperty('WA_THROTTLE_MS') || WA_DEFAULTS.throttleMs)
  };
};

// save creds in Script Properties (so the file stays key-free when shared)
function waSetup(base, key, fallbackKey) {
  const p = PropertiesService.getScriptProperties();
  if (base) p.setProperty('WA_BASE', String(base).trim());
  if (key) p.setProperty('WA_KEY', String(key).trim());
  if (fallbackKey) p.setProperty('WA_FALLBACK_KEY', String(fallbackKey).trim());
  return 'WA config saved';
}

// digits only — strips +, spaces, dashes; API normalizes to a WhatsApp JID
const waPhone_ = v => String(v == null ? '' : v).replace(/[^\d]/g, '');

// core request — JSON or multipart, retries once on the fallback key, parses {success,data,error,code}
const waFetch_ = (path, payload, opts) => {
  opts = opts || {};
  const cfg = waCfg_();
  if (!cfg.key) throw new Error('No API key set. Run waSetup(BASE_URL, YOUR_KEY) or use 📱 WhatsApp ▸ Settings.');
  const url = cfg.base.replace(/\/+$/, '') + path;
  const build = key => {
    const o = { method: opts.method || 'post', muteHttpExceptions: true, headers: { 'X-API-Key': key } };
    if (opts.multipart) o.payload = payload;                                 // blob form-data
    else if (payload) { o.contentType = 'application/json'; o.payload = JSON.stringify(payload); }
    return o;
  };

  let res = UrlFetchApp.fetch(url, build(cfg.key));
  let code = res.getResponseCode();
  // retry with fallback key on auth/server failure
  if ((code === 401 || code === 403 || code >= 500) && cfg.fallbackKey && cfg.fallbackKey !== cfg.key) {
    res = UrlFetchApp.fetch(url, build(cfg.fallbackKey));
    code = res.getResponseCode();
  }

  const body = res.getContentText();
  let data;
  try { data = body ? JSON.parse(body) : {}; } catch (e) { data = { error: body }; }
  if (code >= 400 || data.success === false) {
    throw new Error('WhatsApp API: ' + (data.error || ('HTTP ' + code)) + (data.code ? ' [' + data.code + ']' : ''));
  }
  return data.data !== undefined ? data.data : data;
};

// ===== public API — use these anywhere (web app server fns, triggers, sheets) =====

function waSendMessage(to, message) {
  return waFetch_('/send-message', { to: waPhone_(to), message: String(message) });
}
function waSendImage(to, imageUrl, caption) {
  return waFetch_('/send-image', { to: waPhone_(to), url: imageUrl, caption: caption || '' });
}
function waSendDocument(to, fileUrl, caption, fileName) {
  return waFetch_('/send-document', { to: waPhone_(to), url: fileUrl, caption: caption || '', fileName: fileName || '' });
}
function waSendLocation(to, latitude, longitude, name, address) {
  return waFetch_('/send-location', { to: waPhone_(to), latitude, longitude, name: name || '', address: address || '' });
}
// upload a Drive file / blob directly (no public URL needed)
function waSendImageBlob(to, blob, caption) {
  return waFetch_('/send-image', { to: waPhone_(to), caption: caption || '', file: blob }, { multipart: true });
}
function waSendDocumentBlob(to, blob, caption, fileName) {
  const payload = { to: waPhone_(to), caption: caption || '', file: blob };
  if (fileName) payload.fileName = fileName;
  return waFetch_('/send-document', payload, { multipart: true });
}

function waStatus() { return waFetch_('/status', null, { method: 'get' }); }
function waIsConnected() { try { return !!waStatus().connected; } catch (e) { return false; } }
function waMe() { return waFetch_('/me', null, { method: 'get' }); }

// quick smoke test — put your own number here
function waTest() { Logger.log(waSendMessage('923001000001', 'Test from Apps Script ✅')); }

// ===== Google Sheets integration =====

function onOpen() { waBuildMenu_(); } // if you already have onOpen, just call waBuildMenu_() inside it

const waBuildMenu_ = () => {
  SpreadsheetApp.getUi().createMenu('📱 WhatsApp')
    .addItem('Send to all rows', 'waBulkSendFromSheet')
    .addItem('Send to selected rows', 'waSendToSelected')
    .addSeparator()
    .addItem('Check connection', 'waCheckConnection')
    .addItem('Settings…', 'waSettingsPrompt')
    .addToUi();
};

function waBulkSendFromSheet() { waRunBulk_(null); }
function waSendToSelected() {
  const sel = SpreadsheetApp.getActiveRange();
  waRunBulk_(sel ? { start: sel.getRow(), end: sel.getLastRow() } : null);
}

const waFindCol_ = (headers, re) => headers.findIndex(h => re.test(h));

// reads active sheet, auto-detects a phone + message column, sends, writes status back
const waRunBulk_ = range => {
  const sh = SpreadsheetApp.getActiveSheet();
  const ui = SpreadsheetApp.getUi();
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2) { ui.alert('No data rows found.'); return; }

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const phoneCol = waFindCol_(headers, /whats?app|phone|mobile|number|contact|cell/i);
  const msgCol = waFindCol_(headers, /message|msg|text|reminder|body|note/i);
  if (phoneCol < 0) { ui.alert('Add a column header like "Phone" or "WhatsApp" first.'); return; }

  // no message column? ask for one broadcast text
  let broadcast = '';
  if (msgCol < 0) {
    const r = ui.prompt('No message column', 'Type one message to send to every row:', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) return;
    broadcast = r.getResponseText();
  }

  // status writeback cols (append if missing)
  let statusCol = waFindCol_(headers, /^wa status$/i);
  let sentCol = waFindCol_(headers, /^wa sent at$/i);
  if (statusCol < 0) { statusCol = sh.getLastColumn(); sh.getRange(1, statusCol + 1).setValue('WA Status'); }
  if (sentCol < 0) { sentCol = sh.getLastColumn(); sh.getRange(1, sentCol + 1).setValue('WA Sent At'); }

  const cfg = waCfg_();
  const start = range ? Math.max(2, range.start) : 2;
  const end = range ? range.end : lastRow;
  let sent = 0, failed = 0;

  for (let row = start; row <= end; row++) {
    const to = sh.getRange(row, phoneCol + 1).getValue();
    if (!to) continue;
    const msg = broadcast || sh.getRange(row, msgCol + 1).getValue();
    if (!msg) continue;
    try {
      waSendMessage(to, msg);
      sh.getRange(row, statusCol + 1).setValue('✅ Sent');
      sh.getRange(row, sentCol + 1).setValue(new Date());
      sent++;
    } catch (e) {
      sh.getRange(row, statusCol + 1).setValue('❌ ' + e.message);
      failed++;
    }
    SpreadsheetApp.flush(); // persist progress per row (survives the 6-min limit)
    if (cfg.throttleMs > 0 && row < end) Utilities.sleep(cfg.throttleMs);
  }
  ui.alert('WhatsApp send complete\n\nSent: ' + sent + '\nFailed: ' + failed);
};

function waCheckConnection() {
  const ui = SpreadsheetApp.getUi();
  try {
    const s = waStatus();
    ui.alert('WhatsApp\n\nStatus: ' + s.status + '\nConnected: ' + (s.connected ? 'yes' : 'no') + (s.user ? '\nNumber: ' + s.user : ''));
  } catch (e) {
    ui.alert('Could not reach the API:\n\n' + e.message);
  }
}

function waSettingsPrompt() {
  const ui = SpreadsheetApp.getUi(), cfg = waCfg_();
  const r1 = ui.prompt('WhatsApp API — Base URL', 'Current: ' + cfg.base + '\n(blank = keep current)', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const r2 = ui.prompt('WhatsApp API — API Key', '(blank = keep current)', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  waSetup(r1.getResponseText().trim(), r2.getResponseText().trim(), '');
  ui.alert('Saved to Script Properties.');
}
