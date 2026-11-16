/**
 * Приём обезличенной агрегированной телеметрии.
 * IP и User-Agent не читаются и не сохраняются, cookies не выставляются.
 * Пустой payload — проверка здоровья, ничего не записывает.
 */

import { cfg, pipeline, errorPayload } from '../lib/redis.js'

const EV = ['open', 'album', 'play', 'pause', 'complete', 'skip', 'seek', 'radio', 'search', 'filter', 'fav_add', 'fav_remove', 'q_remove', 'q_reorder', 'shuffle', 'repeat', 'error']
const PLAT = ['ios', 'android', 'desktop', 'web', 'other']
const THEME = ['dark', 'light']
const FMT = ['MP3', 'M4A', 'AAC', 'OGG', 'OPUS', 'FLAC', 'SHN', 'OTHER']

const ID_RE = /^[A-Za-z0-9._-]{1,120}$/
const TRACK_RE = /^[A-Za-z0-9._-]{1,120}\|\d{1,3}$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const NONCE_RE = /^[a-f0-9]{24}$/
const TTL = 60 * 60 * 24 * 120

function int(v, max) {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(Math.floor(n), max)
}

function pickMap(raw, allow, maxKeys, maxVal) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  let n = 0
  for (const [k, v] of Object.entries(raw)) {
    if (!allow.includes(k)) continue
    const val = int(v, maxVal)
    if (val > 0) out[k] = val
    if (++n >= maxKeys) break
  }
  return out
}

function pickKeyed(raw, re, maxKeys, maxVal) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  let n = 0
  for (const [k, v] of Object.entries(raw)) {
    if (!re.test(k)) continue
    const val = int(v, maxVal)
    if (val > 0) out[k] = val
    if (++n >= maxKeys) break
  }
  return out
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }

  const origin = req.headers.origin
  const host = req.headers['x-forwarded-host'] || req.headers.host
  if (origin) {
    try { if (new URL(origin).host !== host) return res.status(403).end() } catch { return res.status(403).end() }
  }

  const c = cfg()
  if (!c.url || !c.token) return res.status(503).json({ error: 'storage_not_configured' })
  if (!c.enabled) return res.status(403).json({ error: 'telemetry_disabled' })

  let body = req.body
  if (typeof body === 'string') {
    if (body.length > 20000) return res.status(413).end()
    try { body = JSON.parse(body) } catch { return res.status(400).end() }
  }
  if (!body || typeof body !== 'object' || body.v !== 1) return res.status(400).end()

  const day = DAY_RE.test(body.day) ? body.day : new Date().toISOString().slice(0, 10)
  const nc = NONCE_RE.test(body.nonce || '') ? body.nonce : null
  if (!nc) return res.status(400).end()

  const ev = pickMap(body.ev, EV, EV.length, 100000)
  const plat = pickMap(body.plat, PLAT, PLAT.length, 1000)
  const theme = pickMap(body.theme, THEME, THEME.length, 1000)
  const fmt = pickMap(body.fmt, FMT, FMT.length, 100000)
  const albums = pickKeyed(body.albums, ID_RE, 60, 10000)
  const tracks = pickKeyed(body.tracks, TRACK_RE, 120, 10000)
  const sessions = int(body.sessions, 10)
  const listenSec = int(body.listenSec, 86400)

  const total = sessions + listenSec + Object.keys(ev).length + Object.keys(albums).length + Object.keys(tracks).length
  if (!total) return res.status(204).end()

  try {
    const lock = await pipeline([['SET', `nr:n:${nc}`, '1', 'NX', 'EX', '86400']])
    if (!lock?.[0]?.result) return res.status(204).end()

    const dKey = `nr:d:${day}`
    const cmds = []
    if (sessions) cmds.push(['HINCRBY', dKey, 'sessions', sessions])
    if (listenSec) cmds.push(['HINCRBY', dKey, 'listenSec', listenSec])
    for (const [k, v] of Object.entries(ev)) cmds.push(['HINCRBY', dKey, k, v])
    for (const [k, v] of Object.entries(albums)) cmds.push(['HINCRBY', `nr:a:${day}`, k, v])
    for (const [k, v] of Object.entries(tracks)) cmds.push(['HINCRBY', `nr:t:${day}`, k, v])
    for (const [k, v] of Object.entries(plat)) cmds.push(['HINCRBY', `nr:p:${day}`, k, v])
    for (const [k, v] of Object.entries(theme)) cmds.push(['HINCRBY', `nr:h:${day}`, k, v])
    for (const [k, v] of Object.entries(fmt)) cmds.push(['HINCRBY', `nr:f:${day}`, k, v])

    const touched = new Set([dKey])
    if (Object.keys(albums).length) touched.add(`nr:a:${day}`)
    if (Object.keys(tracks).length) touched.add(`nr:t:${day}`)
    if (Object.keys(plat).length) touched.add(`nr:p:${day}`)
    if (Object.keys(theme).length) touched.add(`nr:h:${day}`)
    if (Object.keys(fmt).length) touched.add(`nr:f:${day}`)
    touched.forEach((k) => cmds.push(['EXPIRE', k, TTL]))

    await pipeline(cmds)
    return res.status(204).end()
  } catch (e) {
    return res.status(502).json(errorPayload(e))
  }
}