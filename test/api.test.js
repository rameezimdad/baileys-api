/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import pino from 'pino'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createDatabase } from '../src/db/database.js'
import { ApiKeyService } from '../src/services/api-key-service.js'
import { LogService } from '../src/services/log-service.js'

const bootstrap = 'bootstrap-key-that-is-longer-than-thirty-two-characters'
const cfg = {
  trustProxy: 0,
  corsOrigins: ['https://allowed.example'],
  apiRateLimitWindowMs: 60000,
  apiRateLimitMax: 100,
  adminRateLimitMax: 100,
  maxMediaBytes: 1024 * 1024,
  allowRemoteMedia: false,
  remoteMediaTimeoutMs: 1000
}

class FakeWhatsApp {
  constructor() {
    this.sent = []
  }

  getStatus() {
    return { status: 'connected', connected: true }
  }

  async waitForQr() {
    return null
  }

  async send(message) {
    this.sent.push(message)
    return {
      id: 'local-message-id',
      waMessageId: 'wa-message-id',
      status: 'sent',
      recipient: `${message.to.replace(/\D/g, '')}@s.whatsapp.net`,
      type: message.type
    }
  }

  async logout() {
    return { status: 'connecting', connected: false }
  }
}

describe('Baileys API', () => {
  let db
  let app
  let apiKeys
  let whatsapp
  let apiKey
  let apiKeyId

  before(() => {
    db = createDatabase(':memory:')
    const logger = pino({ enabled: false })
    const logs = new LogService(db, logger)
    apiKeys = new ApiKeyService(db, 'pepper-that-is-longer-than-thirty-two-characters', bootstrap, logs)
    whatsapp = new FakeWhatsApp()
    app = createApp({ cfg, logger, logs, apiKeys, whatsapp })
  })

  after(() => db.close())

  it('keeps health checks public but protects all API routes', async () => {
    await request(app).get('/healthz').expect(200)
    const response = await request(app).get('/api/status').expect(401)
    assert.equal(response.body.code, 'AUTH_REQUIRED')
  })

  it('generates a hashed API key through the bootstrap admin key', async () => {
    const response = await request(app)
      .post('/api/admin/generate-key')
      .set('x-api-key', bootstrap)
      .send({ name: 'integration client', role: 'api' })
      .expect(201)

    apiKey = response.body.data.apiKey
    apiKeyId = response.body.data.id
    assert.match(apiKey, /^wapi_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$/)

    const stored = db.prepare('SELECT key_hash, salt FROM api_keys WHERE id = ?').get(apiKeyId)
    assert.ok(stored.key_hash)
    assert.ok(stored.salt)
    assert.equal(JSON.stringify(stored).includes(apiKey), false)
  })

  it('authenticates stored keys and enforces admin roles', async () => {
    await request(app).get('/api/status').set('x-api-key', apiKey).expect(200)
    const response = await request(app)
      .get('/api/admin/list-keys')
      .set('x-api-key', apiKey)
      .expect(403)
    assert.equal(response.body.code, 'ADMIN_REQUIRED')
  })

  it('validates and sends text messages', async () => {
    await request(app)
      .post('/api/send-message')
      .set('x-api-key', apiKey)
      .send({ to: 'bad', message: '' })
      .expect(400)

    const response = await request(app)
      .post('/api/send-message')
      .set('authorization', `Bearer ${apiKey}`)
      .send({ to: '+92 300 1234567', message: 'Hello' })
      .expect(201)

    assert.equal(response.body.data.status, 'sent')
    assert.equal(whatsapp.sent.at(-1).content.text, 'Hello')
  })

  it('rejects unsupported image uploads', async () => {
    const response = await request(app)
      .post('/api/send-image')
      .set('x-api-key', apiKey)
      .field('to', '923001234567')
      .attach('file', Buffer.from('not an image'), {
        filename: 'payload.txt',
        contentType: 'text/plain'
      })
      .expect(415)
    assert.equal(response.body.code, 'MEDIA_TYPE_UNSUPPORTED')
  })

  it('revokes keys immediately', async () => {
    await request(app)
      .post('/api/admin/revoke-key')
      .set('x-api-key', bootstrap)
      .send({ id: apiKeyId })
      .expect(200)

    await request(app).get('/api/status').set('x-api-key', apiKey).expect(401)
  })

  it('records request activity in SQLite', () => {
    const count = db.prepare(`SELECT COUNT(*) AS count FROM logs WHERE category = 'http'`).get().count
    assert.ok(count >= 6)
  })
})
