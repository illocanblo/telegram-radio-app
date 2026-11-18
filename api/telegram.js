/**
 * Bot webhook: commands in private chats and groups, a greeting when the bot
 * is added to a chat, and inline release search for sharing into any chat
 * without adding the bot as a member.
 *
 * IMPORTANT: inline web_app buttons do not work in groups. In groups only
 * url buttons with direct links t.me/<bot>/<app>?startapp=... are used.
 *
 * ENV: BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, BOT_USERNAME, APP_SHORT_NAME, APP_URL
 */

import {
  tgCfg, botReady, safeEqual, botApi, catalog, searchCatalog,
  linkFor, webAppLink, albumLink, albumCardHtml, coverUrl, asText, catalogOf, yearOf,
  validWebhookSecret,
  stripCatalog, escHtml,
} from '../lib/telegram.js'

const cooldown = new Map()
const COOLDOWN_MS = 1200

function throttled(key) {
  const now = Date.now()
  const last = cooldown.get(key) || 0
  if (now - last < COOLDOWN_MS) return true
  cooldown.set(key, now)
  if (cooldown.size > 500) {
    for (const [k, t] of cooldown) if (now - t > 60000) cooldown.delete(k)
  }
  return false
}

const urlBtn = (text, param) => ({ text, url: linkFor(param) })
const webAppBtn = (text, param = '') => ({ text, web_app: { url: webAppLink(param) } })
const albumBtn = (text, id) => ({ text, url: albumLink(id) })
const appBtn = (isPrivate, text, param) => isPrivate ? webAppBtn(text, param) : urlBtn(text, param)

function mainKeyboard(isPrivate) {
  const rows = []
  if (isPrivate) {
    rows.push([webAppBtn('🎧 Открыть плеер')])
  }
  rows.push([
    appBtn(isPrivate, '📻 Радио', 'r'),
    appBtn(isPrivate, '📚 Каталог', ''),
  ])
  rows.push([appBtn(isPrivate, '♥ Избранное', 'f')])
  return { inline_keyboard: rows }
}

const HELP_PRIVATE = [
  '<b>Nenormalizm Recs — радио-архив лейбла</b>',
  '',
  '125+ релизов IDM, glitch, ambient и экспериментальной электроники. Бесплатно, без регистрации.',
  '',
  '<b>Команды</b>',
  '/radio — случайный релиз, играет подряд весь каталог',
  '/catalog — весь каталог',
  '/find <i>запрос</i> — поиск по названию, артисту и тегам',
  '/favorites — избранное',
  '/help — эта справка',
  '',
  '<b>Кнопки:</b> «Открыть плеер» — архив; «Радио» — случайный релиз и непрерывное воспроизведение; «Каталог» — весь архив; «Избранное» — отмеченные релизы.',
  '',
  'В любом чате можно набрать <code>@бот запрос</code> и отправить релиз собеседнику — бота не нужно добавлять в чат.',
].join('\n')

const HELP_GROUP = [
  '<b>Nenormalizm Recs — радио-архив лейбла</b>',
  '',
  '/radio — случайный релиз',
  '/catalog — каталог',
  '/find <i>запрос</i> — поиск релизов',
  '',
  'Или наберите <code>@бот запрос</code> прямо в поле сообщения, чтобы отправить релиз в чат.',
].join('\n')

async function send(chatId, text, keyboard, extra = {}) {
  return botApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: keyboard,
    link_preview_options: { is_disabled: true },
    ...extra,
  })
}

async function handleCommand(message) {
  const chat = message.chat || {}
  const isPrivate = chat.type === 'private'
  const raw = String(message.text || '').trim()
  const [head, ...rest] = raw.split(/\s+/)
  const cmd = head.split('@')[0].toLowerCase()
  const arg = rest.join(' ').trim()
  const startPayload = cmd === '/start' ? arg : ''

  if (throttled(`c:${chat.id}`)) return

  if (startPayload) {
    const link = linkFor(startPayload)
    if (link) {
      return send(chat.id, 'Открываю нужный экран архива.', { inline_keyboard: [[{ text: '▶ Продолжить', url: link }]] })
    }
  }

  if (cmd === '/help') return send(chat.id, isPrivate ? HELP_PRIVATE : HELP_GROUP, mainKeyboard(isPrivate))

  if (cmd === '/radio') {
    return send(chat.id, '<b>Радио</b> — случайный релиз, дальше играет весь каталог подряд.', {
      inline_keyboard: [[appBtn(isPrivate, '📻 Включить радио', 'r')], [appBtn(isPrivate, '📚 Каталог', '')]],
    })
  }

  if (cmd === '/favorites') {
    return send(chat.id, '<b>Избранное</b> — релизы, отмеченные сердцем. Синхронизируется между вашими устройствами в Telegram.', {
      inline_keyboard: [[appBtn(isPrivate, '♥ Открыть избранное', 'f')]],
    })
  }

  if (cmd === '/find' || cmd === '/search') {
    if (!arg) {
      return send(chat.id, 'Напишите запрос: <code>/find glitch</code> или <code>/find sij</code>', mainKeyboard(isPrivate))
    }
    const items = await catalog()
    const found = searchCatalog(items, arg, 5)
    if (!found.length) {
      return send(chat.id, `По запросу «${escHtml(arg)}» ничего не нашлось.`, { inline_keyboard: [[appBtn(isPrivate, '📚 Открыть каталог', '')]] })
    }
    const rows = found.map((a) => [albumBtn(`${catalogOf(a)} · ${(stripCatalog(a.title) || a.identifier).slice(0, 42)}`, a.identifier)])
    return send(chat.id, `Нашлось ${found.length} по запросу «${escHtml(arg)}»:`, { inline_keyboard: rows })
  }

  if (cmd === '/catalog' || cmd === '/start') {
    if (!isPrivate && cmd === '/start') return send(chat.id, HELP_GROUP, mainKeyboard(false))
    return send(chat.id, isPrivate ? HELP_PRIVATE : HELP_GROUP, mainKeyboard(isPrivate))
  }

  if (isPrivate) return send(chat.id, HELP_PRIVATE, mainKeyboard(true))
}

