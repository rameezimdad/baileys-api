/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/errors.js'
import { ok } from '../utils/response.js'
import { loadMedia } from '../utils/media.js'

const recipient = z.string().trim().min(8).max(80)
const optionalText = max => z.string().trim().max(max).optional().default('')
const boolFromForm = z.preprocess(value => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  return false
}, z.boolean())

const textSchema = z.object({
  to: recipient,
  message: z.string().trim().min(1).max(4096)
})

const imageSchema = z.object({
  to: recipient,
  url: z.url().optional(),
  caption: optionalText(1024),
  fileName: z.string().trim().max(120).optional()
})

const documentSchema = z.object({
  to: recipient,
  url: z.url().optional(),
  caption: optionalText(1024),
  fileName: z.string().trim().max(120).optional()
})

const audioSchema = z.object({
  to: recipient,
  url: z.url().optional(),
  fileName: z.string().trim().max(120).optional(),
  ptt: boolFromForm.optional().default(false)
})

const locationSchema = z.object({
  to: recipient,
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  name: optionalText(200),
  address: optionalText(500)
})

export const createMessagingRouter = (service, cfg) => {
  const router = Router()
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: cfg.maxMediaBytes, files: 1, fields: 10 }
  })

  router.post('/send-message', validate(textSchema), asyncHandler(async (req, res) => {
    const { to, message } = req.body
    const result = await service.send({
      to,
      type: 'text',
      content: { text: message },
      payload: { text: message },
      apiKeyId: req.apiKey.id
    })
    ok(res, result, 201)
  }))

  router.post('/send-image', upload.single('file'), validate(imageSchema), asyncHandler(async (req, res) => {
    const { to, url, caption, fileName } = req.body
    const media = await loadMedia({ file: req.file, url, fileName, kind: 'image', cfg })
    const result = await service.send({
      to,
      type: 'image',
      content: { image: media.buffer, mimetype: media.mimetype, caption },
      payload: { caption, fileName: media.fileName, mimetype: media.mimetype, size: media.size },
      apiKeyId: req.apiKey.id
    })
    ok(res, result, 201)
  }))

  router.post('/send-document', upload.single('file'), validate(documentSchema), asyncHandler(async (req, res) => {
    const { to, url, caption, fileName } = req.body
    const media = await loadMedia({ file: req.file, url, fileName, kind: 'document', cfg })
    const result = await service.send({
      to,
      type: 'document',
      content: { document: media.buffer, mimetype: media.mimetype, fileName: media.fileName, caption },
      payload: { caption, fileName: media.fileName, mimetype: media.mimetype, size: media.size },
      apiKeyId: req.apiKey.id
    })
    ok(res, result, 201)
  }))

  router.post('/send-audio', upload.single('file'), validate(audioSchema), asyncHandler(async (req, res) => {
    const { to, url, fileName, ptt } = req.body
    const media = await loadMedia({ file: req.file, url, fileName, kind: 'audio', cfg })
    const result = await service.send({
      to,
      type: 'audio',
      content: { audio: media.buffer, mimetype: media.mimetype, ptt },
      payload: { fileName: media.fileName, mimetype: media.mimetype, size: media.size, ptt },
      apiKeyId: req.apiKey.id
    })
    ok(res, result, 201)
  }))

  const STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed']
  router.get('/messages', asyncHandler(async (req, res) => {
    const status = STATUSES.includes(req.query.status) ? req.query.status : null
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
    const apiKeyId = req.apiKey.role === 'admin' ? null : req.apiKey.id // non-admin sees own only
    ok(res, {
      counts: service.messages.counts(apiKeyId),
      messages: service.messages.list({ status, apiKeyId, limit })
    })
  }))

  router.post('/send-location', validate(locationSchema), asyncHandler(async (req, res) => {
    const { to, latitude, longitude, name, address } = req.body
    const location = { degreesLatitude: latitude, degreesLongitude: longitude, name, address }
    const result = await service.send({
      to,
      type: 'location',
      content: { location },
      payload: { latitude, longitude, name, address },
      apiKeyId: req.apiKey.id
    })
    ok(res, result, 201)
  }))

  return router
}
