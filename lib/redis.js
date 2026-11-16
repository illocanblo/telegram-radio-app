/**
 * Общий доступ к Upstash Redis для серверных функций.
 * Значения переменных нормализуются: убираются кавычки, пробелы и переводы
 * строк, которые часто попадают при вставке в дашборд Vercel.
 * Поддерживаются оба имени переменных: UPSTASH_* и KV_* (интеграция Vercel).
 */

function clean(v) {
  let s = String(v ?? '')
  s = s.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1)
  return s.trim()
}

export function rawEnv() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? '',
    key: process.env.STATS_KEY ?? '',
    flag: process.env.TELEMETRY ?? process.env.VITE_TELEMETRY ?? '',
  }
}

export function cfg() {
  const raw = rawEnv()
  const url = clean(raw.url).replace(/\/+$/, '')
  const token = clean(raw.token)
  const key = clean(raw.key)
  const flag = clean(raw.flag).toLowerCase()
  return { url, token, key, enabled: ['1', 'true', 'on', 'yes'].includes(flag) }
}

export function envReport() {
  const raw = rawEnv()
  const c = cfg()
  let host = ''
  let protocol = ''
  try { const u = new URL(c.url); host = u.host; protocol = u.protocol } catch {}
  return {
    urlPresent: !!clean(raw.url),
    urlValid: protocol === 'https:' && !!host,
    urlHost: host,
    urlHadSlash: /\/\s*$/.test(String(raw.url)),
    urlHadQuotes: /^\s*["']/.test(String(raw.url)),
    urlHadSpace: /\s/.test(String(raw.url).trim()),
    tokenPresent: !!c.token,
    tokenLength: c.token.length,
    tokenHadQuotes: /^\s*["']/.test(String(raw.token)),
    tokenHadSpace: /\s/.test(String(raw.token).trim()),
    keyPresent: !!c.key,
    keyLength: c.key.length,
    keyHadSpace: /\s/.test(String(raw.key).trim()),
    telemetryFlag: c.enabled,
    flagValue: clean(raw.flag),
  }
}

function fail(code, detail, status) {
  const e = new Error(code)
  e.code = code
  if (detail) e.detail = String(detail).slice(0, 400)
  if (status) e.status = status
  return e
}

export async function pipeline(commands, timeoutMs = 9000) {
  const { url, token } = cfg()
  if (!url || !token) throw fail('storage_not_configured', 'Нет UPSTASH_REDIS_REST_URL или UPSTASH_REDIS_REST_TOKEN')
  let u
  try { u = new URL(url) } catch { throw fail('bad_url', `URL не разбирается: ${url.slice(0, 80)}`) }
  if (u.protocol !== 'https:') throw fail('bad_url', `Нужен https REST-адрес, получен ${u.protocol}`)
  if (/[\r\n]/.test(token)) throw fail('bad_token', 'В токене есть перевод строки')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res
  try {
    res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: ctrl.signal,
    })
  } catch (err) {
    throw fail(err?.name === 'AbortError' ? 'timeout' : 'network', err?.message || String(err))
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text().catch(() => '')
  if (!res.ok) throw fail('upstash_http', text || res.statusText, res.status)

  let json
  try { json = JSON.parse(text) } catch { throw fail('upstash_json', text) }
  if (!Array.isArray(json)) throw fail('upstash_shape', text)

  const bad = json.find((x) => x && x.error)
  if (bad) throw fail('upstash_command', bad.error)
  return json
}

export async function pipelineChunked(commands, size = 60) {
  const out = []
  for (let i = 0; i < commands.length; i += size) {
    const part = await pipeline(commands.slice(i, i + size))
    out.push(...part)
  }
  return out
}

export function hashToObject(arr) {
  const out = {}
  if (!Array.isArray(arr)) return out
  for (let i = 0; i < arr.length; i += 2) out[arr[i]] = Number(arr[i + 1]) || 0
  return out
}

export function errorPayload(e) {
  return { error: e?.code || 'unknown', detail: e?.detail || e?.message || '', status: e?.status || undefined }
}