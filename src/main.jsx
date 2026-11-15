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
    // Настраиваем нативную кнопку "Назад" Telegram
  tg.BackButton.onClick(() => {
    // Это событие будет перехвачено в App.jsx через window.__onTelegramBack
    if (window.__onTelegramBack) {
      window.__onTelegramBack();
    }
  });

  // 🔑 Определяем, сколько места занимает шапка Telegram
  function updateHeaderOffset() {
    const isMobile = ['android', 'ios', 'iphone'].includes(tg.platform);
    let offset = 0;
    if (isMobile) {
      // Реальные отступы от Telegram (статус-бар + шапка с кнопками)
      const inset = tg.contentSafeAreaInset?.top ?? tg.safeAreaInset?.top;
      offset = inset ?? 90; // fallback, если API не вернул данные
    }
    // На web / tdesktop / macos / windows шапки нет → offset = 0
    document.documentElement.style.setProperty('--tg-header-offset', `${offset}px`);
  }

  updateHeaderOffset();
  tg.onEvent('viewportChanged', updateHeaderOffset);
}

// Рендер приложения
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)