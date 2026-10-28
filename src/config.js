/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import path from 'node:path'
import { z } from 'zod'

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform(value => value === 'true')

const boolTrue = z
  .enum(['true', 'false'])
  .default('true')
  .transform(value => value === 'true')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  ADMIN_API_KEY: z.string().min(32),
  API_KEY_PEPPER: z.string().min(32),
  DATABASE_PATH: z.string().trim().default('./data/baileys.sqlite'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  BAILEYS_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('warn'),
  LOG_FILE: z.string().trim().default('./logs/app.log'),
  LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  CORS_ORIGINS: z.string().default('*'),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  ADMIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  MAX_MEDIA_BYTES: z.coerce.number().int().min(1024).max(100 * 1024 * 1024).default(25 * 1024 * 1024),
  ALLOW_REMOTE_MEDIA: bool,
  REMOTE_MEDIA_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  QR_WAIT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  QR_TTL_MS: z.coerce.number().int().min(30000).max(180000).default(60000),
  RECONNECT_MAX_DELAY_MS: z.coerce.number().int().min(5000).max(300000).default(60000),
  CHECK_RECIPIENT_EXISTS: boolTrue,
  MESSAGE_DELAY_MIN_MS: z.coerce.number().int().min(0).max(60000).default(5000),
  MESSAGE_DELAY_MAX_MS: z.coerce.number().int().min(0).max(120000).default(9000),
  TYPING_SIMULATION: boolTrue,
  BURST_SIZE: z.coerce.number().int().min(0).max(1000).default(20),
  BURST_PAUSE_MIN_MS: z.coerce.number().int().min(0).max(600000).default(30000),
  BURST_PAUSE_MAX_MS: z.coerce.number().int().min(0).max(900000).default(60000),
  DAILY_SEND_LIMIT: z.coerce.number().int().min(0).max(100000).default(500),
  PUBLIC_DOMAIN: z.string().trim().default(''),
  PUBLIC_IP: z.string().trim().default('')
})

export const loadConfig = (env = process.env) => {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const details = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid environment configuration: ${details}`)
  }

  const cfg = parsed.data
  return {
    env: cfg.NODE_ENV,
    isProduction: cfg.NODE_ENV === 'production',
    host: cfg.HOST,
    port: cfg.PORT,
    trustProxy: cfg.TRUST_PROXY,
    adminApiKey: cfg.ADMIN_API_KEY,
    apiKeyPepper: cfg.API_KEY_PEPPER,
    databasePath: path.resolve(cfg.DATABASE_PATH),
    logLevel: cfg.LOG_LEVEL,
    baileysLogLevel: cfg.BAILEYS_LOG_LEVEL,
    logFile: path.resolve(cfg.LOG_FILE),
    logRetentionDays: cfg.LOG_RETENTION_DAYS,
    // empty = wide open (*) so installs that blanked the var still work from any origin
    corsOrigins: (cfg.CORS_ORIGINS.trim() || '*').split(',').map(value => value.trim()).filter(Boolean),
    apiRateLimitWindowMs: cfg.API_RATE_LIMIT_WINDOW_MS,
    apiRateLimitMax: cfg.API_RATE_LIMIT_MAX,
    adminRateLimitMax: cfg.ADMIN_RATE_LIMIT_MAX,
    maxMediaBytes: cfg.MAX_MEDIA_BYTES,
    allowRemoteMedia: cfg.ALLOW_REMOTE_MEDIA,
    remoteMediaTimeoutMs: cfg.REMOTE_MEDIA_TIMEOUT_MS,
    qrWaitMs: cfg.QR_WAIT_MS,
    qrTtlMs: cfg.QR_TTL_MS,
    reconnectMaxDelayMs: cfg.RECONNECT_MAX_DELAY_MS,
    checkRecipientExists: cfg.CHECK_RECIPIENT_EXISTS,
    messageDelayMinMs: cfg.MESSAGE_DELAY_MIN_MS,
    messageDelayMaxMs: Math.max(cfg.MESSAGE_DELAY_MAX_MS, cfg.MESSAGE_DELAY_MIN_MS), // max never below min
    typingSimulation: cfg.TYPING_SIMULATION,
    burstSize: cfg.BURST_SIZE,
    burstPauseMinMs: cfg.BURST_PAUSE_MIN_MS,
    burstPauseMaxMs: Math.max(cfg.BURST_PAUSE_MAX_MS, cfg.BURST_PAUSE_MIN_MS),
    dailySendLimit: cfg.DAILY_SEND_LIMIT,
    publicDomain: cfg.PUBLIC_DOMAIN || null,
    publicIp: cfg.PUBLIC_IP || null
  }
}
