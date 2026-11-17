import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: {
    token: 'test-token',
    secret: 'valid_webhook_secret-123',
    bot: 'example_bot',
    app: 'radio',
    appUrl: 'https://radio.example',
    ownerKey: 'owner-secret',
  },
  botApi: vi.fn(),
}))

vi.mock('../lib/telegram.js', () => ({
  tgCfg: () => mocks.config,
  botReady: () => true,
  safeEqual: (a, b) => a === b,
  validWebhookSecret: (secret) => /^[A-Za-z0-9_-]{1,256}$/.test(secret),
  botApi: mocks.botApi,
  catalog: vi.fn(),
  searchCatalog: vi.fn(),
  linkFor: vi.fn(),
  albumLink: vi.fn(),
  albumCardHtml: vi.fn(),
  coverUrl: vi.fn(),
  asText: vi.fn(),
  catalogOf: vi.fn(),
  yearOf: vi.fn(),
  stripCatalog: vi.fn(),
  escHtml: vi.fn(),
}))

import webhookHandler from './telegram.js'
import setupHandler from './telegram-setup.js'

function response() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(value) { this.body = value; return this },
    end() { return this },
  }
}

describe('Telegram webhook and setup endpoints', () => {
  beforeEach(() => {
    mocks.config.secret = 'valid_webhook_secret-123'
    mocks.botApi.mockReset()
    mocks.botApi.mockImplementation(async (method) => method === 'getWebhookInfo' ? { url: 'https://radio.example/api/telegram' } : true)
  })

  it('fails closed when the webhook secret is missing', async () => {
    mocks.config.secret = ''
    const res = response()

    await webhookHandler({
      method: 'POST',
      headers: {},
      body: { update_id: 1 },
    }, res)

    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ error: 'webhook_secret_not_configured' })
    expect(mocks.botApi).not.toHaveBeenCalled()
  })

  it('rejects webhook requests with an incorrect secret', async () => {
    const res = response()

    await webhookHandler({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
      body: { update_id: 2 },
    }, res)

    expect(res.statusCode).toBe(401)
    expect(mocks.botApi).not.toHaveBeenCalled()
  })

  it('does not allow setup actions over GET', async () => {
    const res = response()

    await setupHandler({ method: 'GET', headers: {}, query: { action: 'delete' } }, res)

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('POST')
    expect(mocks.botApi).not.toHaveBeenCalled()
  })

  it('configures the webhook from APP_URL without dropping pending updates', async () => {
    const res = response()

    await setupHandler({
      method: 'POST',
      headers: { 'x-admin-key': 'owner-secret' },
      body: { action: 'webhook' },
    }, res)

    expect(res.statusCode).toBe(200)
    expect(mocks.botApi).toHaveBeenNthCalledWith(1, 'setWebhook', expect.objectContaining({
      url: 'https://radio.example/api/telegram',
      secret_token: 'valid_webhook_secret-123',
    }))
    expect(mocks.botApi.mock.calls[0][1]).not.toHaveProperty('drop_pending_updates')
  })
})
