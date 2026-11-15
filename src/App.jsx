/* ПРОВЕРКА ОБНОВЛЕНИЯ V4 */

import { useState, useRef, useEffect } from 'react'

function shuffleArray(array) {
  const newArr = [...array]
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[newArr[i], newArr[j]] = [newArr[j], newArr[i]]
  }
  return newArr
}

function cleanDescription(raw) {
  if (!raw) return ''
  let text = Array.isArray(raw) ? raw.join('\n') : String(raw)
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|ul|ol|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
  text = text.split('\n').map(l => l.trim()).join('\n')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

// Нормализует поля, которые Archive.org может вернуть массивом
function normalizeField(raw, sep = ', ') {
  if (!raw) return ''
  return Array.isArray(raw) ? raw.join(sep) : String(raw)
}

// Извлекает исполнителя из title формата "[NrM081] Hobotek - Mutual Kitchen (Label)"
function extractArtistFromTitle(title) {
  if (!title) return ''
  const cleaned = String(title)
    .replace(/^\[[^\]]*\]\s*/, '')   // убрать каталог-номер [NrM081]
    .replace(/\([^)]*\)\s*$/, '')    // убрать (Nenormalizm Records)
    .trim()
  const parts = cleaned.split(/\s+-\s+/)
  if (parts.length >= 2) {
    const artist = parts[0].trim()
    // Компиляции помечаем единообразно
    if (/^(VA|V\/A|Various Artists)$/i.test(artist)) return 'Various Artists'
    return artist
  }
  return ''
}

