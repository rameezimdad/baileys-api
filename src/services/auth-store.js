/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import { BufferJSON, initAuthCreds, proto } from 'baileys'

const CREDS_CATEGORY = 'creds'
const CREDS_ID = 'main'

export class SqliteAuthStore {
  constructor(db) {
    this.db = db
    this.getOne = db.prepare('SELECT value FROM whatsapp_auth WHERE category = ? AND id = ?')
    this.upsert = db.prepare(`
      INSERT INTO whatsapp_auth (category, id, value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(category, id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    this.deleteOne = db.prepare('DELETE FROM whatsapp_auth WHERE category = ? AND id = ?')
    this.clearAll = db.prepare('DELETE FROM whatsapp_auth')
    this.writeBatch = db.transaction(entries => {
      const now = new Date().toISOString()
      for (const [category, id, value] of entries) {
        if (value === null || typeof value === 'undefined') {
          this.deleteOne.run(category, id)
        } else {
          this.upsert.run(category, id, JSON.stringify(value, BufferJSON.replacer), now)
        }
      }
    })
  }

  parse(value) {
    return value ? JSON.parse(value, BufferJSON.reviver) : null
  }

  load() {
    const row = this.getOne.get(CREDS_CATEGORY, CREDS_ID)
    const creds = this.parse(row?.value) || initAuthCreds()
    const keys = {
      get: async (type, ids) => {
        if (!ids.length) return {}
        const placeholders = ids.map(() => '?').join(',')
        const rows = this.db.prepare(`
          SELECT id, value FROM whatsapp_auth
          WHERE category = ? AND id IN (${placeholders})
        `).all(type, ...ids)

        return Object.fromEntries(rows.map(row => {
          let value = this.parse(row.value)
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value)
          }
          return [row.id, value]
        }))
      },
      set: async data => {
        const entries = []
        for (const [category, values] of Object.entries(data)) {
          for (const [id, value] of Object.entries(values || {})) {
            entries.push([category, id, value])
          }
        }
        this.writeBatch(entries)
      },
      clear: async () => this.clear()
    }

    return {
      state: { creds, keys },
      saveCreds: async () => {
        this.writeBatch([[CREDS_CATEGORY, CREDS_ID, creds]])
      }
    }
  }

  clear() {
    this.clearAll.run()
  }
}
