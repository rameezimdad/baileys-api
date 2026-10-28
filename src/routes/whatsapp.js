/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import { Router } from 'express'
import QRCode from 'qrcode'
import { requireAdmin } from '../middleware/auth.js'
import { AppError, asyncHandler } from '../utils/errors.js'
import { ok } from '../utils/response.js'

export const createWhatsAppRouter = service => {
  const router = Router()

  router.get('/qr', asyncHandler(async (req, res) => {
    if (service.getStatus().connected) throw new AppError(409, 'ALREADY_CONNECTED', 'WhatsApp is already connected')
    const qr = await service.waitForQr()
    if (!qr) throw new AppError(503, 'QR_NOT_READY', 'QR code is not ready; retry shortly')

    if (req.query.format === 'png') {
      const png = await QRCode.toBuffer(qr.qr, { width: 420, margin: 2, errorCorrectionLevel: 'M' })
      res.set({ 'content-type': 'image/png', 'cache-control': 'no-store', pragma: 'no-cache' })
      return res.send(png)
    }

    const dataUrl = await QRCode.toDataURL(qr.qr, { width: 420, margin: 2, errorCorrectionLevel: 'M' })
    res.set({ 'cache-control': 'no-store', pragma: 'no-cache' })
    ok(res, { dataUrl, expiresAt: qr.expiresAt })
  }))

  router.get('/status', (req, res) => ok(res, service.getStatus()))
  router.post('/logout', requireAdmin, asyncHandler(async (req, res) => {
    ok(res, await service.logout())
  }))

  return router
}
