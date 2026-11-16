/**
 * Синхронизация настроек, избранного, скрытых релизов и позиции прослушивания
 * через Telegram CloudStorage — между телефоном, десктопом и веб-версией.
 *
 * Ограничения CloudStorage: ключ 1–128 символов [A-Za-z0-9_-], значение ≤4096
 * символов, до 1024 ключей. Поэтому длинные списки режутся на части, а метаданные
 * лежат в отдельном ключе. Локальная копия в localStorage остаётся источником
 * мгновенного чтения, облако — источником истины по метке времени.
 */

import { tg, hasObj } from './telegram.js'

const LIMIT = 4096
const NAMES = ['prefs', 'favs', 'hidden', 'session']
const cloudKey = (n) => `nr_${n}`
const partKey = (n, i) => `nr_${n}_p${i}`
const tsKey = (n) => `nr_ts_${n}`

export const enabled = hasObj('CloudStorage')
  && typeof tg.CloudStorage.setItem === 'function'
  && typeof tg.CloudStorage.getItems === 'function'
  && typeof tg.CloudStorage.removeItem === 'function'

function call(method, ...args) {
  return new Promise((resolve) => {
    let done = false
    const finish = (err, res) => { if (!done) { done = true; resolve({ err: err || null, res }) } }
    try {
      const out = method(...args, (err, res) => finish(err, res))
      if (out && typeof out.then === 'function') out.then((r) => finish(null, r)).catch((e) => finish(e, null))
    } catch (e) { finish(e, null) }
    setTimeout(() => finish(null, null), 12000)
  })
}

const cs = () => tg.CloudStorage
const setItem = (k, v) => call(cs().setItem.bind(cs()), k, v)
const getItems = (keys) => call(cs().getItems.bind(cs()), keys)
const removeItems = (keys) => call(cs().removeItems.bind(cs()), keys)

export function localTs(name) {
  try { return Number(localStorage.getItem(tsKey(name)) || 0) } catch { return 0 }
}

function markLocal(name, ts) {
  try { localStorage.setItem(tsKey(name), String(ts)) } catch {}
}

function split(str) {
  const out = []
  for (let i = 0; i < str.length; i += LIMIT) out.push(str.slice(i, i + LIMIT))
  return out.length ? out : ['']
}

async function writeEnvelope(name, envelope) {
  const payload = JSON.stringify(envelope.d ?? null)
  const parts = split(payload)
  const meta = JSON.stringify({ v: 1, ts: envelope.ts, n: parts.length })
  if (meta.length > LIMIT) return false

  const prev = await readMeta(name)
  for (let i = 0; i < parts.length; i++) {
    const { err } = await setItem(partKey(name, i), parts[i])
    if (err) return false
  }
  const { err } = await setItem(cloudKey(name), meta)
  if (err) return false

  if (prev && prev.n > parts.length) {
    const stale = []
    for (let i = parts.length; i < prev.n; i++) stale.push(partKey(name, i))
    if (stale.length) await removeItems(stale)
  }
  return true
}

async function readMeta(name) {
  const { err, res } = await getItems([cloudKey(name)])
  if (err || !res) return null
  try {
    const m = JSON.parse(res[cloudKey(name)] || '')
    return m && typeof m.n === 'number' ? m : null
  } catch { return null }
}

async function readEnvelope(name) {
  const meta = await readMeta(name)
  if (!meta) return null
  const keys = []
  for (let i = 0; i < meta.n; i++) keys.push(partKey(name, i))
  const { err, res } = await getItems(keys)
  if (err || !res) return null
  const payload = keys.map((k) => res[k] || '').join('')
  try { return { ts: Number(meta.ts) || 0, d: JSON.parse(payload) } } catch { return null }
}

const timers = new Map()
const pending = new Map()

export function push(name, value, { delay = 700 } = {}) {
  if (!NAMES.includes(name)) return
  const ts = Date.now()
  markLocal(name, ts)
  if (!enabled) return
  pending.set(name, { ts, d: value })
  if (timers.has(name)) clearTimeout(timers.get(name))
  timers.set(name, setTimeout(async () => {
    timers.delete(name)
    const env = pending.get(name)
    pending.delete(name)
    if (!env) return
    const ok = await writeEnvelope(name, env)
    if (ok) markLocal(name, env.ts)
  }, delay))
}

export async function flush() {
  if (!enabled) return
  const jobs = []
  for (const [name, env] of [...pending.entries()]) {
    if (timers.has(name)) { clearTimeout(timers.get(name)); timers.delete(name) }
    pending.delete(name)
    jobs.push(writeEnvelope(name, env).then((ok) => { if (ok) markLocal(name, env.ts) }))
  }
  await Promise.all(jobs)
}

/** Забирает облачные значения, которые новее локальных. */
export async function pull() {
  if (!enabled) return {}
  const out = {}
  for (const name of NAMES) {
    const env = await readEnvelope(name)
    if (env && env.ts > localTs(name)) out[name] = env
  }
  return out
}

export function markPulled(name, ts) { markLocal(name, ts) }