async function handleMembership(update) {
  const m = update.my_chat_member
  if (!m) return
  const chat = m.chat || {}
  const status = m.new_chat_member?.status
  const isGroup = chat.type === 'group' || chat.type === 'supergroup'
  if (!isGroup) return
  if (status !== 'member' && status !== 'administrator') return
  if (throttled(`g:${chat.id}`)) return
  const text = [
    '<b>Nenormalizm Recs подключён</b>',
    '',
    'Радио-архив лейбла: 125+ релизов IDM, glitch и ambient.',
    'Бот не читает переписку — отвечает только на команды.',
    '',
    '/radio · /catalog · /find <i>запрос</i>',
    'Или <code>@бот запрос</code> в поле сообщения, чтобы отправить релиз в чат.',
  ].join('\n')
  await send(chat.id, text, mainKeyboard(false))
}

async function handleInline(update) {
  const iq = update.inline_query
  if (!iq) return
  const q = String(iq.query || '').trim()
  const items = await catalog()
  const found = searchCatalog(items, q, 10)

  const results = found.map((a) => ({
    type: 'article',
    id: String(a.identifier).slice(0, 64),
    title: (stripCatalog(a.title) || a.identifier).slice(0, 120),
    description: [asText(a.creator) || 'Various Artists', yearOf(a), catalogOf(a)].filter(Boolean).join(' · ').slice(0, 200),
    thumbnail_url: coverUrl(a.identifier),
    thumbnail_width: 200,
    thumbnail_height: 200,
    input_message_content: {
      message_text: albumCardHtml(a),
      parse_mode: 'HTML',
      link_preview_options: { url: coverUrl(a.identifier), prefer_large_media: true },
    },
    reply_markup: { inline_keyboard: [[albumBtn('▶ Слушать', a.identifier)]] },
  }))

  if (!results.length) {
    results.push({
      type: 'article',
      id: 'open-catalog',
      title: q ? `Ничего не нашлось по «${q.slice(0, 40)}»` : 'Открыть каталог архива',
      description: 'Отправить ссылку на весь каталог лейбла',
      input_message_content: {
        message_text: `<b>Nenormalizm Recs</b> — радио-архив лейбла\n\n<a href="${escHtml(linkFor(''))}">📚 Открыть каталог</a>`,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      },
      reply_markup: { inline_keyboard: [[urlBtn('📚 Каталог', ''), urlBtn('📻 Радио', 'r')]] },
    })
  }

  await botApi('answerInlineQuery', {
    inline_query_id: iq.id,
    results,
    cache_time: 300,
    is_personal: false,
  })
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  if (!botReady()) return res.status(503).json({ error: 'bot_not_configured' })

  const c = tgCfg()
  if (!validWebhookSecret(c.secret || '')) return res.status(503).json({ error: 'webhook_secret_not_configured' })
  const got = String(req.headers['x-telegram-bot-api-secret-token'] || '')
  if (!safeEqual(got, c.secret)) return res.status(401).end()

  let update = req.body
  if (typeof update === 'string') {
    try { update = JSON.parse(update) } catch { return res.status(400).end() }
  }
  if (!update || typeof update !== 'object' || Array.isArray(update)) return res.status(400).end()

  try {
    if (update.inline_query) await handleInline(update)
    else if (update.my_chat_member) await handleMembership(update)
    else if (update.message?.text?.startsWith('/')) await handleCommand(update.message)
  } catch {
    console.error('Telegram webhook processing failed', { updateId: update.update_id })
    return res.status(500).end()
  }
  return res.status(200).end()
}