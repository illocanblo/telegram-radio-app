import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const root = document.documentElement
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null

// Определяем, реально ли мы внутри клиента Telegram (а не в обычном браузере)
const inTelegram = !!(tg && tg.platform && tg.platform !== 'unknown' && (tg.initData || tg.initDataUnsafe?.user))
root.dataset.telegram = inTelegram ? '1' : '0'

// Тема до первого рендера — чтобы не было вспышки
try {
  const saved = JSON.parse(localStorage.getItem('nr.prefs.v1') || '{}')
  const scheme = saved.theme || (tg && tg.colorScheme) || 'dark'
  root.dataset.theme = scheme === 'light' ? 'light' : 'dark'
} catch {
  root.dataset.theme = 'dark'
}

/**
 * Telegram рисует собственную шапку ПОВЕРХ WebView.
 * contentSafeAreaInset включает и системный safe-area, и интерфейс Telegram.
 * Вычитаем системную часть, т.к. её добавит CSS через env().
 */
function applyInsets() {
  let uiTop = 0
  let uiBottom = 0

  if (inTelegram) {
    const safe = tg.safeAreaInset || { top: 0, bottom: 0, left: 0, right: 0 }
    const content = tg.contentSafeAreaInset
    if (content && (content.top || content.bottom)) {
      uiTop = Math.max(0, content.top - (safe.top || 0))
      uiBottom = Math.max(0, content.bottom - (safe.bottom || 0))
    } else {
      // Старые клиенты без contentSafeAreaInset — консервативный запас под шапку
      uiTop = 56
      uiBottom = 0
    }
  }

  root.style.setProperty('--tg-top', uiTop + 'px')
  root.style.setProperty('--tg-bottom', uiBottom + 'px')
}

applyInsets()

if (tg) {
  try { tg.ready() } catch {}
  try { tg.expand() } catch {}
  try { tg.disableVerticalSwipes() } catch {}
  const events = ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged']
  events.forEach((e) => { try { tg.onEvent(e, applyInsets) } catch {} })
}

window.addEventListener('resize', applyInsets)
window.addEventListener('orientationchange', applyInsets)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)