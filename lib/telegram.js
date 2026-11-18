/**
 * Server-side helpers for the Telegram Bot API.
 * The token is never returned to the client and never logged.
 */

import { timingSafeEqual } from 'node:crypto'

const clean = (v) => {
  let s = String(v ?? '').trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1)
  return s.trim()
}

export const UPLOADER_EMAILS = ['nenormalizm@gmail.com', 'nenormalizmlab@gmail.com', 'sobrio21@yandex.ru']
export const PARAM_MAX = 64

export function tgCfg() {
  return {
    token: clean(process.env.BOT_TOKEN),
    secret: clean(process.env.TELEGRAM_WEBHOOK_SECRET),
    bot: clean(process.env.BOT_USERNAME).replace(/^@/, ''),
    app: clean(process.env.APP_SHORT_NAME),
    appUrl: clean(process.env.APP_URL).replace(/\/+$/, ''),
    ownerKey: clean(process.env.ADMIN_KEY) || clean(process.env.STATS_KEY),
  }
}

export function botReady() {
  const c = tgCfg()
  return !!(c.token && c.bot && c.appUrl)
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export const validWebhookSecret = (secret) => /^[A-Za-z0-9_-]{1,256}$/.test(secret)

export async function botApi(method, payload = {}) {
  const { token } = tgCfg()
  if (!token) throw new Error('BOT_TOKEN is not configured')
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(9000),
  })
  const j = await r.json().catch(() => null)
  if (!j?.ok) {
    const e = new Error(j?.description || `Bot API HTTP ${r.status}`)
    e.code = j?.error_code || r.status
    throw e
  }
  return j.result
}

/* ---------- links ---------- */
const b64url = (s) => Buffer.from(String(s), 'utf8').toString('base64url')

export function albumParam(id) {
  const p = 'a_' + b64url(id)
  return p.length <= PARAM_MAX ? p : null
}

export function deepLink(param) {
  const c = tgCfg()
  if (!c.bot) return ''
  const base = c.app ? `https://t.me/${c.bot}/${c.app}` : `https://t.me/${c.bot}`
  return param ? `${base}?startapp=${encodeURIComponent(param)}` : base
}

export function webLink(param) {
  const c = tgCfg()
  if (!c.appUrl) return ''
  return param ? `${c.appUrl}/?nr=${encodeURIComponent(param)}` : c.appUrl
}

export function webAppLink(param) {
  const link = webLink(param)
  if (!link) return ''
  const url = new URL(link)
  url.searchParams.set('tgFullscreen', '1')
  return url.toString()
}

export const linkFor = (param) => deepLink(param) || webLink(param)

export function albumLink(id) {
  const p = albumParam(id)
  return p ? linkFor(p) : webLink('a_' + b64url(id))
}

/* ---------- formatting ---------- */
export const coverUrl = (id) => `https://archive.org/services/img/${encodeURIComponent(id)}`
export const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])
export const asText = (v) => asArray(v).map((x) => String(x)).join(', ')

export function catalogOf(a) {
  const m = String(a?.title || '').match(/\[([^\]]+)\]/)
  return m ? m[1].trim() : String(a?.identifier || '').slice(0, 12)
}
export const stripCatalog = (t) => String(t || '').replace(/^\s*\[[^\]]*\]\s*/, '').trim()
export function yearOf(a) {
  const m = String(a?.date || a?.publicdate || '').match(/(\d{4})/)
  return m ? m[1] : ''
}
export const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* ---------- catalogue with in-instance memory cache ---------- */
let cache = { ts: 0, items: [] }

export async function catalog() {
  if (cache.items.length && Date.now() - cache.ts < 10 * 60 * 1000) return cache.items
  try {
    const or = UPLOADER_EMAILS.map((e) => `uploader:"${e}"`).join(' OR ')
    const p = new URLSearchParams()
    p.set('q', `(${or}) AND mediatype:"audio"`)
    ;['identifier', 'title', 'creator', 'date', 'publicdate', 'subject'].forEach((f) => p.append('fl[]', f))
    p.append('sort[]', 'publicdate desc')
    p.set('rows', '300')
    p.set('output', 'json')
    const r = await fetch(`https://archive.org/advancedsearch.php?${p.toString().replace(/\+/g, '%20')}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j = await r.json()
    const docs = j?.response?.docs
    if (!Array.isArray(docs)) throw new Error('bad payload')
    const items = docs.filter((d) => d && d.identifier).map((d) => ({ ...d, subject: asArray(d.subject) }))
    cache = { ts: Date.now(), items }
    return items
  } catch {
    return cache.items
  }
}

export function searchCatalog(items, query, limit = 8) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)
  if (!words.length) return items.slice(0, limit)
  return items.filter((a) => {
    const hay = [a.title, asText(a.creator), a.identifier, ...a.subject].filter(Boolean).join(' ').toLowerCase()
    return words.every((w) => hay.includes(w))
  }).slice(0, limit)
}

export function albumCardHtml(a) {
  const title = stripCatalog(a.title) || a.identifier
  const artist = asText(a.creator) || 'Various Artists'
  const meta = [catalogOf(a), yearOf(a)].filter(Boolean).join(' · ')
  return `<b>${escHtml(title)}</b>\n${escHtml(artist)}\n<i>${escHtml(meta)}</i>\n\n<a href="${escHtml(albumLink(a.identifier))}">Слушать в Telegram</a>`
}