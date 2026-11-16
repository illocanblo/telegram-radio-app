/**
 * Сводка для владельца лейбла. Доступ только по ключу STATS_KEY.
 * Возвращает обезличенные агрегаты; персональных данных в ответе нет.
 *
 * ENV: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, STATS_KEY
 */

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = process.env.STATS_KEY

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function redis(commands) {
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  if (!r.ok) throw new Error(`storage ${r.status}`)
  return r.json()
}

function toObj(arr) {
  const out = {}
  if (!Array.isArray(arr)) return out
  for (let i = 0; i < arr.length; i += 2) out[arr[i]] = Number(arr[i + 1]) || 0
  return out
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
  if (!KEY) return res.status(503).json({ error: 'key_not_configured' })

  const given = req.headers['x-stats-key'] || req.query?.key || ''
  if (!safeEqual(String(given), String(KEY))) return res.status(401).json({ error: 'unauthorized' })
  if (!url || !token) return res.status(503).json({ error: 'storage_not_configured' })

  const n = Math.max(1, Math.min(Number(req.query?.days) || 30, 90))
  const days = []
  for (let i = n - 1; i >= 0; i--) {
    days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))
  }

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
    const raw = await redis(cmds)

    const series = []
    const totals = {}
    const albums = {}
    const tracks = {}
    const plat = {}
    const theme = {}
    const fmt = {}

    days.forEach((d, i) => {
      const base = i * 6
      const dayRow = toObj(raw[base]?.result)
      series.push({ day: d, ...dayRow })
      merge(totals, dayRow)
      merge(albums, toObj(raw[base + 1]?.result))
      merge(tracks, toObj(raw[base + 2]?.result))
      merge(plat, toObj(raw[base + 3]?.result))
      merge(theme, toObj(raw[base + 4]?.result))
      merge(fmt, toObj(raw[base + 5]?.result))
    })

    const topAlbums = Object.entries(albums).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([id, plays]) => ({ id, plays }))
    const topTracks = Object.entries(tracks).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([key, plays]) => {
      const [album, idx] = key.split('|')
      return { key, album, index: Number(idx), plays }
    })

    return res.status(200).json({ days: series, totals, topAlbums, topTracks, plat, theme, fmt, range: n })
  } catch {
    return res.status(502).json({ error: 'storage_unavailable' })
  }
}