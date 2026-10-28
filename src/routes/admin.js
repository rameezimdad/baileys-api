/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/errors.js'
import { ok } from '../utils/response.js'

const generateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  role: z.enum(['admin', 'api']).default('api'),
  expiresAt: z.iso.datetime().nullable().optional()
}).refine(value => !value.expiresAt || Date.parse(value.expiresAt) > Date.now(), {
  message: 'expiresAt must be in the future',
  path: ['expiresAt']
})

const revokeSchema = z.object({
  id: z.string().trim().min(1).max(100)
})

export const createAdminRouter = service => {
  const router = Router()
  router.use(requireAdmin)

  router.post('/generate-key', validate(generateSchema), asyncHandler(async (req, res) => {
    ok(res, service.create(req.body), 201)
  }))

  router.post('/revoke-key', validate(revokeSchema), asyncHandler(async (req, res) => {
    ok(res, service.revoke(req.body.id))
  }))

  router.get('/list-keys', asyncHandler(async (req, res) => {
    ok(res, { keys: service.list() })
  }))

  return router
}
