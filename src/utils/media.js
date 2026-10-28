/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923435347417 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

import dns from 'node:dns/promises'
import net from 'node:net'
import path from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
import { AppError } from './errors.js'

const mimeByExtension = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.zip': 'application/zip'
}

const allowed = {
  image: new Set(['image/jpeg', 'image/png', 'image/webp']),
  audio: new Set(['audio/aac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm']),
  document: new Set(Object.values(mimeByExtension))
}

const privateIpv4 = ip => {
  const parts = ip.split('.').map(Number)
  const [a, b] = parts
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
}

const isPrivateIp = ip => {
  if (net.isIPv4(ip)) return privateIpv4(ip)
  if (!net.isIPv6(ip)) return true
  const value = ip.toLowerCase()
  if (value.startsWith('::ffff:')) return privateIpv4(value.slice(7))
  return value === '::1' ||
    value === '::' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe8') ||
    value.startsWith('fe9') ||
    value.startsWith('fea') ||
    value.startsWith('feb')
}

const assertPublicUrl = async value => {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new AppError(400, 'MEDIA_URL_INVALID', 'Media URL is invalid')
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new AppError(400, 'MEDIA_URL_INVALID', 'Media URL must use HTTP or HTTPS without embedded credentials')
  }
  if ((url.port && !['80', '443'].includes(url.port)) || /(^|\.)localhost$|\.local$|\.internal$/i.test(url.hostname)) {
    throw new AppError(400, 'MEDIA_URL_BLOCKED', 'Media URL host is not allowed')
  }

  const addresses = await dns.lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some(item => isPrivateIp(item.address))) {
    throw new AppError(400, 'MEDIA_URL_BLOCKED', 'Media URL resolves to a private or reserved address')
  }
  return url
}

const readBounded = async (body, maxBytes) => {
  const chunks = []
  let size = 0
  for await (const chunk of body) {
    size += chunk.length
    if (size > maxBytes) throw new AppError(413, 'MEDIA_TOO_LARGE', `Media exceeds ${maxBytes} bytes`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const fetchRemote = async (value, cfg) => {
  let url = await assertPublicUrl(value)
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(cfg.remoteMediaTimeoutMs),
      headers: { 'user-agent': 'Rameez-Baileys-API/1.0' }
    })

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location || redirects === 3) throw new AppError(400, 'MEDIA_REDIRECT_INVALID', 'Media URL has invalid redirects')
      url = await assertPublicUrl(new URL(location, url).toString())
      continue
    }
    if (!response.ok || !response.body) throw new AppError(400, 'MEDIA_FETCH_FAILED', `Media download failed with HTTP ${response.status}`)

    const length = Number(response.headers.get('content-length') || 0)
    if (length > cfg.maxMediaBytes) throw new AppError(413, 'MEDIA_TOO_LARGE', `Media exceeds ${cfg.maxMediaBytes} bytes`)
    return {
      buffer: await readBounded(response.body, cfg.maxMediaBytes),
      declaredMime: response.headers.get('content-type')?.split(';')[0]?.toLowerCase(),
      fileName: path.basename(decodeURIComponent(url.pathname)) || 'media'
    }
  }
  throw new AppError(400, 'MEDIA_FETCH_FAILED', 'Media download failed')
}

export const sanitizeFileName = value => {
  const name = path.basename(String(value || 'document'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^A-Za-z0-9._ ()-]/g, '_')
    .slice(0, 120)
  return name || 'document'
}

export const loadMedia = async ({ file, url, fileName, kind, cfg }) => {
  if (!file && !url) throw new AppError(400, 'MEDIA_REQUIRED', 'Provide multipart field "file" or a media URL')
  if (file && url) throw new AppError(400, 'MEDIA_CONFLICT', 'Provide either a file or URL, not both')
  if (url && !cfg.allowRemoteMedia) {
    throw new AppError(400, 'REMOTE_MEDIA_DISABLED', 'Remote media is disabled; upload a multipart file')
  }

  const source = file
    ? { buffer: file.buffer, declaredMime: file.mimetype?.toLowerCase(), fileName: file.originalname }
    : await fetchRemote(url, cfg)
  const safeName = sanitizeFileName(fileName || source.fileName)
  const extension = path.extname(safeName).toLowerCase()
  const extMime = mimeByExtension[extension]
  const detected = await fileTypeFromBuffer(source.buffer).catch(() => null)
  let mime = detected?.mime || source.declaredMime

  if (kind === 'document' && extMime) {
    const legacyOffice = ['.doc', '.xls', '.ppt'].includes(extension) && detected?.mime === 'application/x-cfb'
    const openXml = ['.docx', '.xlsx', '.pptx'].includes(extension) && detected?.mime === 'application/zip'
    if (!detected || detected.mime === extMime || legacyOffice || openXml) mime = extMime
  }

  if (!mime || !allowed[kind]?.has(mime)) {
    throw new AppError(415, 'MEDIA_TYPE_UNSUPPORTED', `Unsupported ${kind} media type`)
  }

  return { buffer: source.buffer, mimetype: mime, fileName: safeName, size: source.buffer.length }
}
