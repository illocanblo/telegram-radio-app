/**
 * Слой возможностей Telegram Mini Apps.
 *
 * Всё определяется по факту наличия метода, а не только по номеру версии:
 * старые клиенты просто не показывают соответствующие элементы интерфейса.
 *
 * Ориентиры по версиям:
 *  - CloudStorage: ключи 1–128 символов A-Z a-z 0-9 _ -, значения 0–4096, до 1024 ключей
 *  - showConfirm / showAlert / closing confirmation — 6.2+
 *  - readTextFromClipboard, openLink(try_instant_view) — 6.4+
 *  - shareToStory — 7.8+
 *  - setBottomBarColor, SecondaryButton — 7.10+
 *  - requestFullscreen / exitFullscreen / isFullscreen, addToHomeScreen,
 *    checkHomeScreenStatus, downloadFile, lockOrientation — 8.0+
 *  - hideKeyboard — 9.1+
 */

export const tg = (typeof window !== 'undefined' && window.Telegram?.WebApp) || null

export const has = (name) => !!(tg && typeof tg[name] === 'function')
export const hasObj = (name) => !!(tg && tg[name])
export const atLeast = (v) => { try { return !!tg?.isVersionAtLeast?.(v) } catch { return false } }

/** Универсальный вызов: поддерживает и callback-, и promise-стиль SDK. */
function call(fn, ...args) {
  return new Promise((resolve) => {
    let done = false
    const finish = (err, res) => { if (!done) { done = true; resolve({ err: err || null, res }) } }
    try {
      const out = fn(...args, (err, res) => finish(err, res))
      if (out && typeof out.then === 'function') out.then((res) => finish(null, res)).catch((err) => finish(err, null))
      if (out !== undefined && out !== null && typeof out.then !== 'function') finish(null, out)
    } catch (err) { finish(err, null) }
    setTimeout(() => finish(null, null), 12000)
  })
}

export function capabilities() {
  return {
    cloud: hasObj('CloudStorage') && typeof tg.CloudStorage.setItem === 'function' && typeof tg.CloudStorage.getItems === 'function',
    fullscreen: has('requestFullscreen') && has('exitFullscreen'),
    homeScreen: has('addToHomeScreen') && has('checkHomeScreenStatus'),
    story: has('shareToStory'),
    download: has('downloadFile'),
    bottomBar: has('setBottomBarColor'),
    closing: has('enableClosingConfirmation') && has('disableClosingConfirmation'),
    secondary: hasObj('SecondaryButton'),
    main: hasObj('MainButton'),
    settings: hasObj('SettingsButton'),
    confirm: has('showConfirm'),
    clipboard: has('readTextFromClipboard'),
    hideKeyboard: has('hideKeyboard'),
    orientation: has('lockOrientation') && has('unlockOrientation'),
    haptic: hasObj('HapticFeedback'),
  }
}

/* ---------- оформление ---------- */
export function setBottomBar(color) {
  if (!has('setBottomBarColor') || !color) return
  try { tg.setBottomBarColor(color) } catch {}
}

export function setClosingConfirmation(on) {
  if (!has('enableClosingConfirmation')) return
  try { on ? tg.enableClosingConfirmation() : tg.disableClosingConfirmation() } catch {}
}

export function hideKeyboard() {
  if (!has('hideKeyboard')) return
  try { tg.hideKeyboard() } catch {}
}

export function haptic(kind = 'light') {
  try { tg?.HapticFeedback?.impactOccurred(kind) } catch {}
}

export function hapticNotify(type = 'success') {
  try { tg?.HapticFeedback?.notificationOccurred(type) } catch {}
}

/* ---------- полный экран ---------- */
export const isFullscreen = () => { try { return !!tg?.isFullscreen } catch { return false } }

export function toggleFullscreen() {
  if (!has('requestFullscreen')) return false
  try {
    if (isFullscreen()) tg.exitFullscreen()
    else tg.requestFullscreen()
    return true
  } catch { return false }
}