export default function App() {
  const [view, setView] = useState('albums')
  const [albums, setAlbums] = useState([])

  const [currentAlbum, setCurrentAlbum] = useState(null)
  const [viewedAlbum, setViewedAlbum] = useState(null)

  const [allTracks, setAllTracks] = useState([])
  const [playlist, setPlaylist] = useState([])
  const [viewedTracks, setViewedTracks] = useState([])

  const [currentTrack, setCurrentTrack] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isShuffle, setIsShuffle] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [autoPlayPending, setAutoPlayPending] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const audioRef = useRef(null)

  const UPLOADERS = [
    { email: 'nenormalizm@gmail.com', name: 'Nenormalizm Records' },
    { email: 'nenormalizmlab@gmail.com', name: 'Nenormalizm Lab' },
    { email: 'sobrio21@yandex.ru', name: 'Sobrio21' },
  ]

  useEffect(() => {
    async function fetchAlbums() {
      try {
        const orClause = UPLOADERS.map(u => `uploader:"${u.email}"`).join(' OR ')
        const query = `(${orClause}) AND mediatype:"audio"`
        const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier,title,mediatype,uploader&rows=200&output=json`
        const res = await fetch(url)
        const data = await res.json()
        if (data.response.numFound === 0) {
          setError('Аудиоальбомы не найдены')
        } else {
          setAlbums(data.response.docs)
        }
      } catch (e) {
        setError('Не удалось связаться с архивом. Проверьте соединение 📡')
      } finally {
        setLoading(false)
      }
    }
    fetchAlbums()
  }, [])

  useEffect(() => {
    if (autoPlayPending && audioRef.current) {
      audioRef.current.play()
        .then(() => { setAutoPlayPending(false); setIsPlaying(true) })
        .catch(err => {
          console.warn('Автоплей заблокирован браузером:', err)
          setAutoPlayPending(false)
          setIsPlaying(false)
        })
    }
  }, [currentTrack, autoPlayPending])

  function extractTracks(data, album) {
    if (!data || !Array.isArray(data.files)) return []
    const audioFiles = data.files.filter(f =>
      ['VBR MP3', 'MP3', 'Ogg Vorbis', 'M4A', 'AAC', 'Flac', 'Shorten'].includes(f.format)
    )
    const uniqueTracksMap = new Map()
    audioFiles.forEach(f => {
      const parts = f.name.split('/')
      const title = parts[parts.length - 1].replace(/\.[^/.]+$/, '')
      if (!uniqueTracksMap.has(title)) {
        uniqueTracksMap.set(title, {
          ...f,
          url: `https://archive.org/download/${album.identifier}/${f.name}`,
          title,
          folder: parts.length > 1 ? parts.slice(0, -1).join('/') : 'root'
        })
      }
    })
    const tracks = Array.from(uniqueTracksMap.values())
    tracks.sort((a, b) => a.name.localeCompare(b.name))
    return tracks
  }

  async function openAlbum(album, autoPlay = false) {
    setLoading(true)
    setError('')
    setDescExpanded(false)
    try {
      const res = await fetch(`https://archive.org/metadata/${album.identifier}`)
      const data = await res.json()
      const tracks = extractTracks(data, album)

      if (tracks.length === 0) {
        setAlbums(prev => prev.filter(a => a.identifier !== album.identifier))
        setError(`Релиз "${album.title || album.identifier}" не содержит аудиофайлов и был скрыт из списка.`)
        setLoading(false)
        return
      }

            const rawTitle = normalizeField(data.metadata.title) || album.title || album.identifier

      // Цепочка fallback: явный artist → парсинг title → creator → заглушка
      const artist =
        normalizeField(data.metadata.artist) ||
        extractArtistFromTitle(rawTitle) ||
        normalizeField(data.metadata.creator) ||
        'Various Artists'

      const albumData = {
        ...album,
        title: rawTitle,
        artist,
        cover: `https://archive.org/services/img/${album.identifier}`,
        description: cleanDescription(data.metadata.description) || 'Описание отсутствует'
      }

      setViewedAlbum(albumData)
      setViewedTracks(tracks)
      setView('tracks')

      if (autoPlay) {
        setAllTracks(tracks)
        setPlaylist(tracks)
        setCurrentAlbum(albumData)
        setCurrentTime(0)
        setDuration(0)
        setCurrentTrack(tracks[0])
        setAutoPlayPending(true)
        if (isShuffle) setIsShuffle(false)
      }
    } catch (e) {
      console.error('Ошибка при загрузке альбома:', e)
      setError(`Ошибка загрузки треков альбома: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  function haptic(type = 'light') {
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred(type)
    }
  }

  function playTrack(track, autoPlay = false) {
    haptic('medium')
    setCurrentTrack(track)
    setCurrentTime(0)
    if (autoPlay) {
      setAutoPlayPending(true)
    } else {
      setIsPlaying(true)
      setTimeout(() => audioRef.current?.play(), 0)
    }
  }

  // Без собственного haptic — его сделает playTrack (иначе двойная вибрация)
  function playTrackFromViewedAlbum(track) {
    if (viewedAlbum && currentAlbum?.identifier !== viewedAlbum.identifier) {
      setAllTracks(viewedTracks)
      setPlaylist(viewedTracks)
      setCurrentAlbum(viewedAlbum)
      if (isShuffle) setIsShuffle(false)
    }
    playTrack(track, true)
  }

  function togglePlay() {
    if (!currentTrack && playlist.length > 0) {
      playTrack(playlist[0], true)
      return
    }
    haptic('medium')
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
    } else {
      audioRef.current?.play()
      setIsPlaying(true)
    }
  }

  function formatTime(sec) {
    if (!sec || isNaN(sec)) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function handleSeek(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    if (audioRef.current && duration) {
      audioRef.current.currentTime = ratio * duration
      setCurrentTime(ratio * duration)
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged()
      }
    }
  }

  async function playNextAlbum() {
    if (!currentAlbum || albums.length === 0) return
    const currentIndex = albums.findIndex(a => a.identifier === currentAlbum.identifier)
    const nextIndex = (currentIndex + 1) % albums.length
    await openAlbum(albums[nextIndex], true)
  }

  function playNext() {
    if (!currentTrack || playlist.length === 0) return
    const idx = playlist.findIndex(t => t.name === currentTrack.name)
    if (idx < playlist.length - 1) {
      playTrack(playlist[idx + 1], true)
    } else {
      playNextAlbum()
    }
  }

  function playPrev() {
    if (!currentTrack || playlist.length === 0) return
    const idx = playlist.findIndex(t => t.name === currentTrack.name)
    const prevIdx = (idx - 1 + playlist.length) % playlist.length
    playTrack(playlist[prevIdx], true)
  }

  function toggleShuffle() {
    haptic('light')
    const newShuffleState = !isShuffle
    setIsShuffle(newShuffleState)
    if (newShuffleState) {
      setPlaylist(shuffleArray(playlist))
    } else {
      setPlaylist([...allTracks])
    }
  }

  useEffect(() => {
    const audio = audioRef.current
    const handleEnded = () => playNext()
    audio?.addEventListener('ended', handleEnded)
    return () => audio?.removeEventListener('ended', handleEnded)
  }, [currentTrack, playlist])

  // --- РЕНДЕР ---
  return (
    <div>
      {/* Аудио с событиями для прогресс-бара */}
      <audio
        ref={audioRef}
        src={currentTrack?.url}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />

      {/* Шапка — ТОЛЬКО на экране альбомов */}
      {view === 'albums' && (
        <div className="header">
          <h1>📻 Nenormalizm Recs</h1>
          <p>{albums.length} альбомов из архива</p>
        </div>
      )}

      {/* Плавающая кнопка назад — ТОЛЬКО на экране треков */}
      {view === 'tracks' && (
        <button className="floating-back-btn" onClick={() => setView('albums')}>
          ← Назад к альбомам
        </button>
      )}

      {/* Экран списка альбомов */}
      {view === 'albums' && (
        <>
          {loading && (
            <div className="loader-container">
              <div className="loader"></div>
              <p className="loader-text">Собираем коллекцию из архива...</p>
            </div>
          )}
          {error && <div className="error">{error}</div>}
          <div className="albums-grid">
            {albums.map(album => {
              const isCurrentlyPlaying = currentAlbum?.identifier === album.identifier
              return (
                <div
                  key={album.identifier}
                  className={`album-card ${isCurrentlyPlaying ? 'currently-playing' : ''}`}
                  onClick={() => {
                    if (isCurrentlyPlaying) {
                      setViewedAlbum(currentAlbum)
                      setView('tracks')
                    } else {
                      openAlbum(album, false)
                    }
                  }}
                >
                  <img
                    className="album-cover"
                    src={`https://archive.org/services/img/${album.identifier}`}
                    alt={album.title}
                    onError={(e) => { e.target.src = 'https://via.placeholder.com/150/333/fff?text=No+Cover' }}
                  />
                  <div className="album-title">{album.title || album.identifier}</div>
                  {isCurrentlyPlaying && isPlaying && (
                    <div className="playing-badge">▶</div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Экран треков с HERO-секцией */}
      {view === 'tracks' && viewedAlbum && (
        <div className="tracks-view-container">
          <div className="album-hero">
            <img
              className="album-hero-bg"
              src={viewedAlbum.cover}
              alt=""
              aria-hidden="true"
              onError={(e) => { e.target.src = 'https://via.placeholder.com/400/333/fff?text=No+Cover' }}
            />
            <div className="album-hero-overlay"></div>

            <div className="album-hero-content">
              <img
                className="album-hero-cover"
                src={viewedAlbum.cover}
                alt={viewedAlbum.title}
                onError={(e) => { e.target.src = 'https://via.placeholder.com/240/333/fff?text=No+Cover' }}
              />
                            <h2 className="album-hero-title">{viewedAlbum.title}</h2>
              <div className="album-hero-subtitle">{viewedAlbum.artist}</div>
              <div className="album-hero-meta">
                {viewedAlbum.description && viewedAlbum.description !== 'Описание отсутствует' && (
                  <div className="album-description">
                    {viewedAlbum.description.length > 220 && !descExpanded
                      ? viewedAlbum.description.slice(0, 220) + '…'
                      : viewedAlbum.description}
                    {viewedAlbum.description.length > 220 && (
                      <button
                        className="desc-toggle"
                        onClick={() => setDescExpanded(!descExpanded)}
                      >
                        {descExpanded ? 'Свернуть ▲' : 'Показать полностью ▼'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="tracks-list">
            <h3 style={{ marginBottom: '12px', fontSize: '15px', color: 'var(--text-secondary)' }}>Треки</h3>
            {loading && (
              <div className="loader-container">
                <div className="loader"></div>
                <p className="loader-text">Готовим треклист и метаданные...</p>
              </div>
            )}
            {error && <div className="error">{error}</div>}
            {!loading && !error && viewedTracks.map((track, index) => (
              <div
                key={track.name}
                className={`track-item ${currentTrack?.name === track.name ? 'current' : ''}`}
                onClick={() => playTrackFromViewedAlbum(track)}
              >
                <span className="track-num">{index + 1}</span>
                <span className="track-title-text">{track.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Закреплённый плеер */}
      {currentTrack && currentAlbum && (
        <div className="sticky-player">
          <div
            className="player-info"
            onClick={() => { setViewedAlbum(currentAlbum); setView('tracks') }}
            title="Нажмите, чтобы открыть список треков текущего альбома"
          >
            <img className="player-cover" src={currentAlbum.cover} alt="cover" />
            <div className="player-text">
              <div className="player-title">{currentTrack.title}</div>
              <div className="player-album">{currentAlbum.title || 'Nenormalizm Recs'}</div>
            </div>
          </div>

          <div className="progress-row">
            <span className="time-label">{formatTime(currentTime)}</span>
            <div className="player-progress" onClick={handleSeek}>
              <div
                className="player-progress-fill"
                style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
              >
                <span className="progress-thumb"></span>
              </div>
            </div>
            <span className="time-label">{formatTime(duration)}</span>
          </div>

          <div className="player-controls">
            <button className={`ctrl-btn ${isShuffle ? 'active' : ''}`} onClick={toggleShuffle} title="Перемешать">🔀</button>
            <button className="ctrl-btn" onClick={playPrev}>⏮</button>
            <button className="ctrl-btn play" onClick={togglePlay}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="ctrl-btn" onClick={playNext}>⏭</button>
          </div>
        </div>
      )}
    </div>
  )
}