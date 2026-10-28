/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import { AppError } from '../utils/errors.js'

export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source])
  if (!result.success) {
    const details = result.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message
    }))
    return next(new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details))
  }
  req[source] = result.data
  next()
}
