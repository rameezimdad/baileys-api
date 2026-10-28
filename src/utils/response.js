/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

export const ok = (res, data, status = 200) => res.status(status).json({
  success: true,
  data,
  error: '',
  code: ''
})

export const fail = (res, status, code, error, details) => res.status(status).json({
  success: false,
  data: {},
  error,
  code,
  ...(details ? { details } : {})
})
