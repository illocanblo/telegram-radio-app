/**
 * Сводка для владельца. Доступ по STATS_KEY.
 * Ответ содержит только обезличенные агрегаты.
 */

import { cfg, pipelineChunked, hashToObject, errorPayload } from '../lib/redis.js'

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function merge(target, src) {
  for (const [k, v] of Object.entries(src)) target[k] = (target[k] || 0) + v
  return target
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end()
  }

  const c = cfg()
  if (!c.key) return res.status(503).json({ error: 'key_not_configured', detail: 'В Vercel не задана переменная STATS_KEY' })

  const given = String(req.headers['x-stats-key'] || req.query?.key || '').trim()
  if (!safeEqual(given, c.key)) {
    return res.status(401).json({ error: 'unauthorized', detail: `Длина введённого ключа ${given.length}, ожидаемая ${c.key.length}` })
  }
  if (!c.url || !c.token) return res.status(503).json({ error: 'storage_not_configured', detail: 'Нет UPSTASH_REDIS_REST_URL или UPSTASH_REDIS_REST_TOKEN' })

  const n = Math.max(1, Math.min(Number(req.query?.days) || 30, 90))
  const days = []
  for (let i = n - 1; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))

  try {
    const cmds = []
    days.forEach((d) => {
      cmds.push(['HGETALL', `nr:d:${d}`])
      cmds.push(['HGETALL', `nr:a:${d}`])
      cmds.push(['HGETALL', `nr:t:${d}`])
      cmds.push(['HGETALL', `nr:p:${d}`])
      cmds.push(['HGETALL', `nr:h:${d}`])
      cmds.push(['HGETALL', `nr:f:${d}`])
    })
    const raw = await pipelineChunked(cmds, 60)

    const series = []
    const totals = {}
    const albums = {}
    const tracks = {}
    const plat = {}
    const theme = {}
    const fmt = {}

    days.forEach((d, i) => {
      const b = i * 6
      const dayRow = hashToObject(raw[b]?.result)
      series.push({ day: d, ...dayRow })
      merge(totals, dayRow)
      merge(albums, hashToObject(raw[b + 1]?.result))
      merge(tracks, hashToObject(raw[b + 2]?.result))
      merge(plat, hashToObject(raw[b + 3]?.result))
      merge(theme, hashToObject(raw[b + 4]?.result))
      merge(fmt, hashToObject(raw[b + 5]?.result))
    })

    const topAlbums = Object.entries(albums).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([id, plays]) => ({ id, plays }))
    const topTracks = Object.entries(tracks).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([key, plays]) => {
      const [album, idx] = key.split('|')
      return { key, album, index: Number(idx), plays }
    })

    return res.status(200).json({ days: series, totals, topAlbums, topTracks, plat, theme, fmt, range: n })
  } catch (e) {
    return res.status(502).json(errorPayload(e))
  }
}