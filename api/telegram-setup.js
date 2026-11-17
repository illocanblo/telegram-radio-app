/**
 * Первичная настройка бота через Bot API с проверкой ключа владельца.
 */

import { tgCfg, botReady, safeEqual, validWebhookSecret, botApi } from '../lib/telegram.js'

const PRIVATE_COMMANDS = [
  { command: 'start', description: 'Открыть радио-архив' },
  { command: 'radio', description: 'Случайный релиз, играет подряд' },
  { command: 'catalog', description: 'Весь каталог лейбла' },
  { command: 'find', description: 'Поиск: /find glitch' },
  { command: 'favorites', description: 'Избранные релизы' },
  { command: 'help', description: 'Как пользоваться' },
]

const GROUP_COMMANDS = [
  { command: 'radio', description: 'Случайный релиз лейбла' },
  { command: 'catalog', description: 'Каталог архива' },
  { command: 'find', description: 'Поиск релизов: /find sij' },
  { command: 'help', description: 'Справка по боту' },
]

function getAppUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

function ownerInfo(me) {
  return {
    id: me.id,
    username: me.username,
    can_join_groups: me.can_join_groups,
    can_read_all_group_messages: me.can_read_all_group_messages,
    supports_inline_queries: me.supports_inline_queries,
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }

  const c = tgCfg()
  if (!c.ownerKey) return res.status(503).json({ error: 'owner_key_not_configured' })
  const given = String(req.headers['x-admin-key'] || req.headers['x-stats-key'] || '').trim()
  if (!safeEqual(given, c.ownerKey)) return res.status(401).json({ error: 'unauthorized' })
  if (!botReady()) return res.status(503).json({ error: 'bot_not_configured', need: ['BOT_TOKEN', 'BOT_USERNAME', 'APP_URL'] })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(400).json({ error: 'invalid_json' }) }
  }
  if (body != null && (typeof body !== 'object' || Array.isArray(body))) {
    return res.status(400).json({ error: 'invalid_body' })
  }
  const action = String(body?.action || 'info').toLowerCase()
  const actions = ['info', 'webhook', 'commands', 'menu', 'all', 'delete']
  if (!actions.includes(action)) return res.status(400).json({ error: 'unknown_action', allowed: actions })

  const appUrl = getAppUrl(c.appUrl)
  if (!appUrl) return res.status(400).json({ error: 'app_url_invalid', hint: 'APP_URL must be an HTTPS origin without path, query, or fragment' })
  const webhookUrl = `${appUrl}/api/telegram`
  const needsWebhook = action === 'webhook' || action === 'all'
  if (needsWebhook && !validWebhookSecret(c.secret || '')) {
    return res.status(503).json({ error: c.secret ? 'webhook_secret_format' : 'webhook_secret_not_configured', need: ['TELEGRAM_WEBHOOK_SECRET'] })
  }

  try {
    if (action === 'info') {
      const [me, webhook, commandsPrivate, commandsGroup] = await Promise.all([
        botApi('getMe'),
        botApi('getWebhookInfo'),
        botApi('getMyCommands', { scope: { type: 'all_private_chats' } }),
        botApi('getMyCommands', { scope: { type: 'all_group_chats' } }),
      ])
      return res.status(200).json({
        ok: true,
        webhookUrl,
        me: ownerInfo(me),
        webhook,
        commands_private: commandsPrivate,
        commands_group: commandsGroup,
      })
    }

    if (action === 'all') {
      const [setWebhook, privateResult, groupResult, menu] = await Promise.all([
        botApi('setWebhook', {
          url: webhookUrl,
          secret_token: c.secret,
          allowed_updates: ['message', 'my_chat_member', 'inline_query'],
          max_connections: 20,
        }),
        botApi('setMyCommands', { commands: PRIVATE_COMMANDS, scope: { type: 'all_private_chats' } }),
        botApi('setMyCommands', { commands: GROUP_COMMANDS, scope: { type: 'all_group_chats' } }),
        botApi('setChatMenuButton', {
          menu_button: { type: 'web_app', text: 'Слушать', web_app: { url: appUrl } },
        }),
      ])
      const [me, webhook, commandsPrivate, commandsGroup] = await Promise.all([
        botApi('getMe'),
        botApi('getWebhookInfo'),
        botApi('getMyCommands', { scope: { type: 'all_private_chats' } }),
        botApi('getMyCommands', { scope: { type: 'all_group_chats' } }),
      ])
      return res.status(200).json({
        ok: true,
        webhookUrl,
        setWebhook,
        private: privateResult,
        group: groupResult,
        menu,
        me: ownerInfo(me),
        webhook,
        commands_private: commandsPrivate,
        commands_group: commandsGroup,
      })
    }

    if (action === 'webhook') {
      const setWebhook = await botApi('setWebhook', {
        url: webhookUrl,
        secret_token: c.secret,
        allowed_updates: ['message', 'my_chat_member', 'inline_query'],
        max_connections: 20,
      })
      const webhook = await botApi('getWebhookInfo')
      return res.status(200).json({ ok: true, webhookUrl, setWebhook, webhook })
    }

    if (action === 'commands') {
      const [privateResult, groupResult] = await Promise.all([
        botApi('setMyCommands', { commands: PRIVATE_COMMANDS, scope: { type: 'all_private_chats' } }),
        botApi('setMyCommands', { commands: GROUP_COMMANDS, scope: { type: 'all_group_chats' } }),
      ])
      return res.status(200).json({ ok: true, webhookUrl, private: privateResult, group: groupResult })
    }

    if (action === 'menu') {
      const menu = await botApi('setChatMenuButton', {
        menu_button: { type: 'web_app', text: 'Слушать', web_app: { url: appUrl } },
      })
      return res.status(200).json({ ok: true, webhookUrl, menu })
    }

    const deleteWebhook = await botApi('deleteWebhook')
    return res.status(200).json({ ok: true, webhookUrl, deleteWebhook })
  } catch (e) {
    return res.status(502).json({ error: 'bot_api_failed', detail: String(e?.message || e).slice(0, 300) })
  }
}
