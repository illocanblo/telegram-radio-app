import { cfg, envReport } from '../lib/redis.js'

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end()
  }

  const { url } = req
  const pathname = url.split('?')[0]

  // Admin key verification endpoint
  if (pathname === '/api/verify-admin') {
    const params = new URLSearchParams(url.split('?')[1] || '')
    const key = params.get('k')
    const adminKey = process.env.ADMIN_KEY

    if (!adminKey) {
      return res.status(500).json({ valid: false, error: 'admin key not configured' })
    }

    return res.status(200).json({ valid: key === adminKey })
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