import { describe, expect, it } from 'vitest'
import { META_VER, parseStoredMeta } from './albumMetaCache.js'

describe('parseStoredMeta', () => {
  it('rejects older cache versions and records missing required arrays', () => {
    const validData = { tracks: [], subjects: [] }

    expect(parseStoredMeta(JSON.stringify({ v: 1, ts: Date.now(), d: validData }))).toBeNull()
    expect(parseStoredMeta(JSON.stringify({ v: META_VER, ts: Date.now(), d: { tracks: [] } }))).toBeNull()
    expect(parseStoredMeta(JSON.stringify({ v: META_VER, ts: Date.now(), d: { subjects: [] } }))).toBeNull()
  })

  it('returns a current cache record with tracks and subjects', () => {
    const data = { tracks: [], subjects: ['ambient'] }

    expect(parseStoredMeta(JSON.stringify({ v: META_VER, ts: Date.now(), d: data }))).toEqual(data)
  })

  it('rejects expired or malformed cache records', () => {
    expect(parseStoredMeta(JSON.stringify({ v: META_VER, ts: 1, d: { tracks: [], subjects: [] } }))).toBeNull()
    expect(parseStoredMeta('{')).toBeNull()
  })
})
