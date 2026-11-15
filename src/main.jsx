import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// --- Инициализация Telegram Web App ---
if (window.Telegram && window.Telegram.WebApp) {
  const tg = window.Telegram.WebApp;
  tg.ready();   // «Я загрузился, покажи меня»
  tg.expand();  // «Займи весь экран»

  // Подстраиваем цвета под тему пользователя (тёмная/светлая)
  const bg = tg.themeParams.bg_color || '#0f0f0f';
  const text = tg.themeParams.text_color || '#ffffff';
  document.documentElement.style.setProperty('--bg', bg);
  document.documentElement.style.setProperty('--text', text);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)