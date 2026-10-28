/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import fs from 'node:fs'
import path from 'node:path'
import pino from 'pino'

const redact = {
  paths: [
    'req.headers.x-api-key',
    'req.headers.authorization',
    'headers.x-api-key',
    'headers.authorization',
    '*.apiKey',
    '*.token',
    '*.qr'
  ],
  censor: '[REDACTED]'
}

export const createLogger = cfg => {
  fs.mkdirSync(path.dirname(cfg.logFile), { recursive: true })
  const streams = [{ level: cfg.logLevel, stream: pino.destination({ dest: cfg.logFile, mkdir: true, sync: false }) }]

  if (!cfg.isProduction) {
    streams.push({
      level: cfg.logLevel,
      stream: pino.transport({ target: 'pino-pretty', options: { colorize: true, singleLine: true } })
    })
  }

  return pino({ level: cfg.logLevel, redact, base: { service: 'baileys-api' } }, pino.multistream(streams))
}
