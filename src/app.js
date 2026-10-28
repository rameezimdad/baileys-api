/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import { apiKeyAuth } from './middleware/auth.js'
import { errorHandler, notFound } from './middleware/error-handler.js'
import { createAdminRouter } from './routes/admin.js'
import { createMessagingRouter } from './routes/messaging.js'
import { createWhatsAppRouter } from './routes/whatsapp.js'
import { asyncHandler } from './utils/errors.js'
import { fail, ok } from './utils/response.js'
import { getPublicIp } from './utils/server-info.js'

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

// dashboard polling endpoints get their own generous limiter
const MONITOR_PATHS = new Set(['/status', '/qr', '/me', '/server-info'])
const isMonitor = req => req.method === 'GET' && MONITOR_PATHS.has(req.path)

const limiter = ({ windowMs, limit, keyGenerator, skip }) => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ...(keyGenerator ? { keyGenerator } : {}),
  ...(skip ? { skip } : {}),
  handler: (req, res) => {
    res.set('retry-after', String(Math.ceil(windowMs / 1000)))
    fail(res, 429, 'RATE_LIMITED', 'Too many requests; retry later')
  }
})

export const createApp = ({ cfg, logger, logs, apiKeys, whatsapp }) => {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', cfg.trustProxy)

  app.use((req, res, next) => {
    req.id = req.get('x-request-id')?.slice(0, 100) || randomUUID()
    req.startAt = process.hrtime.bigint()
    res.set('x-request-id', req.id)
    next()
  })
  app.use(pinoHttp({
    logger,
    genReqId: req => req.id,
    customLogLevel: (req, res, error) => error || res.statusCode >= 500
      ? 'error'
      : res.statusCode >= 400 ? 'warn' : 'info'
  }))
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }))
  app.use((req, res, next) => {
    // API-key auth is the real guard, so CORS is wide-open by default (CORS_ORIGINS=*):
    // works from any website, app, localhost or file:// page. Server-side callers
    // (Apps Script UrlFetchApp, curl, backends) send no Origin and bypass CORS entirely.
    const origin = req.get('origin')
    const allowAll = cfg.corsOrigins.includes('*')
    let sameOrigin = false
    try { sameOrigin = Boolean(origin) && new URL(origin).host === req.get('host') } catch { /* malformed origin */ }
    cors({
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      // reflect whatever headers the client asks for so any app works; fall back to the known set
      allowedHeaders: req.get('access-control-request-headers')?.split(',').map(value => value.trim()) || ['content-type', 'x-api-key', 'authorization', 'x-request-id'],
      origin: (value, callback) => {
        if (!value || allowAll || sameOrigin || cfg.corsOrigins.includes(value)) return callback(null, true)
        callback(new Error('CORS_ORIGIN_DENIED'))
      }
    })(req, res, next)
  })
  app.use(express.json({ limit: '1mb', strict: true }))
  app.use(express.urlencoded({ extended: false, limit: '100kb' }))

  app.use((req, res, next) => {
    res.set('cache-control', 'no-store')
    res.on('finish', () => {
      logs.write(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'http', 'request completed', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(Number(process.hrtime.bigint() - req.startAt) / 1e6)
      }, { requestId: req.id, apiKeyId: req.apiKey?.id })
    })
    next()
  })

  app.use(express.static(publicDir, {
    etag: true,
    maxAge: cfg.isProduction ? '1h' : 0,
    index: 'index.html'
  }))
  app.get('/healthz', (req, res) => ok(res, { status: 'ok', whatsapp: whatsapp.getStatus().status }))

  app.use('/api', limiter({
    windowMs: cfg.apiRateLimitWindowMs,
    limit: cfg.apiRateLimitMax * 10,
    skip: req => !isMonitor(req)
  }))
  app.use('/api', limiter({
    windowMs: cfg.apiRateLimitWindowMs,
    limit: cfg.apiRateLimitMax * 3,
    skip: isMonitor
  }))
  app.use('/api', apiKeyAuth(apiKeys))
  app.use('/api', limiter({
    windowMs: cfg.apiRateLimitWindowMs,
    limit: cfg.apiRateLimitMax,
    keyGenerator: req => req.apiKey.id,
    skip: isMonitor
  }))
  app.use('/api/admin', limiter({
    windowMs: cfg.apiRateLimitWindowMs,
    limit: cfg.adminRateLimitMax,
    keyGenerator: req => req.apiKey.id
  }))

  app.get('/api/me', (req, res) => ok(res, {
    id: req.apiKey.id,
    name: req.apiKey.name,
    role: req.apiKey.role,
    prefix: req.apiKey.prefix,
    expiresAt: req.apiKey.expiresAt || null
  }))
  app.get('/api/server-info', asyncHandler(async (req, res) => ok(res, {
    domain: cfg.publicDomain || null,
    ip: cfg.publicIp || await getPublicIp(),
    port: cfg.port || null
  })))
  app.use('/api/admin', createAdminRouter(apiKeys))
  app.use('/api', createWhatsAppRouter(whatsapp))
  app.use('/api', createMessagingRouter(whatsapp, cfg))
  app.use(notFound)
  app.use(errorHandler(logs))
  return app
}
