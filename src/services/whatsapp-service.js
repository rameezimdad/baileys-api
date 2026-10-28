/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from 'baileys'
import PQueue from 'p-queue'
import { AppError } from '../utils/errors.js'
import { normalizeRecipient } from '../utils/recipient.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const randBetween = (min, max) => max > min ? min + Math.floor(Math.random() * (max - min + 1)) : min

export class WhatsAppService {
  constructor({ authStore, messages, logs, logger, cfg }) {
    this.authStore = authStore
    this.messages = messages
    this.logs = logs
    this.logger = logger.child({ module: 'whatsapp' }, { level: cfg.baileysLogLevel || 'warn' })
    this.cfg = cfg
    this.socket = null
    this.status = 'stopped'
    this.qr = null
    this.qrExpiresAt = null
    this.lastError = null
    this.connectedAt = null
    this.reconnectAttempts = 0
    this.reconnectTimer = null
    this.generation = 0
    this.stopped = true
    this.startPromise = null
    this.version = null
    this.qrWaiters = new Set()
    // anti-ban: one msg at a time, random human-like gap between sends (default 5-9s)
    this.queue = new PQueue({ concurrency: 1 })
    this.nextSendAt = 0
    this.sentInBurst = 0
  }

  async start() {
    if (this.startPromise) return this.startPromise
    if (this.socket && ['connecting', 'qr_ready', 'connected'].includes(this.status)) return
    this.stopped = false
    this.startPromise = this.connect()
      .catch(error => {
        this.status = 'error'
        this.lastError = error.message
        this.logs.write('error', 'whatsapp', 'connection start failed', { error: error.message })
        this.scheduleReconnect(false)
        throw error
      })
      .finally(() => {
        this.startPromise = null
      })
    return this.startPromise
  }

