# Nenormalizm Recs Radio

Радио-плеер и Telegram Mini App для каталога Nenormalizm Recs на archive.org.
Каталог и аудиофайлы загружаются напрямую из archive.org; Vercel используется
для API вебхука бота, проверок доступа и необязательной статистики.

## Возможности

- Поиск, фильтрация, избранное и страницы релизов.
- Непрерывное воспроизведение с очередью, перемешиванием, повтором, громкостью,
  восстановлением позиции и скачиванием прослушанных треков.
- Telegram Mini App: deep links, CloudStorage, нативные кнопки, полноэкранный
  режим и системные Media Session metadata/controls там, где их поддерживает
  клиент.
- Telegram-бот: команды каталога и радио, поиск, inline-режим и webhook.
- Owner-разделы статистики и ссылок; необязательная агрегированная статистика
  через Vercel Serverless Functions и Upstash Redis.

Media Session — best effort: она передаёт метаданные и команды системному
интерфейсу, но не может запретить Telegram или Android приостанавливать Mini App
в фоне. Надёжное воспроизведение при заблокированном экране зависит от клиента и
ОС; гарантировать его средствами Mini App нельзя.

## Требования и локальная разработка

Для Vite 8 используйте Node.js **20.19+ или 22.12+**; для Vercel рекомендуется
Node.js 22.x. Telegram API также использует `AbortSignal.timeout`.

```powershell
npm install
npm run dev
npm test
npm run lint
npm run build
npm run preview
```

## Архитектура

- `src/App.jsx` — интерфейс, маршруты, загрузка каталога и плеер.
- `src/mediasession.js`, `src/telegram.js`, `src/sync.js` — интеграции с
  системными media controls, Telegram Mini Apps и CloudStorage.
- `api/` — Vercel Serverless endpoints; `lib/` — серверные помощники Telegram
  и Upstash Redis.
- `src/index.css` — основной дизайн-системный stylesheet.
- `docs/` — инструкции по настройке бота и интеграции с archive.org.

## Настройка Vercel

Добавляйте переменные в **Vercel → Project → Settings → Environment Variables**,
затем делайте Redeploy. Секреты должны быть только на сервере: не добавляйте их в
`VITE_*`, исходный код или коммитимые `.env`-файлы.

Переменные бота:

| Переменная | Назначение |
| --- | --- |
| `BOT_TOKEN` | Токен BotFather; обязателен для API бота |
| `BOT_USERNAME` | Имя бота без `@` |
| `APP_URL` | HTTPS origin Mini App без пути, query и завершающего слеша |
| `APP_SHORT_NAME` | Необязательное short name Mini App |
| `TELEGRAM_WEBHOOK_SECRET` | Секрет webhook; обязателен для регистрации webhook |
| `ADMIN_KEY` | Доступ к owner-разделам и настройке бота; задайте отдельно от других ключей |

Настройка бота также может использовать `STATS_KEY` как запасной owner key,
если `ADMIN_KEY` не задан. Для owner-разделов приложения задавайте `ADMIN_KEY`.
Создавайте независимые случайные значения для `ADMIN_KEY`, `STATS_KEY` и
`TELEGRAM_WEBHOOK_SECRET`.

Переменные необязательной статистики:

| Переменная | Назначение |
| --- | --- |
| `TELEMETRY=1` | Включает сбор агрегированных событий |
| `STATS_KEY` | Защищает чтение статистики |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL; допускаются `KV_REST_API_URL` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token; допускаются `KV_REST_API_TOKEN` |

После настройки production-переменных и деплоя зарегистрируйте webhook и
команды запросом `POST /api/telegram-setup` с заголовком `x-admin-key` и телом
`{"action":"all"}`. Подробнее — в
[docs/TELEGRAM_BOT_IMPLEMENTATION.md](./docs/TELEGRAM_BOT_IMPLEMENTATION.md).

## Деплой

Проект собирается Vercel из ветки `main`. Проверьте Node.js 22.x в настройках
проекта, настройте переменные для Production и дождитесь статуса **Ready**.
После изменения env выполните новый Redeploy. Перед отправкой изменений запускайте
`npm test`, `npm run lint` и `npm run build`.

## Документация

- [Настройка Telegram-бота](./docs/TELEGRAM_BOT_IMPLEMENTATION.md)
- [Интеграция с archive.org](./docs/archive-org-integration.md)
