/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

const cleanContext = context => JSON.parse(JSON.stringify(context, (key, value) => {
  if (['apiKey', 'token', 'qr', 'key_hash', 'salt'].includes(key)) return '[REDACTED]'
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`
  return value
}))

export class LogService {
  constructor(db, logger) {
    this.logger = logger
    this.insert = db.prepare(`
      INSERT INTO logs (level, category, event, request_id, api_key_id, context_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    this.pruneStmt = db.prepare('DELETE FROM logs WHERE created_at < ?')
  }

  write(level, category, event, context = {}, meta = {}) {
    const clean = cleanContext(context)
    this.logger[level]?.({ category, event, ...clean }, event)

    try {
      this.insert.run(
        level,
        category,
        event,
        meta.requestId || null,
        meta.apiKeyId === 'bootstrap' ? null : meta.apiKeyId || null,
        JSON.stringify(clean),
        new Date().toISOString()
      )
    } catch (error) {
      this.logger.error({ err: error, category, event }, 'database log write failed')
    }
  }

  prune(days) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString()
    const result = this.pruneStmt.run(cutoff)
    if (result.changes) this.logger.info({ deleted: result.changes, cutoff }, 'expired database logs pruned')
    return result.changes
  }
}
