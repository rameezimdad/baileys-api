/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import { AppError } from './errors.js'

const JID_RE = /^[0-9]{5,20}@(s\.whatsapp\.net|g\.us)$/

export const normalizeRecipient = value => {
  const input = String(value || '').trim()
  if (JID_RE.test(input)) return input

  const digits = input.replace(/\D/g, '')
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) {
    throw new AppError(400, 'RECIPIENT_INVALID', 'Recipient must include the country code and contain 8 to 15 digits')
  }
  return `${digits}@s.whatsapp.net`
}
