import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const root = document.documentElement
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null

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

/**
 * contentSafeAreaInset.top — полный отступ сверху: системный статус-бар
 * вместе с шапкой Telegram. Ничего не вычитаем и не прибавляем env() сверху.
 */
function applyInsets() {
  if (!inTelegram) {
    root.style.removeProperty('--tg-top')
    root.style.removeProperty('--tg-bottom')
    return
  }
  const c = tg.contentSafeAreaInset
  const has = c && (c.top || c.bottom || c.left || c.right)
  if (has) {
    root.style.setProperty('--tg-top', `${c.top || 0}px`)
    root.style.setProperty('--tg-bottom', `${c.bottom || 0}px`)
  } else {
    root.style.setProperty('--tg-top', '56px')
    root.style.setProperty('--tg-bottom', '0px')
  }
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)