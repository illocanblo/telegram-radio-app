import { cfg, envReport } from '../lib/redis.js'

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end()
  }

  const c = cfg()
  const r = envReport()

  return res.status(200).json({
    telemetry: c.enabled,
    storage: !!(c.url && c.token),
    summary: !!c.key,
    urlValid: r.urlValid,
  })
}