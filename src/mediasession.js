/**
 * Подключает метаданные и системные команды управления воспроизведением.
 */
export function bindMediaSession({ audio, getState, onPlay, onPause, onStop, onPrev, onNext, onSeek }) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return () => {}

  const session = navigator.mediaSession
  if (!session || typeof session.setActionHandler !== 'function') return () => {}

  let lastKey = null

  const setPosition = () => {
    if (typeof session.setPositionState !== 'function' || !audio) return
    const duration = audio.duration
    if (!Number.isFinite(duration) || duration <= 0) return

    try {
      session.setPositionState({
        duration,
        playbackRate: Number.isFinite(audio.playbackRate) && audio.playbackRate !== 0 ? audio.playbackRate : 1,
        position: Math.min(Math.max(audio.currentTime || 0, 0), duration),
      })
    } catch {}
  }

  const updateMetadata = () => {
    let state = null
    try { state = getState?.() || null } catch {}

    if (!state?.title) {
      lastKey = null
      try { session.metadata = null } catch {}
      try { session.playbackState = 'none' } catch {}
      try { session.setPositionState?.({}) } catch {}
      return
    }

    const key = [state.title, state.artist, state.album, state.artwork].join('|')
    if (key !== lastKey) {
      lastKey = key
      if (typeof MediaMetadata !== 'undefined') {
        try {
          session.metadata = new MediaMetadata({
            title: state.title,
            artist: state.artist || 'Nenormalizm Recs',
            album: state.album || 'Nenormalizm Recs — archive radio',
            artwork: state.artwork
              ? [{ src: state.artwork, sizes: '512x512' }]
              : [],
          })
        } catch {}
      }
    }
    setPosition()
  }

  const setPlaybackState = (state) => {
    try { session.playbackState = state } catch {}
  }

  const seek = (value) => {
    if (!audio || !Number.isFinite(value)) return
    const duration = audio.duration
    if (!Number.isFinite(duration) || duration <= 0) return

    try {
      const position = Math.min(Math.max(value, 0), duration)
      onSeek?.(position)
      setPosition()
    } catch {}
  }

  const handlers = [
    ['play', () => onPlay?.()],
    ['pause', () => onPause?.()],
    ['stop', () => { onStop?.(); setPlaybackState('paused') }],
    ['previoustrack', () => onPrev?.()],
    ['nexttrack', () => onNext?.()],
    ['seekto', (details) => seek(details?.seekTime)],
    ['seekbackward', (details) => seek((audio?.currentTime || 0) - (details?.seekOffset || 10))],
    ['seekforward', (details) => seek((audio?.currentTime || 0) + (details?.seekOffset || 10))],
  ]

  handlers.forEach(([action, handler]) => {
    try { session.setActionHandler(action, handler) } catch {}
  })

  const onTimeUpdate = setPosition
  const onMetadataChange = () => { updateMetadata(); setPosition() }
  const onPlayEvent = () => { updateMetadata(); setPlaybackState('playing') }
  const onPauseEvent = () => setPlaybackState('paused')
  const onEnded = () => setPlaybackState('paused')
  const onEmptied = updateMetadata

  audio?.addEventListener('timeupdate', onTimeUpdate)
  audio?.addEventListener('durationchange', onMetadataChange)
  audio?.addEventListener('loadedmetadata', onMetadataChange)
  audio?.addEventListener('seeked', onTimeUpdate)
  audio?.addEventListener('play', onPlayEvent)
  audio?.addEventListener('pause', onPauseEvent)
  audio?.addEventListener('ended', onEnded)
  audio?.addEventListener('emptied', onEmptied)

  updateMetadata()
  setPlaybackState(lastKey === null ? 'none' : audio && !audio.paused ? 'playing' : 'paused')

  return () => {
    handlers.forEach(([action]) => {
      try { session.setActionHandler(action, null) } catch {}
    })
    audio?.removeEventListener('timeupdate', onTimeUpdate)
    audio?.removeEventListener('durationchange', onMetadataChange)
    audio?.removeEventListener('loadedmetadata', onMetadataChange)
    audio?.removeEventListener('seeked', onTimeUpdate)
    audio?.removeEventListener('play', onPlayEvent)
    audio?.removeEventListener('pause', onPauseEvent)
    audio?.removeEventListener('ended', onEnded)
    audio?.removeEventListener('emptied', onEmptied)
    try { session.metadata = null } catch {}
    try { session.playbackState = 'none' } catch {}
    try { session.setPositionState?.({}) } catch {}
  }
}
