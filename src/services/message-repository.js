/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import { randomUUID } from 'node:crypto'
import { BufferJSON } from 'baileys'

export class MessageRepository {
  constructor(db) {
    this.insert = db.prepare(`
      INSERT INTO messages
        (id, recipient, type, payload_json, status, api_key_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)
    `)
    this.sent = db.prepare(`
      UPDATE messages SET wa_message_id = ?, message_json = ?, status = 'sent', updated_at = ?
      WHERE id = ?
    `)
    this.failed = db.prepare(`
      UPDATE messages SET status = 'failed', error = ?, updated_at = ? WHERE id = ?
    `)
    this.findMessage = db.prepare('SELECT message_json FROM messages WHERE wa_message_id = ?')
    this.sinceCount = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE created_at >= ? AND status != 'failed'`)

    // queue page: queued drains FIFO (ASC), history newest first (DESC)
    const COLS = 'id, wa_message_id, recipient, type, payload_json, status, error, api_key_id, created_at, updated_at'
    this.listQ = {
      all: db.prepare(`SELECT ${COLS} FROM messages ORDER BY created_at DESC LIMIT ?`),
      status: db.prepare(`SELECT ${COLS} FROM messages WHERE status = ? ORDER BY CASE WHEN status = 'queued' THEN created_at END ASC, created_at DESC LIMIT ?`),
      key: db.prepare(`SELECT ${COLS} FROM messages WHERE api_key_id = ? ORDER BY created_at DESC LIMIT ?`),
      keyStatus: db.prepare(`SELECT ${COLS} FROM messages WHERE api_key_id = ? AND status = ? ORDER BY CASE WHEN status = 'queued' THEN created_at END ASC, created_at DESC LIMIT ?`)
    }
    this.countsAll = db.prepare('SELECT status, COUNT(*) AS n FROM messages GROUP BY status')
    this.countsKey = db.prepare('SELECT status, COUNT(*) AS n FROM messages WHERE api_key_id = ? GROUP BY status')
  }

  preview(row) {
    try {
      const p = JSON.parse(row.payload_json)
      const text = p.text || p.caption || p.fileName || p.name || ''
      return String(text).slice(0, 90)
    } catch { return '' }
  }

  list({ status = null, apiKeyId = null, limit = 50 } = {}) {
    const rows = apiKeyId
      ? (status ? this.listQ.keyStatus.all(apiKeyId, status, limit) : this.listQ.key.all(apiKeyId, limit))
      : (status ? this.listQ.status.all(status, limit) : this.listQ.all.all(limit))
    return rows.map(row => ({
      id: row.id,
      waMessageId: row.wa_message_id,
      recipient: row.recipient,
      type: row.type,
      preview: this.preview(row),
      status: row.status,
      error: row.error,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }

  counts(apiKeyId = null) {
    const rows = apiKeyId ? this.countsKey.all(apiKeyId) : this.countsAll.all()
    return Object.fromEntries(rows.map(row => [row.status, row.n]))
  }

  create({ recipient, type, payload, apiKeyId }) {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.insert.run(id, recipient, type, JSON.stringify(payload), apiKeyId === 'bootstrap' ? null : apiKeyId, now, now)
    return { id, status: 'queued', createdAt: now }
  }

  markSent(id, waMessage) {
    const now = new Date().toISOString()
    this.sent.run(
      waMessage.key.id,
      JSON.stringify(waMessage, BufferJSON.replacer),
      now,
      id
    )
    return { id, waMessageId: waMessage.key.id, status: 'sent', sentAt: now }
  }

  markFailed(id, error) {
    this.failed.run(String(error).slice(0, 1000), new Date().toISOString(), id)
  }

  countSince(iso) {
    return this.sinceCount.get(iso)?.n || 0
  }

  getContent(waMessageId) {
    const row = this.findMessage.get(waMessageId)
    if (!row?.message_json) return undefined
    return JSON.parse(row.message_json, BufferJSON.reviver)?.message
  }
}
