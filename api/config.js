/**
 * Публичная проверка готовности телеметрии. Секретов не отдаёт.
 * Флаг читается на сервере, поэтому клиенту не нужен префикс VITE_
 * и не нужна пересборка после изменения TELEMETRY.
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end()
  }

  const raw = String(process.env.TELEMETRY ?? process.env.VITE_TELEMETRY ?? '').trim().toLowerCase()
  const on = raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes'

  return res.status(200).json({
    telemetry: on,
    storage: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    summary: !!process.env.STATS_KEY,
  })
}