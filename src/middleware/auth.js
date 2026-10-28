/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import { AppError } from '../utils/errors.js'

const extractKey = req => {
  const header = req.get('x-api-key')
  if (header) return header.trim()
  const authorization = req.get('authorization') || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

export const apiKeyAuth = service => (req, res, next) => {
  try {
    req.apiKey = service.authenticate(extractKey(req))
    next()
  } catch (error) {
    next(error)
  }
}

export const requireAdmin = (req, res, next) => {
  if (req.apiKey?.role !== 'admin') {
    return next(new AppError(403, 'ADMIN_REQUIRED', 'An admin API key is required'))
  }
  next()
}