  async connect() {
    const generation = ++this.generation
    this.status = this.reconnectAttempts ? 'reconnecting' : 'connecting'
    const { state, saveCreds } = this.authStore.load()
    if (!this.version) {
      try {
        const latest = await fetchLatestBaileysVersion()
        this.version = latest.version
        this.logs.write('info', 'whatsapp', 'protocol version resolved', {
          version: this.version.join('.'),
          isLatest: latest.isLatest
        })
      } catch (error) {
        this.logger.warn({ err: error }, 'protocol version lookup failed; using Baileys default')
      }
    }

    const socket = makeWASocket({
      ...(this.version ? { version: this.version } : {}),
      logger: this.logger,
      browser: Browsers.ubuntu('Rameez Baileys API'),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger)
      },
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false, // send-only
      generateHighQualityLinkPreview: false,
      getMessage: async key => key.id ? this.messages.getContent(key.id) : undefined
    })

    this.socket = socket
    socket.ev.on('creds.update', () => {
      if (generation === this.generation) saveCreds().catch(error => {
        this.logs.write('error', 'whatsapp', 'credential save failed', { error: error.message })
      })
    })
    socket.ev.on('connection.update', update => this.onConnectionUpdate(update, generation))
    socket.ev.on('messages.upsert', () => {}) // send-only: inbound dropped, never stored
    // fire-and-forget: delivery/read receipts are NOT tracked — send and move on
  }

  onConnectionUpdate(update, generation) {
    if (generation !== this.generation) return
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      this.qr = qr
      this.qrExpiresAt = new Date(Date.now() + this.cfg.qrTtlMs).toISOString()
      this.status = 'qr_ready'
      this.resolveQrWaiters()
      this.logs.write('info', 'whatsapp', 'QR code generated', { expiresAt: this.qrExpiresAt })
    }

    if (connection === 'open') {
      this.status = 'connected'
      this.connectedAt = new Date().toISOString()
      this.qr = null
      this.qrExpiresAt = null
      this.lastError = null
      this.reconnectAttempts = 0
      this.resolveQrWaiters()
      this.logs.write('info', 'whatsapp', 'WhatsApp connected', { user: this.maskUser(this.socket?.user?.id) })
      return
    }

    if (connection !== 'close') return
    const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.data?.statusCode
    const loggedOut = code === DisconnectReason.loggedOut
    this.lastError = lastDisconnect?.error?.message || 'Connection closed'
    this.socket = null
    this.logs.write(loggedOut ? 'warn' : 'error', 'whatsapp', 'WhatsApp connection closed', {
      code,
      loggedOut,
      error: this.lastError
    })

    if (loggedOut) {
      this.status = 'logged_out'
      ++this.generation
      this.authStore.clear()
      this.scheduleReconnect(true)
      return
    }
    this.scheduleReconnect(false)
  }

  scheduleReconnect(fresh) {
    if (this.stopped || this.reconnectTimer) return
    this.status = fresh ? 'connecting' : 'reconnecting'
    const base = Math.min(1000 * (2 ** this.reconnectAttempts), this.cfg.reconnectMaxDelayMs)
    const delay = fresh ? 1000 : Math.round(base * (0.8 + Math.random() * 0.4))
    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.start().catch(error => {
        this.lastError = error.message
        this.logger.warn({ err: error }, 'reconnect attempt failed')
      })
    }, delay)
    this.reconnectTimer.unref()
  }

  resolveQrWaiters() {
    for (const resolve of this.qrWaiters) resolve(this.getQr())
    this.qrWaiters.clear()
  }

  getQr() {
    if (!this.qr || Date.parse(this.qrExpiresAt) <= Date.now()) return null
    return { qr: this.qr, expiresAt: this.qrExpiresAt }
  }

  async waitForQr(timeoutMs = this.cfg.qrWaitMs) {
    const current = this.getQr()
    if (current || this.status === 'connected') return current
    return new Promise(resolve => {
      const done = value => {
        clearTimeout(timer)
        this.qrWaiters.delete(done)
        resolve(value)
      }
      const timer = setTimeout(() => done(this.getQr()), timeoutMs)
      this.qrWaiters.add(done)
    })
  }

  sendGapMs() {
    return randBetween(this.cfg.messageDelayMinMs ?? 5000, this.cfg.messageDelayMaxMs ?? 9000)
  }

  // every BURST_SIZE messages take a longer breather, like a human would
  burstPauseMs() {
    const size = this.cfg.burstSize ?? 0
    if (!size || ++this.sentInBurst < size) return 0
    this.sentInBurst = 0
    const pause = randBetween(this.cfg.burstPauseMinMs ?? 30000, this.cfg.burstPauseMaxMs ?? 60000)
    this.logs.write('info', 'whatsapp', 'anti-ban burst cool-down', { pauseMs: pause, afterMessages: size })
    return pause
  }

  // show "typing…" briefly before sending, scaled to message length
  async simulateTyping(jid, content) {
    if (!this.cfg.typingSimulation) return
    try {
      await this.socket.sendPresenceUpdate('composing', jid)
      const len = (content.text || content.caption || '').length
      await sleep(Math.min(randBetween(900, 1800) + len * 25, 4000))
      await this.socket.sendPresenceUpdate('paused', jid)
    } catch { /* presence is best-effort */ }
  }

  todayStartIso() {
    return new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
  }

  sentToday() {
    return this.messages.countSince(this.todayStartIso())
  }

  getStatus() {
    return {
      status: this.status,
      connected: this.status === 'connected',
      user: this.status === 'connected' ? this.maskUser(this.socket?.user?.id) : null,
      connectedAt: this.connectedAt,
      qrAvailable: Boolean(this.getQr()),
      qrExpiresAt: this.getQr()?.expiresAt || null,
      reconnectAttempts: this.reconnectAttempts,
      pendingMessages: this.queue.size + this.queue.pending,
      queueGapMs: { min: this.cfg.messageDelayMinMs ?? 5000, max: this.cfg.messageDelayMaxMs ?? 9000 },
      sentToday: this.sentToday(),
      dailyLimit: this.cfg.dailySendLimit ?? 0,
      lastError: this.lastError
    }
  }

  maskUser(id) {
    if (!id) return null
    const [number, server] = id.split('@')
    return `${number.slice(0, 3)}***${number.slice(-3)}@${server || 's.whatsapp.net'}`
  }

  async ensureConnected() {
    if (this.status !== 'connected' || !this.socket) {
      throw new AppError(503, 'WHATSAPP_NOT_CONNECTED', 'WhatsApp is not connected')
    }
  }

  async resolveRecipient(to) {
    const jid = normalizeRecipient(to)
    if (!this.cfg.checkRecipientExists || jid.endsWith('@g.us')) return jid
    const [result] = await this.socket.onWhatsApp(jid)
    if (!result?.exists) throw new AppError(404, 'RECIPIENT_NOT_FOUND', 'Recipient is not registered on WhatsApp')
    return result.jid || jid
  }

  async send({ to, type, content, payload, apiKeyId }) {
    await this.ensureConnected()
    const limit = this.cfg.dailySendLimit ?? 0
    if (limit > 0 && this.sentToday() >= limit) {
      throw new AppError(429, 'DAILY_LIMIT_REACHED', `Daily send limit (${limit}) reached — protects the number from bans; resets at midnight UTC. Raise DAILY_SEND_LIMIT in .env if needed.`)
    }
    const recipient = await this.resolveRecipient(to)
    const record = this.messages.create({ recipient, type, payload, apiKeyId })
    const queuedBehind = this.queue.size + this.queue.pending

    const markFailed = error => {
      this.messages.markFailed(record.id, error.message)
      this.logs.write('error', 'message', 'message send failed', {
        messageId: record.id,
        recipient: this.maskUser(recipient),
        type,
        error: error.message
      }, { apiKeyId })
    }

    const task = this.queue.add(async () => {
      const wait = this.nextSendAt - Date.now()
      if (wait > 0) await sleep(wait)
      await this.ensureConnected()
      await this.simulateTyping(recipient, content)
      const result = await this.socket.sendMessage(recipient, content)
      this.nextSendAt = Date.now() + this.sendGapMs() + this.burstPauseMs()
      if (!result?.key?.id) throw new Error('WhatsApp did not return a message ID')
      const sent = this.messages.markSent(record.id, result)
      this.logs.write('info', 'message', 'message sent', {
        messageId: record.id,
        waMessageId: sent.waMessageId,
        recipient: this.maskUser(recipient),
        type
      }, { apiKeyId })
      return { ...sent, recipient, type }
    })

    // bulk requests would outwait the HTTP timeout behind the anti-ban gap;
    // wait briefly, then hand back "queued" and let it send in the background
    let timer
    const winner = await Promise.race([
      task.then(result => ({ result }), error => ({ error })),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), 15000); timer.unref?.() })
    ])
    clearTimeout(timer)

    if (!winner) {
      task.then(() => {}, markFailed)
      return { id: record.id, status: 'queued', recipient, type, queuedBehind }
    }
    if (winner.error) {
      markFailed(winner.error)
      throw winner.error
    }
    return winner.result
  }

  async logout() {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    const socket = this.socket
    ++this.generation
    this.socket = null
    this.status = 'logged_out'
    this.qr = null
    this.qrExpiresAt = null

    if (socket) {
      await socket.logout().catch(error => this.logger.warn({ err: error }, 'socket logout failed'))
      socket.end(new Error('API logout'))
    }
    this.authStore.clear()
    this.reconnectAttempts = 0
    this.logs.write('info', 'whatsapp', 'WhatsApp session logged out')
    await this.start()
    return this.getStatus()
  }

  async stop() {
    this.stopped = true
    ++this.generation
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    await this.queue.onIdle()
    this.queue.pause()
    if (this.socket) this.socket.end(new Error('Server shutdown'))
    this.socket = null
    this.status = 'stopped'
  }
}
