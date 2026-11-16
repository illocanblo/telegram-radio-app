/**
 * Телеметрия приложения.
 *
 * Собираются только обезличенные счётчики: события, релизы, треки, класс
 * платформы, тема, формат, секунды прослушивания.
 *
 * Принципиально НЕ делается:
 *  - не читается Telegram initData / initDataUnsafe.user (id, username, имя);
 *  - не собирается и не хранится IP, полный User-Agent, геолокация;
 *  - не ставятся cookies, нет постоянного идентификатора посетителя;
 *  - не сохраняется текст поисковых запросов;
 *  - идентификатор сессии живёт только в памяти вкладки и не передаётся.
 *
 * Сбор включается на сервере (TELEMETRY=1) и определяется в рантайме через
 * /api/config. Do Not Track и Global Privacy Control по умолчанию блокируют
 * отправку; владелец может разрешить её для своего устройства на время сессии.
 */

const VERSION = 1
const LOCAL_KEY = 'nr.stats.v1'
const OVERRIDE_KEY = 'nr.stats.override'
const ENDPOINT = '/api/stats'
const CONFIG_ENDPOINT = '/api/config'
const FLUSH_MS = 60000
const MAX_DAYS = 90
const MAX_ALBUMS = 150
const MAX_TRACKS = 300

const EV_KEYS = [
  'open', 'album', 'play', 'pause', 'complete', 'skip', 'seek', 'radio',
  'search', 'filter', 'fav_add', 'fav_remove', 'q_remove', 'q_reorder',
  'shuffle', 'repeat', 'error',
]

const PLATFORMS = ['ios', 'android', 'desktop', 'web', 'other']
const THEMES = ['dark', 'light']
const FORMATS = ['MP3', 'M4A', 'AAC', 'OGG', 'OPUS', 'FLAC', 'SHN', 'OTHER']

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
const FORCED = env.VITE_TELEMETRY === '1'

function today(ts = Date.now()) { return new Date(ts).toISOString().slice(0, 10) }

function privacyBlocked() {
  if (typeof navigator === 'undefined') return false
  const dnt = navigator.doNotTrack || window.doNotTrack
  return dnt === '1' || dnt === 'yes' || navigator.globalPrivacyControl === true
}

function readOverride() {
  try { return sessionStorage.getItem(OVERRIDE_KEY) === '1' } catch { return false }
}

function platformClass() {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null
  const p = tg?.platform
  if (p === 'ios') return 'ios'
  if (p === 'android') return 'android'
  if (p === 'tdesktop' || p === 'macos') return 'desktop'
  if (p && p !== 'unknown') return 'web'
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Windows|Macintosh|Linux/i.test(ua) && !/Mobile/i.test(ua)) return 'desktop'
  return 'other'
}

function nonce() {
  const a = new Uint8Array(12)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a)
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

const blankDay = () => ({ sessions: 0, listenSec: 0, ...Object.fromEntries(EV_KEYS.map((k) => [k, 0])) })

function blankStore() {
  return { v: VERSION, since: today(), days: {}, albums: {}, tracks: {}, plat: {}, theme: {}, fmt: {} }
}

function read() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return blankStore()
    const p = JSON.parse(raw)
    if (!p || p.v !== VERSION) return blankStore()
    return {
      ...blankStore(), ...p,
      days: p.days || {}, albums: p.albums || {}, tracks: p.tracks || {},
      plat: p.plat || {}, theme: p.theme || {}, fmt: p.fmt || {},
    }
  } catch { return blankStore() }
}

let store = read()
let saveTimer = null

function persist() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      const days = Object.keys(store.days).sort().slice(-MAX_DAYS)
      store.days = Object.fromEntries(days.map((d) => [d, store.days[d]]))
      const trim = (obj, max) => {
        const keys = Object.keys(obj)
        if (keys.length <= max) return obj
        return Object.fromEntries(keys.sort((a, b) => (obj[b].plays || 0) - (obj[a].plays || 0)).slice(0, max).map((k) => [k, obj[k]]))
      }
      store.albums = trim(store.albums, MAX_ALBUMS)
      store.tracks = trim(store.tracks, MAX_TRACKS)
      localStorage.setItem(LOCAL_KEY, JSON.stringify(store))
    } catch {}
  }, 900)
}

function blankDelta() {
  return { v: VERSION, day: today(), nonce: nonce(), sessions: 0, listenSec: 0, ev: {}, albums: {}, tracks: {}, plat: {}, theme: {}, fmt: {} }
}

