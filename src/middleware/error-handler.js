/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import multer from 'multer'
import { AppError } from '../utils/errors.js'
import { fail } from '../utils/response.js'

export const notFound = (req, res) => fail(res, 404, 'ROUTE_NOT_FOUND', 'Route not found')

export const errorHandler = logs => (error, req, res, next) => {
  if (res.headersSent) return next(error)

  let err = error
  if (error instanceof multer.MulterError) {
    err = new AppError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'UPLOAD_ERROR', error.message)
  }
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    err = new AppError(408, 'REQUEST_TIMEOUT', 'The external media request timed out')
  }
  if (error.message === 'CORS_ORIGIN_DENIED') {
    err = new AppError(403, 'CORS_DENIED', 'Origin is not allowed')
  }

  const status = err.status || 500
  const code = err.code || 'INTERNAL_ERROR'
  // AppError messages are safe to show (e.g. 503 not-connected); mask only unexpected 5xx
  const message = err instanceof AppError || status < 500 ? err.message : 'Internal server error'
  logs.write(status >= 500 ? 'error' : 'warn', 'http', 'request failed', {
    method: req.method,
    path: req.originalUrl,
    status,
    code,
    error: err.message
  }, { requestId: req.id, apiKeyId: req.apiKey?.id })
  fail(res, status, code, message, err.details)
}
