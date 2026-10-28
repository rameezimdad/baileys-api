/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import os from 'node:os'

const detectPublicIp = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(3000),
      headers: { 'user-agent': 'Rameez-Baileys-API/1.0' }
    })
    if (response.ok) {
      const { ip } = await response.json()
      if (ip) return ip
    }
  } catch { /* offline; use interface address */ }

  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) return item.address
    }
  }
  return null
}

let pending = null

export const getPublicIp = () => {
  if (!pending) {
    pending = detectPublicIp().then(ip => {
      if (!ip) pending = null // retry next call
      return ip
    }).catch(() => {
      pending = null
      return null
    })
  }
  return pending
}