let delta = blankDelta()
let sessionCounted = false
let ctx = { plat: platformClass(), theme: 'dark' }
let flushTimer = null
let started = false
let override = readOverride()
let cfg = { telemetry: FORCED, storage: false, summary: false, checked: false, reachable: false }

const listeners = new Set()
function notify() { listeners.forEach((fn) => { try { fn() } catch {} }) }

function transmitting() { return (cfg.telemetry || FORCED) && (!privacyBlocked() || override) }

function day() {
  const d = today()
  if (!store.days[d]) store.days[d] = blankDay()
  return store.days[d]
}

function bump(map, key, field, n = 1) {
  if (!key) return
  if (!map[key]) map[key] = {}
  map[key][field] = (map[key][field] || 0) + n
}

function addDelta(bucket, key, n = 1) {
  if (!key) return
  delta[bucket][key] = (delta[bucket][key] || 0) + n
}

function countSession() {
  if (sessionCounted) return
  sessionCounted = true
  day().sessions += 1
  delta.sessions += 1
  store.plat[ctx.plat] = (store.plat[ctx.plat] || 0) + 1
  store.theme[ctx.theme] = (store.theme[ctx.theme] || 0) + 1
  addDelta('plat', ctx.plat)
  addDelta('theme', ctx.theme)
}

function rollDay() {
  if (delta.day !== today()) {
    flush()
    delta = blankDelta()
    sessionCounted = false
    countSession()
  }
}

async function probe() {
  try {
    const r = await fetch(CONFIG_ENDPOINT, { credentials: 'omit', cache: 'no-store', mode: 'same-origin' })
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json()
    cfg = { telemetry: !!j.telemetry, storage: !!j.storage, summary: !!j.summary, checked: true, reachable: true }
  } catch {
    cfg = { ...cfg, checked: true, reachable: false }
  }
  notify()
  return cfg
}

