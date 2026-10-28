/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { AppError } from '../utils/errors.js'

const PREFIX_RE = /^wapi_([a-f0-9]{16})_([A-Za-z0-9_-]{43})$/

const safeEqual = (left, right) => {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export class ApiKeyService {
  constructor(db, pepper, bootstrapKey, logs) {
    this.db = db
    this.pepper = pepper
    this.bootstrapKey = bootstrapKey
    this.logs = logs
    this.findByPrefix = db.prepare(`
      SELECT id, name, key_prefix, key_hash, salt, role, created_at, last_used_at, expires_at, revoked_at
      FROM api_keys WHERE key_prefix = ?
    `)
    this.insert = db.prepare(`
      INSERT INTO api_keys (id, name, key_prefix, key_hash, salt, role, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    this.touch = db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?')
    this.revokeStmt = db.prepare(`
      UPDATE api_keys SET revoked_at = ?
      WHERE (id = ? OR key_prefix = ?) AND revoked_at IS NULL
    `)
    this.listStmt = db.prepare(`
      SELECT id, name, key_prefix AS prefix, role, created_at, last_used_at, expires_at, revoked_at
      FROM api_keys ORDER BY created_at DESC
    `)
  }

  hash(secret, salt) {
    return createHmac('sha256', this.pepper).update(`${salt}:${secret}`).digest('hex')
  }

  create({ name, role, expiresAt = null }) {
    const id = randomUUID()
    const prefix = randomBytes(8).toString('hex')
    const secret = randomBytes(32).toString('base64url')
    const salt = randomBytes(16).toString('hex')
    const key = `wapi_${prefix}_${secret}`
    const createdAt = new Date().toISOString()
    const expiry = expiresAt ? new Date(expiresAt).toISOString() : null

    this.insert.run(id, name, prefix, this.hash(secret, salt), salt, role, createdAt, expiry)
    this.logs.write('info', 'auth', 'api key generated', { id, name, role, prefix, expiresAt: expiry })
    return { id, name, role, prefix, apiKey: key, createdAt, expiresAt: expiry }
  }

  authenticate(key) {
    if (!key) throw new AppError(401, 'AUTH_REQUIRED', 'A valid API key is required')
    if (safeEqual(key, this.bootstrapKey)) {
      return { id: 'bootstrap', name: 'Environment bootstrap key', role: 'admin', prefix: 'bootstrap' }
    }

    const match = PREFIX_RE.exec(key)
    if (!match) throw new AppError(401, 'AUTH_INVALID', 'Invalid API key')

    const [, prefix, secret] = match
    const row = this.findByPrefix.get(prefix)
    if (!row || row.revoked_at || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) {
      throw new AppError(401, 'AUTH_INVALID', 'Invalid API key')
    }

    const hash = this.hash(secret, row.salt)
    if (!safeEqual(hash, row.key_hash)) throw new AppError(401, 'AUTH_INVALID', 'Invalid API key')

    this.touch.run(new Date().toISOString(), row.id)
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      prefix: row.key_prefix,
      expiresAt: row.expires_at
    }
  }

  revoke(idOrPrefix) {
    if (idOrPrefix === 'bootstrap') {
      throw new AppError(400, 'BOOTSTRAP_KEY_ENV', 'Rotate ADMIN_API_KEY in the environment to revoke it')
    }

    const result = this.revokeStmt.run(new Date().toISOString(), idOrPrefix, idOrPrefix)
    if (!result.changes) throw new AppError(404, 'KEY_NOT_FOUND', 'Active API key not found')
    this.logs.write('info', 'auth', 'api key revoked', { idOrPrefix })
    return { revoked: true, idOrPrefix }
  }

  list() {
    return this.listStmt.all()
  }
}
