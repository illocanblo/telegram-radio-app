import { cfg, envReport } from '../lib/redis.js'

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  const { url } = req
  const pathname = url.split('?')[0]

  // Admin key verification endpoint
  if (pathname === '/api/verify-admin') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).end()
    }
    const key = String(req.headers['x-admin-key'] || req.body?.key || '')
    const adminKey = process.env.ADMIN_KEY

    if (!adminKey) {
      return res.status(500).json({ valid: false, error: 'admin key not configured' })
    }

    return res.status(200).json({ valid: key === adminKey })
  }

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