export const analytics = {
  init({ theme } = {}) {
    if (started) return
    started = true
    ctx.theme = theme === 'light' ? 'light' : 'dark'
    ctx.plat = platformClass()
    countSession()
    this.event('open')
    flushTimer = setInterval(() => flush(), FLUSH_MS)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('visibilitychange', onVisibility)
    persist()
    notify()
    probe()
  },

  probe,

  status() {
    return {
      transmitting: transmitting(),
      privacyBlocked: privacyBlocked(),
      override,
      platform: ctx.plat,
      pending: Object.keys(delta.ev).length + delta.sessions + Math.round(delta.listenSec),
      ...cfg,
    }
  },

  setOverride(v) {
    override = !!v
    try {
      if (override) sessionStorage.setItem(OVERRIDE_KEY, '1')
      else sessionStorage.removeItem(OVERRIDE_KEY)
    } catch {}
    notify()
    if (override) flush()
    return override
  },

  setTheme(theme) { ctx.theme = theme === 'light' ? 'light' : 'dark' },

  event(name, { album, track, format } = {}) {
    if (!EV_KEYS.includes(name)) return
    rollDay()
    countSession()
    day()[name] += 1
    delta.ev[name] = (delta.ev[name] || 0) + 1
    if (album) {
      bump(store.albums, album, name === 'play' ? 'plays' : name === 'complete' ? 'completes' : 'opens')
      if (name === 'play' || name === 'album') addDelta('albums', album)
    }
    if (album && Number.isInteger(track)) {
      const key = `${album}|${track}`
      bump(store.tracks, key, name === 'play' ? 'plays' : name === 'complete' ? 'completes' : 'opens')
      if (name === 'play') {
        addDelta('tracks', key)
        const f = FORMATS.includes(format) ? format : 'OTHER'
        store.fmt[f] = (store.fmt[f] || 0) + 1
        addDelta('fmt', f)
      }
    }
    persist()
    notify()
  },

  play(album, track, format) { this.event('play', { album, track, format }) },
  complete(album, track) { this.event('complete', { album, track }) },

  listen(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return
    const s = Math.min(seconds, 30)
    rollDay()
    day().listenSec += s
    delta.listenSec += s
    persist()
  },

  tick(currentTime, playing, lastRef) {
    if (!playing) { lastRef.current = null; return }
    if (lastRef.current == null) { lastRef.current = currentTime; return }
    const d = currentTime - lastRef.current
    lastRef.current = currentTime
    if (d > 0 && d < 5) this.listen(d)
  },

  getLocal() { return JSON.parse(JSON.stringify(store)) },

  reset() {
    const snapshot = JSON.parse(JSON.stringify(store))
    store = blankStore()
    sessionCounted = false
    countSession()
    persist()
    notify()
    return snapshot
  },

  restore(snapshot) {
    if (!snapshot || snapshot.v !== VERSION) return
    store = snapshot
    persist()
    notify()
  },

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },

  flush,

  async flushNow() {
    if (!transmitting()) {
      return { ok: false, message: privacyBlocked() && !override ? 'Отправку блокирует Do Not Track. Разрешите её для этого устройства ниже.' : 'Сбор выключен на сервере: задайте TELEMETRY=1.' }
    }
    const body = payload()
    if (!body) return { ok: true, empty: true, message: 'Новых событий нет — отправлять нечего. Послушайте трек и повторите.' }
    delta = blankDelta()
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), credentials: 'omit', mode: 'same-origin', cache: 'no-store',
      })
      if (r.status === 204) return { ok: true, message: 'События отправлены и записаны. Откройте «Аудитория» → Обновить.' }
      if (r.status === 503) return { ok: false, message: 'Хранилище не настроено: UPSTASH_REDIS_REST_URL / TOKEN.' }
      if (r.status === 403) return { ok: false, message: 'Сбор выключен на сервере (TELEMETRY).' }
      return { ok: false, message: `Приёмник ответил ${r.status}.` }
    } catch {
      return { ok: false, message: 'Нет связи с /api/stats.' }
    }
  },

  async testSend() {
    const body = { v: VERSION, day: today(), nonce: nonce(), sessions: 0, listenSec: 0, ev: {}, albums: {}, tracks: {}, plat: {}, theme: {}, fmt: {} }
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), credentials: 'omit', mode: 'same-origin', cache: 'no-store',
      })
      if (r.status === 204) return { ok: true, status: 204, message: 'Приёмник отвечает, хранилище настроено. Проверка не записала данных.' }
      if (r.status === 503) return { ok: false, status: 503, message: 'Хранилище не настроено: задайте UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN.' }
      if (r.status === 403) return { ok: false, status: 403, message: 'Сбор выключен: задайте TELEMETRY=1 в Vercel и сделайте Redeploy.' }
      if (r.status === 405) return { ok: false, status: 405, message: 'Функция /api/stats отвечает не на POST — проверьте, что файл задеплоен.' }
      return { ok: false, status: r.status, message: `Приёмник ответил ${r.status}.` }
    } catch {
      return { ok: false, status: 0, message: 'Нет связи с /api/stats — функция не задеплоена или заблокирована.' }
    }
  },
}

function payload() {
  const has = delta.sessions > 0 || delta.listenSec > 0 || Object.keys(delta.ev).length > 0
  if (!has) return null
  return {
    v: VERSION, day: delta.day, nonce: delta.nonce,
    sessions: Math.min(delta.sessions, 10),
    listenSec: Math.round(Math.min(delta.listenSec, 86400)),
    ev: delta.ev, albums: delta.albums, tracks: delta.tracks,
    plat: delta.plat, theme: delta.theme, fmt: delta.fmt,
  }
}

function flush() {
  if (!transmitting()) return
  const body = payload()
  if (!body) return
  delta = blankDelta()
  try {
    const json = JSON.stringify(body)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([json], { type: 'application/json' }))
    } else {
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true, credentials: 'omit', mode: 'same-origin' }).catch(() => {})
    }
  } catch {}
  notify()
}

function onPageHide() { flush() }
function onVisibility() { if (document.visibilityState === 'hidden') flush() }

export function summaryOf(src) {
  const days = Object.keys(src.days || {}).sort()
  const totals = blankDay()
  days.forEach((d) => {
    const row = src.days[d]
    Object.keys(totals).forEach((k) => { totals[k] += row?.[k] || 0 })
  })
  const topAlbums = Object.entries(src.albums || {}).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.plays || 0) - (a.plays || 0))
  const topTracks = Object.entries(src.tracks || {}).map(([key, v]) => {
    const [album, idx] = key.split('|')
    return { key, album, index: Number(idx), ...v }
  }).sort((a, b) => (b.plays || 0) - (a.plays || 0))
  return { days, totals, topAlbums, topTracks, plat: src.plat || {}, theme: src.theme || {}, fmt: src.fmt || {} }
}

export { EV_KEYS, PLATFORMS, THEMES, FORMATS }