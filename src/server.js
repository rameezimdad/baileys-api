/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import 'dotenv/config'
import { createServer } from 'node:http'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createDatabase } from './db/database.js'
import { createLogger } from './logger.js'
import { ApiKeyService } from './services/api-key-service.js'
import { SqliteAuthStore } from './services/auth-store.js'
import { LogService } from './services/log-service.js'
import { MessageRepository } from './services/message-repository.js'
import { WhatsAppService } from './services/whatsapp-service.js'

const cfg = loadConfig()
const logger = createLogger(cfg)
const db = createDatabase(cfg.databasePath)
const logs = new LogService(db, logger)
logs.prune(cfg.logRetentionDays)
const maintenanceTimer = setInterval(() => logs.prune(cfg.logRetentionDays), 86400000)
maintenanceTimer.unref()
const apiKeys = new ApiKeyService(db, cfg.apiKeyPepper, cfg.adminApiKey, logs)
const authStore = new SqliteAuthStore(db)
const messages = new MessageRepository(db)
const whatsapp = new WhatsAppService({ authStore, messages, logs, logger, cfg })
const app = createApp({ cfg, logger, logs, apiKeys, whatsapp })
const server = createServer(app)

server.requestTimeout = 30000
server.headersTimeout = 15000
server.keepAliveTimeout = 5000
server.maxRequestsPerSocket = 1000

server.listen(cfg.port, cfg.host, () => {
  logs.write('info', 'system', 'API server started', { host: cfg.host, port: cfg.port, env: cfg.env })
  whatsapp.start().catch(error => {
    logs.write('error', 'whatsapp', 'initial connection failed', { error: error.message })
  })
})

let shuttingDown = false
const shutdown = async signal => {
  if (shuttingDown) return
  shuttingDown = true
  logs.write('info', 'system', 'server shutdown started', { signal })

  const forceExit = setTimeout(() => {
    logger.fatal('forced shutdown after timeout')
    process.exit(1)
  }, 15000)
  forceExit.unref()

  server.closeIdleConnections() // keep-alive sockets would stall close()
  server.close(async error => {
    if (error) logger.error({ err: error }, 'HTTP server close failed')
    clearInterval(maintenanceTimer)
    await whatsapp.stop().catch(stopError => logger.error({ err: stopError }, 'WhatsApp shutdown failed'))
    db.close()
    logger.info('server shutdown complete')
    logger.flush()
    clearTimeout(forceExit)
    process.exit(error ? 1 : 0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('uncaughtException', error => {
  logger.fatal({ err: error }, 'uncaught exception')
  shutdown('uncaughtException')
})
process.on('unhandledRejection', error => {
  logger.error({ err: error }, 'unhandled rejection')
})
