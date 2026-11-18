import { afterEach, describe, expect, it, vi } from 'vitest'
import { webAppLink } from './telegram.js'

afterEach(() => vi.unstubAllEnvs())

describe('Telegram Web App URLs', () => {
  it('preserves the requested screen and asks supported clients for fullscreen', () => {
    vi.stubEnv('APP_URL', 'https://radio.example/')

    expect(webAppLink('r')).toBe('https://radio.example/?nr=r&tgFullscreen=1')
  })

  it('marks the main app launch for fullscreen without adding a route', () => {
    vi.stubEnv('APP_URL', 'https://radio.example')

    expect(webAppLink('')).toBe('https://radio.example/?tgFullscreen=1')
  })
})
