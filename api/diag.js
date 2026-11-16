/**
 * Диагностика хранилища для владельца. Доступ по STATS_KEY.
 * Секретные значения не возвращаются — только форма, длина и текст ошибки.
 */

import { cfg, envReport, pipeline, errorPayload } from '../lib/redis.js'

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
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
  if (!safeEqual(given, c.key)) return res.status(401).json({ error: 'unauthorized', detail: 'Ключ не совпадает со STATS_KEY' })

  const report = envReport()
  const steps = []
  const add = (name, ok, detail) => steps.push({ name, ok, detail: detail || '' })

  add('Переменная REST URL', report.urlPresent, report.urlPresent ? report.urlHost : 'не задана')
  add('Формат REST URL', report.urlValid, report.urlValid ? 'https, адрес разобран' : 'нужен адрес вида https://xxx.upstash.io')
  add('Чистота URL', !report.urlHadQuotes && !report.urlHadSpace && !report.urlHadSlash,
    [report.urlHadQuotes && 'есть кавычки', report.urlHadSpace && 'есть пробелы', report.urlHadSlash && 'есть слэш на конце'].filter(Boolean).join(', ') || 'без лишних символов')
  add('Переменная токена', report.tokenPresent, report.tokenPresent ? `длина ${report.tokenLength}` : 'не задана')
  add('Чистота токена', !report.tokenHadQuotes && !report.tokenHadSpace,
    [report.tokenHadQuotes && 'есть кавычки', report.tokenHadSpace && 'есть пробелы или перевод строки'].filter(Boolean).join(', ') || 'без лишних символов')
  add('Флаг TELEMETRY', report.telemetryFlag, `значение «${report.flagValue}»`)

  if (!report.urlPresent || !report.tokenPresent || !report.urlValid) {
    return res.status(200).json({ ok: false, report, steps })
  }

  try {
    const ping = await pipeline([['PING']])
    add('PING к Upstash', String(ping?.[0]?.result) === 'PONG', String(ping?.[0]?.result ?? ''))
  } catch (e) {
    const p = errorPayload(e)
    add('PING к Upstash', false, `${p.error}${p.status ? ` HTTP ${p.status}` : ''} — ${p.detail}`)
    return res.status(200).json({ ok: false, report, steps })
  }

  const probeKey = `nr:diag:${Math.random().toString(16).slice(2, 12)}`
  try {
    const w = await pipeline([['SET', probeKey, '1', 'EX', '60'], ['GET', probeKey], ['DEL', probeKey]])
    add('Запись и чтение', String(w?.[1]?.result) === '1', `SET/GET/DEL выполнены, ключ ${probeKey} удалён`)
  } catch (e) {
    const p = errorPayload(e)
    add('Запись и чтение', false, `${p.error} — ${p.detail}`)
    return res.status(200).json({ ok: false, report, steps })
  }

  try {
    const day = new Date().toISOString().slice(0, 10)
    const r = await pipeline([['HGETALL', `nr:d:${day}`]])
    const len = Array.isArray(r?.[0]?.result) ? r[0].result.length / 2 : 0
    add('Чтение счётчиков за сегодня', true, `полей в nr:d:${day} — ${len}`)
  } catch (e) {
    const p = errorPayload(e)
    add('Чтение счётчиков за сегодня', false, `${p.error} — ${p.detail}`)
  }

  return res.status(200).json({ ok: steps.every((s) => s.ok), report, steps })
}