/* ---------- иконка на экране телефона ---------- */
export async function homeScreenStatus() {
  if (!has('checkHomeScreenStatus')) return 'unsupported'
  const { res } = await call(tg.checkHomeScreenStatus.bind(tg))
  return typeof res === 'string' ? res : 'unknown'
}

export function addToHomeScreen() {
  if (!has('addToHomeScreen')) return false
  try { tg.addToHomeScreen(); return true } catch { return false }
}

/* ---------- истории и файлы ---------- */
export function shareToStory(mediaUrl, { text, url, name } = {}) {
  if (!has('shareToStory') || !mediaUrl) return false
  const params = {}
  if (text) params.text = String(text).slice(0, 200)
  if (url) params.widget_link = { url, name: name || 'Открыть плеер' }
  try { tg.shareToStory(mediaUrl, params); return true } catch { return false }
}

export async function downloadFile(url, fileName) {
  if (!has('downloadFile') || !url) return { ok: false, reason: 'unsupported' }
  const { err, res } = await call(tg.downloadFile.bind(tg), { url, file_name: String(fileName || 'track.mp3').slice(0, 120) })
  if (err) return { ok: false, reason: String(err?.message || err) }
  return { ok: res !== false, reason: res === false ? 'cancelled' : '' }
}

/* ---------- диалоги и ссылки ---------- */
export async function confirmNative(message) {
  if (!has('showConfirm')) return window.confirm(message)
  const { res } = await call(tg.showConfirm.bind(tg), message)
  return !!res
}

export function alertNative(message) {
  if (has('showAlert')) { try { tg.showAlert(message); return } catch {} }
  window.alert(message)
}

export function openExternal(url, instantView = false) {
  if (has('openLink')) {
    try { tg.openLink(url, { try_instant_view: !!instantView }); return } catch {}
  }
  window.open(url, '_blank', 'noopener')
}

export async function readClipboard() {
  if (!has('readTextFromClipboard')) return null
  const { res } = await call(tg.readTextFromClipboard.bind(tg))
  return typeof res === 'string' ? res : null
}

/* ---------- нативные кнопки ---------- */
export function showSettingsButton(on) {
  const b = tg?.SettingsButton
  if (!b) return
  try { on ? b.show() : b.hide() } catch {}
}

export function setMainButton({ text, visible, color = '#c6ff3d', textColor = '#0a0c12' }) {
  const b = tg?.MainButton
  if (!b) return
  try { b.setParams({ text, color, text_color: textColor, is_visible: !!visible, is_active: true }) } catch {}
}

export function setSecondaryButton({ text, visible, color = '#1b2030', textColor = '#eef1f8' }) {
  const b = tg?.SecondaryButton
  if (!b) return
  try { b.setParams({ text, color, text_color: textColor, is_visible: !!visible, is_active: true, has_shine_effect: false }) } catch {}
}

export function onMainButton(handler) {
  const b = tg?.MainButton
  if (!b) return () => {}
  try { b.onClick(handler) } catch {}
  return () => { try { b.offClick(handler) } catch {} }
}

export function onSecondaryButton(handler) {
  const b = tg?.SecondaryButton
  if (!b) return () => {}
  try { b.onClick(handler) } catch {}
  return () => { try { b.offClick(handler) } catch {} }
}

export function onFullscreenChange(handler) {
  if (!tg?.onEvent) return () => {}
  try { tg.onEvent('fullscreenChanged', handler) } catch {}
  return () => { try { tg.offEvent('fullscreenChanged', handler) } catch {} }
}

export function onHomeScreenAdded(handler) {
  if (!tg?.onEvent) return () => {}
  try { tg.onEvent('homeScreenAdded', handler) } catch {}
  return () => { try { tg.offEvent('homeScreenAdded', handler) } catch {} }
}