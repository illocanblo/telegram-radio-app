import { describe, expect, it } from 'vitest'
import {
  PARAM_FAV,
  PARAM_RADIO,
  filtersForDeepLink,
  paramForAlbum,
  paramForDecade,
  paramForQuery,
  routeFromParam,
} from './deeplink.js'

describe('Telegram deep-link parameters', () => {
  it('round-trips an album identifier', () => {
    const param = paramForAlbum('release.glitch-2026')
    expect(param).toMatch(/^a_/)
    expect(routeFromParam(param)).toEqual({ name: 'album', id: 'release.glitch-2026' })
  })

  it('round-trips a search query', () => {
    const param = paramForQuery('glitch & ambient')
    expect(param).toMatch(/^q_/)
    expect(routeFromParam(param)).toEqual({
      name: 'library',
      id: null,
      action: 'search',
      value: 'glitch & ambient',
    })
  })

  it('recognizes radio and favorites actions', () => {
    expect(routeFromParam(PARAM_RADIO)).toEqual({ name: 'library', id: null, action: 'radio' })
    expect(routeFromParam(PARAM_FAV)).toEqual({ name: 'library', id: null, action: 'fav' })
  })

  it('resets incompatible saved filters when opening radio or favorites', () => {
    expect(filtersForDeepLink(routeFromParam(PARAM_RADIO))).toEqual({
      favOnly: false,
      era: 'all',
      query: '',
    })
    expect(filtersForDeepLink(routeFromParam(PARAM_FAV))).toEqual({
      favOnly: true,
      era: 'all',
      query: '',
    })
  })

  it('recognizes decade filters', () => {
    expect(routeFromParam(paramForDecade(1990))).toEqual({
      name: 'library',
      id: null,
      action: 'decade',
      value: '1990',
    })
  })

  it('rejects malformed parameters', () => {
    expect(routeFromParam('')).toBeNull()
    expect(routeFromParam('a_***')).toBeNull()
  })
})
