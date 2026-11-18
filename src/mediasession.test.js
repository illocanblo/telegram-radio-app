import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindMediaSession } from './mediasession.js'

let mediaSession
let audio
let state
let onSeek
let onStop
let cleanup

beforeEach(() => {
  const handlers = new Map()
  mediaSession = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: vi.fn((action, handler) => {
      if (handler) handlers.set(action, handler)
      else handlers.delete(action)
    }),
    setPositionState: vi.fn(),
    handlers,
  }
  audio = new EventTarget()
  Object.assign(audio, {
    currentTime: 12,
    duration: 100,
    playbackRate: 1,
    paused: false,
  })
  state = { title: 'Track', artist: 'Artist', album: 'Album', artwork: 'https://example.test/cover.jpg' }
  onSeek = vi.fn((position) => { audio.currentTime = position })
  onStop = vi.fn()
  vi.stubGlobal('navigator', { mediaSession })
  vi.stubGlobal('MediaMetadata', class {
    constructor(value) { Object.assign(this, value) }
  })
  cleanup = bindMediaSession({
    audio,
    getState: () => state,
    onSeek,
    onStop,
  })
})

afterEach(() => {
  cleanup?.()
  vi.unstubAllGlobals()
})

describe('Media Session binding', () => {
  it('sets track metadata and reports the current playback position', () => {
    expect(mediaSession.metadata).toMatchObject({
      title: 'Track',
      artist: 'Artist',
      album: 'Album',
    })
    expect(mediaSession.playbackState).toBe('playing')

    audio.currentTime = 24
    audio.dispatchEvent(new Event('timeupdate'))

    expect(mediaSession.setPositionState).toHaveBeenLastCalledWith({
      duration: 100,
      playbackRate: 1,
      position: 24,
    })
  })

  it('clamps seek actions to the current track duration', () => {
    mediaSession.handlers.get('seekbackward')({ seekOffset: 30 })
    expect(onSeek).toHaveBeenLastCalledWith(0)

    mediaSession.handlers.get('seekforward')({ seekOffset: 200 })
    expect(onSeek).toHaveBeenLastCalledWith(100)

    mediaSession.handlers.get('seekto')({ seekTime: 45 })
    expect(onSeek).toHaveBeenLastCalledWith(45)
  })

  it('forwards the stop action to the player', () => {
    mediaSession.handlers.get('stop')()
    expect(onStop).toHaveBeenCalledOnce()
    expect(mediaSession.playbackState).toBe('paused')
  })

  it('clears metadata and position when the current track is removed', () => {
    state = null
    audio.dispatchEvent(new Event('emptied'))

    expect(mediaSession.metadata).toBeNull()
    expect(mediaSession.playbackState).toBe('none')
    expect(mediaSession.setPositionState).toHaveBeenLastCalledWith({})
  })

  it('removes handlers and event listeners when unbound', () => {
    cleanup()
    cleanup = null

    expect(mediaSession.handlers.size).toBe(0)
    expect(mediaSession.metadata).toBeNull()
    expect(mediaSession.playbackState).toBe('none')
  })
})
