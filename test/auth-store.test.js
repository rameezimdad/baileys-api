/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDatabase } from '../src/db/database.js'
import { SqliteAuthStore } from '../src/services/auth-store.js'

describe('SQLite Baileys auth store', () => {
  it('persists credentials and binary Signal keys', async () => {
    const db = createDatabase(':memory:')
    const store = new SqliteAuthStore(db)
    const first = store.load()
    first.state.creds.platform = 'test-platform'
    await first.saveCreds()
    await first.state.keys.set({
      session: {
        'user.0': Uint8Array.from([1, 2, 3, 4])
      }
    })

    const second = store.load()
    const keys = await second.state.keys.get('session', ['user.0', 'missing'])
    assert.equal(second.state.creds.platform, 'test-platform')
    assert.deepEqual(Array.from(keys['user.0']), [1, 2, 3, 4])
    assert.equal(keys.missing, undefined)

    store.clear()
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM whatsapp_auth').get().count, 0)
    db.close()
  })
})
