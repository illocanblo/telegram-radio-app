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
  
  // 1. Принудительно превращаем в строку. 
  // Если это массив (частая особенность Archive.org), объединяем элементы через перенос строки.
  let text = Array.isArray(raw) ? raw.join('\n') : String(raw)
  
  // 2. Теперь безопасно применяем все замены
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
  
  // 3. Нормализуем пробелы и пустые строки
  text = text.split('\n').map(l => l.trim()).join('\n')
  text = text.replace(/\n{3,}/g, '\n\n')
  
  return text.trim()
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
        setError('Ошибка загрузки альбомов. Проверьте интернет.')
      } finally {
        setLoading(false)
      }
    }
    fetchAlbums()
  }, [])

  useEffect(() => {
    if (autoPlayPending && audioRef.current) {
      audioRef.current.play()
        .then(() => {
          setAutoPlayPending(false)
          setIsPlaying(true)
        })
        .catch(err => {
          console.warn('Автоплей заблокирован браузером:', err)
          setAutoPlayPending(false)
          setIsPlaying(false)
        })
    }
  }, [currentTrack, autoPlayPending])

  function extractTracks(data, album) {
    const audioFiles = data.files.filter(f => 
      ['VBR MP3', 'MP3', 'Ogg Vorbis', 'M4A', 'AAC', 'Flac'].includes(f.format)
    )

    const uniqueTracksMap = new Map()
    audioFiles.forEach(f => {
      const parts = f.name.split('/')
      const title = parts[parts.length - 1].replace(/\.[^/.]+$/, '')
      if (!uniqueTracksMap.has(title)) {
        uniqueTracksMap.set(title, {
          ...f,
          url: `https://archive.org/download/${album.identifier}/${f.name}`,
          title: title,
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
    try {
      const res = await fetch(`https://archive.org/metadata/${album.identifier}`)
      const data = await res.json()

      const tracks = extractTracks(data, album)

      if (tracks.length === 0) {
        setError('В этом альбоме нет поддерживаемых аудиофайлов')
        setLoading(false)
        return
      }

      const albumData = { 
        ...album, 
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
        setCurrentTrack(tracks[0])
        setAutoPlayPending(true)
        if (isShuffle) setIsShuffle(false)
      }
    } catch (e) {
      console.error('Ошибка при загрузке альбома:', e)
      const errorMessage = e.message || 'Неизвестная ошибка'
      setError(`Ошибка загрузки треков альбома: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  // Запуск трека БЕЗ автоматической синхронизации плейлиста
  function playTrack(track, autoPlay = false) {
    setCurrentTrack(track)
    if (autoPlay) {
      setAutoPlayPending(true)
    } else {
      setIsPlaying(true)
      setTimeout(() => audioRef.current?.play(), 0)
    }
  }

  // Синхронизация плейлиста при явном клике на трек
  function playTrackFromViewedAlbum(track) {
    // Если трек из просматриваемого альбома, а играет другой — синхронизируем
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
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
    } else {
      audioRef.current?.play()
      setIsPlaying(true)
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

  return (
    <div>
      <audio 
        ref={audioRef} 
        src={currentTrack?.url} 
        onPlay={() => setIsPlaying(true)} 
        onPause={() => setIsPlaying(false)}
      />

      <div className="header">
        {view === 'tracks' ? (
          <>
            <button className="back-btn" onClick={() => setView('albums')}>
              ← Назад к альбомам
            </button>
            <h1 style={{ fontSize: '16px', fontWeight: '600', marginTop: '4px' }}>
              {viewedAlbum?.title}
            </h1>
          </>
        ) : (
          <>
            <h1>📻 Nenormalizm Recs</h1>
            <p>{albums.length} альбомов из архива</p>
          </>
        )}
      </div>

      {view === 'albums' && (
        <>
          {loading && <div className="loading">Загрузка альбомов...</div>}
          {error && <div className="error">{error}</div>}
          <div className="albums-grid">
            {albums.map(album => {
              const isCurrentlyPlaying = currentAlbum?.identifier === album.identifier;
              return (
                <div 
                  key={album.identifier} 
                  className={`album-card ${isCurrentlyPlaying ? 'currently-playing' : ''}`}
                  onClick={() => {
                    if (isCurrentlyPlaying) {
                      setViewedAlbum(currentAlbum);
                      setView('tracks');
                    } else {
                      openAlbum(album, false);
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
              );
            })}
          </div>
        </>
      )}

      {view === 'tracks' && viewedAlbum && (
        <div className="tracks-view-container">
          <div className="album-details">
            <img 
              className="album-details-cover" 
              src={viewedAlbum.cover} 
              alt={viewedAlbum.title}
              onError={(e) => { e.target.src = 'https://via.placeholder.com/200/333/fff?text=No+Cover' }}
            />
            <div className="album-description">
              {viewedAlbum.description}
            </div>
          </div>

          <div className="tracks-list">
            <h3 style={{ marginBottom: '12px', fontSize: '15px', color: 'var(--text-secondary)' }}>Треки</h3>
            {loading && <div className="loading">Загрузка треков...</div>}
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

      {currentTrack && currentAlbum && (
        <div className="sticky-player">
          <div 
            className="player-info" 
            onClick={() => {
              setViewedAlbum(currentAlbum);
              setView('tracks');
            }}
            title="Нажмите, чтобы открыть список треков текущего альбома"
          >
            <img className="player-cover" src={currentAlbum.cover} alt="cover" />
            <div className="player-text">
              <div className="player-title">{currentTrack.title}</div>
              <div className="player-album">{currentAlbum.title || 'Nenormalizm Recs'}</div>
            </div>
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