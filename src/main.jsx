import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// --- Инициализация Telegram Web App ---
if (window.Telegram && window.Telegram.WebApp) {
  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();

  const bg = tg.themeParams.bg_color || '#121212';
  const text = tg.themeParams.text_color || '#ffffff';
  document.documentElement.style.setProperty('--bg', bg);
  document.documentElement.style.setProperty('--text', text);

  tg.setHeaderColor(bg);
  tg.setBackgroundColor(bg);
  tg.disableVerticalSwipes();

  // 🔑 Читаем реальные safe-зоны Telegram (включая его шапку)
  function updateSafeArea() {
    const c = tg.contentSafeAreaInset || tg.safeAreaInset || { top: 0, bottom: 0, left: 0, right: 0 };
    const s = tg.safeAreaInset || { top: 0, bottom: 0 };
    document.documentElement.style.setProperty('--tg-content-top', `${c.top}px`);
    document.documentElement.style.setProperty('--tg-content-bottom', `${c.bottom}px`);
    document.documentElement.style.setProperty('--tg-content-left', `${c.left}px`);
    document.documentElement.style.setProperty('--tg-content-right', `${c.right}px`);
    // Высота шапки Telegram = разница между contentSafe и safe
    const headerH = Math.max(0, c.top - s.top);
    document.documentElement.style.setProperty('--tg-header-height', `${headerH}px`);
  }

  updateSafeArea();
  tg.onEvent('viewportChanged', updateSafeArea); // обновлять при развороте/клавиатуре
}

// Рендер приложения
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)