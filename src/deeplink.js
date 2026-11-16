/**
 * Прямые ссылки Mini Apps.
 *
 * Формат: https://t.me/<bot>/<appshortname>?startapp=<param>
 * Основное приложение: https://t.me/<bot>?startapp=<param>
 * Значение startapp приходит в Telegram.WebApp.initDataUnsafe.start_param
 * и дублируется в hash как tgWebAppStartParam.
 * Источник: core.telegram.org/bots/webapps — Direct Link Mini Apps [[1]][[2]]
 *
 * Во внешнем браузере (Safari/Chrome) start_param может не прийти [[3]],
 * поэтому поддержан запасной путь: https://<домен>/?nr=<param>
 *
 * Параметр держим в безопасном наборе A-Z a-z 0-9 _ - и не длиннее 64 символов,
 * поэтому идентификаторы релизов кодируем в base64url.
 *
 * Маршрут приложения хранится в hash под ключом nr — рядом с tgWebAppData,
 * чтобы не затирать данные инициализации Telegram при навигации и перезагрузке.
 */

const CFG_KEY = 'nr.links.v1'
export const PARAM_MAX = 64

/* ---------- base64url ---------- */
function b64uEncode(str) {
  const bytes = new TextEncoder().encode(String(str))
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64uDecode(s) {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + pad)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/* ---------- параметры запуска ---------- */
export function paramForAlbum(id) {
  const p = 'a_' + b64uEncode(id)
  return p.length <= PARAM_MAX ? p : null
}
export function paramForQuery(q) {
  const p = 'q_' + b64uEncode(q)
  return p.length <= PARAM_MAX ? p : null
}
export const PARAM_RADIO = 'r'
export const PARAM_FAV = 'f'
export const PARAM_STATS = 's'
export const PARAM_LINKS = 'l'
export const paramForDecade = (d) => `d_${d}`

export function routeFromParam(raw) {
  const p = String(raw || '').trim()
  if (!p) return null
  if (p === 's' || p === 'stats') return { name: 'stats', id: null }
  if (p === 'l' || p === 'links') return { name: 'links', id: null }
  if (p === 'r' || p === 'radio') return { name: 'library', id: null, action: 'radio' }
  if (p === 'f' || p === 'fav') return { name: 'library', id: null, action: 'fav' }
  if (/^d_\d{4}$/.test(p)) return { name: 'library', id: null, action: 'decade', value: p.slice(2) }
  if (p.startsWith('q_')) {
    try { return { name: 'library', id: null, action: 'search', value: b64uDecode(p.slice(2)) } } catch { return null }
  }
  if (p.startsWith('a_')) {
    try {
      const id = b64uDecode(p.slice(2))
      return id ? { name: 'album', id } : null
    } catch { return null }
  }
  if (p.startsWith('album_')) {
    const id = p.slice(6)
    return /^[A-Za-z0-9._-]{1,120}$/.test(id) ? { name: 'album', id } : null
  }
  return null
}

export function readStartParam() {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null
  const fromTg = tg?.initDataUnsafe?.start_param
  if (fromTg) return String(fromTg)
  try {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const hp = h.get('tgWebAppStartParam') || h.get('startapp')
    if (hp) return hp
  } catch {}
  try {
    const q = new URLSearchParams(window.location.search)
    return q.get('startapp') || q.get('tgWebAppStartParam') || q.get('nr') || ''
  } catch { return '' }
}

/* ---------- маршрутизация в hash с сохранением tgWebAppData ---------- */
function hashParams() {
  const raw = window.location.hash.replace(/^#/, '')
  if (raw.startsWith('/')) return new URLSearchParams()
  try { return new URLSearchParams(raw) } catch { return new URLSearchParams() }
}

const routeValue = (r) => (r?.name === 'album' && r.id ? `album/${r.id}` : r?.name === 'stats' ? 'stats' : r?.name === 'links' ? 'links' : '')

export function readRoute() {
  const raw = window.location.hash.replace(/^#/, '')
  if (raw.startsWith('/')) {
    if (raw === '/stats') return { name: 'stats', id: null }
    if (raw === '/links') return { name: 'links', id: null }
    const m = raw.match(/^\/album\/(.+)$/)
    if (m) { try { return { name: 'album', id: decodeURIComponent(m[1]) } } catch { return { name: 'album', id: m[1] } } }
    return { name: 'library', id: null }
  }
  const v = hashParams().get('nr') || ''
  if (v === 'stats') return { name: 'stats', id: null }
  if (v === 'links') return { name: 'links', id: null }
  if (v.startsWith('album/')) return { name: 'album', id: v.slice(6) }
  return { name: 'library', id: null }
}

export function writeRoute(route, { replace = false, depth = 0 } = {}) {
  const p = hashParams()
  const v = routeValue(route)
  if (v) p.set('nr', v)
  else p.delete('nr')
  const s = p.toString()
  const url = window.location.pathname + window.location.search + (s ? '#' + s : '')
  const state = { app: true, depth }
  if (replace) window.history.replaceState(state, '', url)
  else window.history.pushState(state, '', url)
}

/* ---------- конфигурация и генерация ссылок ---------- */
export function getLinkConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(CFG_KEY) || '{}')
    return {
      bot: String(raw.bot || '').replace(/^@/, '').trim(),
      app: String(raw.app || '').trim(),
      compact: !!raw.compact,
    }
  } catch { return { bot: '', app: '', compact: false } }
}

export function setLinkConfig(next) {
  const cfg = {
    bot: String(next.bot || '').replace(/^@/, '').trim(),
    app: String(next.app || '').trim(),
    compact: !!next.compact,
  }
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)) } catch {}
  return cfg
}

export function directLink({ bot, app, param, compact }) {
  const b = String(bot || '').replace(/^@/, '').trim()
  const a = String(app || '').trim()
  if (!b) return ''
  const base = a ? `https://t.me/${b}/${a}` : `https://t.me/${b}`
  const qs = []
  if (param) qs.push('startapp=' + encodeURIComponent(param))
  if (compact) qs.push('mode=compact')
  return qs.length ? `${base}?${qs.join('&')}` : base
}

export function webLink(param) {
  const u = new URL(window.location.href)
  u.hash = ''
  u.search = ''
  if (param) u.searchParams.set('nr', param)
  return u.toString()
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}

export function shareToTelegram(link, text) {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null
  const url = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text || '')
  if (tg?.openTelegramLink) { tg.openTelegramLink(url); return true }
  window.open(url, '_blank', 'noopener')
  return false
}