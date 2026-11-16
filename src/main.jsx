import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { tg, setBottomBar } from './telegram.js'

const root = document.documentElement

const inTelegram = !!(tg && tg.platform && tg.platform !== 'unknown' && (tg.initData || tg.initDataUnsafe?.user))
root.dataset.telegram = inTelegram ? '1' : '0'

const isMobileTg = inTelegram && (tg.platform === 'ios' || tg.platform === 'android')
root.dataset.mobile = isMobileTg ? '1' : '0'

try {
  const saved = JSON.parse(localStorage.getItem('nr.prefs.v1') || '{}')
  const scheme = saved.theme || (tg && tg.colorScheme) || 'dark'
  root.dataset.theme = scheme === 'light' ? 'light' : 'dark'
} catch {
  root.dataset.theme = 'dark'
}

const HEADER_ALLOWANCE = 56

function applyInsets() {
  if (!inTelegram) {
    root.style.removeProperty('--tg-top')
    root.style.removeProperty('--tg-bottom')
    return
  }
  const safe = tg.safeAreaInset || { top: 0, bottom: 0 }
  const c = tg.contentSafeAreaInset
  let top = 0
  let bottom = 0

  if (c && (c.top || c.bottom || c.left || c.right)) {
    top = c.top || 0
    bottom = c.bottom || 0
  } else {
    top = (safe.top || 0) + HEADER_ALLOWANCE
    bottom = safe.bottom || 0
  }

  // Часть клиентов отдаёт только системный вырез, без собственной шапки.
  // Нижний предел гарантирует, что контент не уедет под «Закрыть».
  let full = false
  try { full = !!tg.isFullscreen } catch {}
  if (isMobileTg && !full) top = Math.max(top, (safe.top || 0) + HEADER_ALLOWANCE)

  root.style.setProperty('--tg-top', `${top}px`)
  root.style.setProperty('--tg-bottom', `${bottom}px`)
}

applyInsets()

if (tg) {
  try { tg.ready() } catch {}
  try { tg.expand() } catch {}
  try { tg.disableVerticalSwipes() } catch {}
  ;['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged']
    .forEach((e) => { try { tg.onEvent(e, applyInsets) } catch {} })
}

window.addEventListener('resize', applyInsets)
window.addEventListener('orientationchange', applyInsets)

setBottomBar(root.dataset.theme === 'light' ? '#eaedf5' : '#0a0c12')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)