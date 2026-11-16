import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import Logo from './Logo.jsx'

const UPLOADER_EMAILS = [
  'nenormalizm@gmail.com',
  'nenormalizmlab@gmail.com',
  'sobrio21@yandex.ru',
]

const FORMAT_RANK = { 'VBR MP3': 0, MP3: 1, M4A: 2, AAC: 2, 'Ogg Vorbis': 3, Opus: 3, FLAC: 4, Flac: 4, Shorten: 5 }
const FORMAT_SHORT = { 'VBR MP3': 'MP3', MP3: 'MP3', M4A: 'M4A', AAC: 'AAC', 'Ogg Vorbis': 'OGG', Opus: 'OPUS', FLAC: 'FLAC', Flac: 'FLAC', Shorten: 'SHN' }

const K = { prefs: 'nr.prefs.v1', library: 'nr.library.v1', favs: 'nr.favs.v1', hidden: 'nr.hidden.v1', session: 'nr.session.v1' }

const cx = (...a) => a.filter(Boolean).join(' ')

function readLS(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function useMedia(query) {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false))
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    if (mq.addEventListener) mq.addEventListener('change', on)
    else mq.addListener(on)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on)
      else mq.removeListener(on)
    }
  }, [query])
  return match
}

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

function parseLength(v) {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const str = String(v).trim()
  if (!str) return 0
  if (str.includes(':')) return str.split(':').map((n) => parseFloat(n) || 0).reduce((acc, n) => acc * 60 + n, 0)
  const n = parseFloat(str)
  return Number.isFinite(n) ? n : 0
}

function cleanDescription(raw) {
  if (!raw) return ''
  let text = Array.isArray(raw) ? raw.join('\n') : String(raw)
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|ul|ol|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#0?39;/gi, "'").replace(/&apos;/gi, "'")
  text = text.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])
const asText = (v) => asArray(v).map((x) => String(x)).join(', ')

function shuffleArr(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a
}

function hashHue(str) {
  let h = 0
  const s = String(str)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

function catalogOf(album) {
  const m = String(album?.title || '').match(/\[([^\]]+)\]/)
  return m ? m[1].trim() : String(album?.identifier || '').slice(0, 12)
}
const stripCatalog = (t) => String(t || '').replace(/^\s*\[[^\]]*\]\s*/, '').trim()
function yearOf(album) {
  const m = String(album?.date || album?.publicdate || '').match(/(\d{4})/)
  return m ? m[1] : ''
}
function decadeOf(album) {
  const y = parseInt(yearOf(album), 10)
  return y ? Math.floor(y / 10) * 10 : null
}
function pluralTracks(n) {
  const d = n % 10, h = n % 100
  if (d === 1 && h !== 11) return 'трек'
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'трека'
  return 'треков'
}
function pluralReleases(n) {
  const d = n % 10, h = n % 100
  if (d === 1 && h !== 11) return 'релиз'
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'релиза'
  return 'релизов'
}

function buildTracks(data, identifier) {
  const files = Array.isArray(data?.files) ? data.files : []
  const map = new Map()
  for (const f of files) {
    const rank = FORMAT_RANK[f.format]
    if (rank === undefined || !f.name) continue
    if (!/\.(mp3|ogg|oga|opus|m4a|aac|flac|shn)$/i.test(f.name)) continue
    const dedupeKey = f.name.replace(/\.[^/.]+$/, '').toLowerCase()
    const prev = map.get(dedupeKey)
    if (prev && prev.rank <= rank) continue
    const parts = f.name.split('/')
    const base = parts[parts.length - 1]
    map.set(dedupeKey, {
      key: `${identifier}/${f.name}`,
      name: f.name,
      title: base.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim(),
      url: `https://archive.org/download/${identifier}/${f.name.split('/').map(encodeURIComponent).join('/')}`,
      duration: parseLength(f.length),
      format: f.format,
      rank,
      folder: parts.length > 1 ? parts.slice(0, -1).join('/') : '',
    })
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
}

function parseHash() {
  const h = window.location.hash.replace(/^#/, '')
  const m = h.match(/^\/album\/(.+)$/)
  if (m) { try { return { name: 'album', id: decodeURIComponent(m[1]) } } catch { return { name: 'album', id: m[1] } } }
  return { name: 'library', id: null }
}
const hashFor = (r) => (r.name === 'album' ? `#/album/${encodeURIComponent(r.id)}` : '#/')

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
const Ico = ({ d, size = 18, children, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...p}>{d ? <path d={d} {...S} /> : children}</svg>
)
const IPlay = (p) => <Ico {...p}><path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" /></Ico>
const IPause = (p) => <Ico {...p}><path d="M9 5v14M15 5v14" {...S} strokeWidth="2.4" /></Ico>
const IPrev = (p) => <Ico {...p}><path d="M18 6v12L9 12l9-6Z" fill="currentColor" /><path d="M6 5.5v13" {...S} strokeWidth="2" /></Ico>
const INext = (p) => <Ico {...p}><path d="M6 6v12l9-6-9-6Z" fill="currentColor" /><path d="M18 5.5v13" {...S} strokeWidth="2" /></Ico>
const IShuffle = (p) => <Ico {...p} d="M16 4h4v4M20 4l-6.5 6.5M16 20h4v-4M20 20l-5-5M4 4l6 6M4 20l16-16" />
const IRepeat = (p) => <Ico {...p} d="M17 2l3 3-3 3M7 22l-3-3 3-3M20 5H8a4 4 0 0 0-4 4v1M4 19h12a4 4 0 0 0 4-4v-1" />
const IHeart = ({ filled, ...p }) => <Ico {...p}><path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7 2.7C19 15.6 12 20 12 20Z" {...S} fill={filled ? 'currentColor' : 'none'} /></Ico>
const ISearch = (p) => <Ico {...p} d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4" />
const IGrid = (p) => <Ico {...p} d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
const IList = (p) => <Ico {...p} d="M4 6h16M4 12h16M4 18h16" />
const IQueue = (p) => <Ico {...p} d="M4 7h11M4 12h11M4 17h7M18 10v8M18 18a2 2 0 1 0 0-.01" />
const IVol = (p) => <Ico {...p} d="M4 9v6h4l5 4V5L8 9H4ZM17 9.5a3.5 3.5 0 0 1 0 5M19.5 7a7 7 0 0 1 0 10" />
const IMute = (p) => <Ico {...p} d="M4 9v6h4l5 4V5L8 9H4ZM17 9.5l4 5M21 9.5l-4 5" />
const IBack = (p) => <Ico {...p} d="M15 5l-7 7 7 7" />
const ISun = (p) => <Ico {...p} d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
const IMoon = (p) => <Ico {...p} d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
const IClose = (p) => <Ico {...p} d="M6 6l12 12M18 6L6 18" />
const IRetry = (p) => <Ico {...p} d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" />
const IAlert = (p) => <Ico {...p} d="M12 8v5M12 16.5v.01M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
const ICheck = (p) => <Ico {...p} d="M4 12.5l5 5L20 6.5" />
const IInfo = (p) => <Ico {...p} d="M12 11v5M12 7.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" />
const IDisc = (p) => <Ico {...p} d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
const IGrip = (p) => <Ico {...p} d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
const ITrash = (p) => <Ico {...p} d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
const IUp = (p) => <Ico {...p} d="M12 19V5M5 12l7-7 7 7" />

function Cover({ src, alt, className, seed, style }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  if (!src || failed) {
    const label = String(alt || '').replace(/^\[[^\]]*\]\s*/, '').slice(0, 2).toUpperCase() || 'NR'
    return (
      <div className={cx(className, 'cover-fallback')} style={{ '--h': hashHue(seed || alt || 'nr'), ...style }} role="img" aria-label={alt}>
        <span>{label}</span>
      </div>
    )
  }
  return <img className={className} src={src} alt={alt} loading="lazy" decoding="async" style={style} onError={() => setFailed(true)} />
}

const Eq = ({ paused }) => <span className={cx('eq', paused && 'paused')} aria-hidden="true"><i /><i /><i /><i /></span>

function Skeletons({ n = 12 }) {
  return (
    <div className="grid" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div className="sk sk-card" key={i}>
          <div className="sk sk-cover" /><div className="sk sk-line w40" /><div className="sk sk-line" /><div className="sk sk-line w60" />
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null
  const isPhone = useMedia('(max-width: 640px)')

  const initialPrefs = readLS(K.prefs, {})
  const [theme, setTheme] = useState(initialPrefs.theme || document.documentElement.dataset.theme || 'dark')
  const [sort, setSort] = useState(initialPrefs.sort || 'new')
  const [density, setDensity] = useState(initialPrefs.density || 'grid')
  const [era, setEra] = useState(initialPrefs.era || 'all')
  const [favOnly, setFavOnly] = useState(!!initialPrefs.favOnly)
  const [query, setQuery] = useState('')
  const [volume, setVolume] = useState(typeof initialPrefs.volume === 'number' ? initialPrefs.volume : 0.85)
  const [muted, setMuted] = useState(!!initialPrefs.muted)
  const [shuffle, setShuffle] = useState(!!initialPrefs.shuffle)
  const [repeat, setRepeat] = useState(initialPrefs.repeat || 'all')

  const cached = readLS(K.library, null)
  const [albums, setAlbums] = useState(Array.isArray(cached?.albums) ? cached.albums : [])
  const [libLoading, setLibLoading] = useState(!cached)
  const [libError, setLibError] = useState('')
  const [favs, setFavs] = useState(() => new Set(readLS(K.favs, [])))
  const [hidden, setHidden] = useState(() => new Set(readLS(K.hidden, [])))

  const [route, setRoute] = useState(() => parseHash())
  const [viewAlbum, setViewAlbum] = useState(null)
  const [viewTracks, setViewTracks] = useState([])
  const [albumLoading, setAlbumLoading] = useState(false)
  const [albumError, setAlbumError] = useState('')
  const [descOpen, setDescOpen] = useState(false)

  const [playerAlbum, setPlayerAlbum] = useState(null)
  const [baseTracks, setBaseTracks] = useState([])
  const [queue, setQueue] = useState([])
  const [qIndex, setQIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [scrub, setScrub] = useState(null)
  const [queueOpen, setQueueOpen] = useState(false)
  const [resume, setResume] = useState(null)
  const [toasts, setToasts] = useState([])
  const [dragOver, setDragOver] = useState(null)

  const audioRef = useRef(null)
  const playerRef = useRef(null)
  const seekRef = useRef(null)
  const wantPlay = useRef(false)
  const pendingSeek = useRef(null)
  const metaCache = useRef(new Map())
  const routeRef = useRef(route)
  const viewAlbumIdRef = useRef(null)
  const navigateRef = useRef(null)
  const depth = useRef(0)
  const restored = useRef(false)
  const dragFrom = useRef(null)
  const scrubbing = useRef(false)

  const current = qIndex >= 0 && qIndex < queue.length ? queue[qIndex] : null
  const view = route.name === 'album' ? 'album' : 'library'
  const showPlayer = !!(current || resume)

  const toast = useCallback((msg, tone = 'info', action = null) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-3), { id, msg, tone, action }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : 4200)
  }, [])

  const haptic = useCallback((kind = 'light') => { try { tg?.HapticFeedback?.impactOccurred(kind) } catch {} }, [tg])

  useEffect(() => {
    const rs = document.documentElement.style
    const el = playerRef.current
    if (!el) {
      rs.setProperty('--player-h', '0px')
      rs.setProperty('--bottom-gap', 'calc(var(--app-bottom) + 28px)')
      return
    }
    rs.setProperty('--bottom-gap', '28px')
    const measure = () => {
      const h = Math.ceil(el.getBoundingClientRect().height)
      if (h > 0) rs.setProperty('--player-h', `${h}px`)
    }
    measure()
    let ro = null
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(measure); ro.observe(el) }
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    const timers = [setTimeout(measure, 60), setTimeout(measure, 220), setTimeout(measure, 520)]
    return () => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      timers.forEach(clearTimeout)
    }
  }, [showPlayer, isPhone])

  useEffect(() => {
    writeLS(K.prefs, { theme, sort, density, era, favOnly, volume, muted, shuffle, repeat })
  }, [theme, sort, density, era, favOnly, volume, muted, shuffle, repeat])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#07080c'
    try { tg?.setHeaderColor?.(bg); tg?.setBackgroundColor?.(bg) } catch {}
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', bg)
  }, [theme, tg])

  useEffect(() => { writeLS(K.favs, [...favs]) }, [favs])
  useEffect(() => { writeLS(K.hidden, [...hidden]) }, [hidden])

  const loadLibrary = useCallback(async () => {
    setLibLoading(true); setLibError('')
    try {
      const or = UPLOADER_EMAILS.map((e) => `uploader:"${e}"`).join(' OR ')
      const p = new URLSearchParams()
      p.set('q', `(${or}) AND mediatype:"audio"`)
      ;['identifier', 'title', 'creator', 'date', 'publicdate', 'mediatype'].forEach((f) => p.append('fl[]', f))
      p.append('sort[]', 'publicdate desc'); p.set('rows', '300'); p.set('output', 'json')
      const res = await fetch(`https://archive.org/advancedsearch.php?${p.toString().replace(/\+/g, '%20')}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const docs = data?.response?.docs
      if (!Array.isArray(docs)) throw new Error('Некорректный ответ архива')
      const clean = docs.filter((d) => d && d.identifier)
      setAlbums(clean)
      writeLS(K.library, { ts: Date.now(), albums: clean })
      if (!clean.length) setLibError('Архив не вернул ни одного релиза.')
    } catch (e) {
      setLibError(e?.message || 'Не удалось связаться с archive.org')
    } finally { setLibLoading(false) }
  }, [])

  useEffect(() => { loadLibrary() }, [loadLibrary])

  const fetchAlbum = useCallback(async (id) => {
    if (metaCache.current.has(id)) return metaCache.current.get(id)
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const md = data?.metadata || {}
    const built = {
      identifier: id,
      title: asText(md.title) || id,
      creator: asText(md.creator),
      date: md.date || md.publicdate || '',
      cover: `https://archive.org/services/img/${id}`,
      description: cleanDescription(md.description),
      subjects: asArray(md.subject).map(String).slice(0, 8),
      tracks: buildTracks(data, id),
    }
    metaCache.current.set(id, built)
    return built
  }, [])

  const openAlbumView = useCallback(async (id) => {
    setAlbumLoading(true); setAlbumError(''); setDescOpen(false)
    try {
      const built = await fetchAlbum(id)
      if (!built.tracks.length) {
        viewAlbumIdRef.current = null
        setHidden((h) => new Set([...h, id]))
        toast(`«${stripCatalog(built.title)}» без аудиофайлов — скрыт из каталога`, 'warn', {
          label: 'Вернуть', run: () => setHidden((h) => { const n = new Set(h); n.delete(id); return n }),
        })
        navigateRef.current?.({ name: 'library', id: null }, { replace: true })
        return
      }
      viewAlbumIdRef.current = id
      setViewAlbum(built); setViewTracks(built.tracks)
    } catch (e) {
      viewAlbumIdRef.current = null
      setAlbumError(e?.message || 'Не удалось загрузить релиз')
    } finally { setAlbumLoading(false) }
  }, [fetchAlbum, toast])

  const applyRoute = useCallback((next) => {
    routeRef.current = next
    setRoute(next)
    if (next.name === 'album' && viewAlbumIdRef.current !== next.id) openAlbumView(next.id)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [openAlbumView])

  const navigate = useCallback((next, { replace = false } = {}) => {
    const url = hashFor(next)
    if (replace) window.history.replaceState({ app: true, depth: depth.current }, '', url)
    else { depth.current += 1; window.history.pushState({ app: true, depth: depth.current }, '', url) }
    applyRoute(next)
  }, [applyRoute])

  navigateRef.current = navigate

  const goBack = useCallback(() => {
    if (queueOpen) { setQueueOpen(false); return }
    if (depth.current > 0) window.history.back()
    else navigate({ name: 'library', id: null }, { replace: true })
  }, [navigate, queueOpen])

  const goHome = useCallback(() => {
    if (routeRef.current.name === 'album') goBack()
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [goBack])

  useEffect(() => {
    const initial = parseHash()
    if (initial.name === 'album') {
      window.history.replaceState({ app: true, depth: 0 }, '', '#/')
      depth.current = 1
      window.history.pushState({ app: true, depth: 1 }, '', hashFor(initial))
    } else {
      window.history.replaceState({ app: true, depth: 0 }, '', '#/')
      depth.current = 0
    }
    routeRef.current = initial
    setRoute(initial)
    if (initial.name === 'album') openAlbumView(initial.id)

    const sync = () => {
      const next = parseHash()
      const st = window.history.state
      depth.current = typeof st?.depth === 'number' ? st.depth : 0
      if (next.name === routeRef.current.name && next.id === routeRef.current.id) return
      applyRoute(next)
    }
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync) }
  }, [applyRoute, openAlbumView])

  useEffect(() => {
    const bb = tg?.BackButton
    if (!bb) return
    const handler = () => goBack()
    try {
      if (view === 'album' || queueOpen) bb.show(); else bb.hide()
      bb.onClick(handler)
    } catch {}
    return () => { try { bb.offClick(handler) } catch {} }
  }, [tg, view, queueOpen, goBack])

  const visibleAlbums = useMemo(() => albums.filter((a) => !hidden.has(a.identifier)), [albums, hidden])

  const decades = useMemo(() => {
    const set = new Set()
    visibleAlbums.forEach((a) => { const d = decadeOf(a); if (d) set.add(d) })
    return [...set].sort((a, b) => b - a)
  }, [visibleAlbums])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = visibleAlbums
    if (favOnly) list = list.filter((a) => favs.has(a.identifier))
    if (era !== 'all') list = list.filter((a) => decadeOf(a) === Number(era))
    if (q) list = list.filter((a) => [a.title, a.creator, a.identifier, catalogOf(a)].filter(Boolean).join(' ').toLowerCase().includes(q))
    const byDate = (a) => String(a.date || a.publicdate || '')
    const sorted = [...list]
    if (sort === 'new') sorted.sort((a, b) => byDate(b).localeCompare(byDate(a)))
    else if (sort === 'old') sorted.sort((a, b) => byDate(a).localeCompare(byDate(b)))
    else if (sort === 'title') sorted.sort((a, b) => stripCatalog(a.title).localeCompare(stripCatalog(b.title), 'ru'))
    else if (sort === 'artist') sorted.sort((a, b) => String(a.creator || '').localeCompare(String(b.creator || ''), 'ru'))
    return sorted
  }, [visibleAlbums, favOnly, era, query, sort, favs])

  const totalFavs = useMemo(() => visibleAlbums.filter((a) => favs.has(a.identifier)).length, [visibleAlbums, favs])
  const resetFilters = useCallback(() => { setFavOnly(false); setEra('all'); setQuery('') }, [])
  const filtersActive = favOnly || era !== 'all' || query.trim() !== ''

  const requestPlay = useCallback(() => {
    wantPlay.current = true
    setBuffering(true)
    const a = audioRef.current
    if (a && a.readyState >= 2) a.play().catch(() => {})
  }, [])

  const startAlbum = useCallback((album, tracks, startKey = null, forceShuffle = null) => {
    if (!tracks?.length) return
    const useShuffle = forceShuffle === null ? shuffle : forceShuffle
    const order = useShuffle ? shuffleArr(tracks) : [...tracks]
    if (startKey) { const i = order.findIndex((t) => t.key === startKey); if (i > 0) { const [pick] = order.splice(i, 1); order.unshift(pick) } }
    setPlayerAlbum(album); setBaseTracks(tracks); setQueue(order); setQIndex(0)
    setCurrentTime(0); setBuffered(0); setDuration(order[0]?.duration || 0); setResume(null)
    requestPlay(); haptic('medium')
  }, [shuffle, requestPlay, haptic])

  const playFromView = useCallback((track) => {
    if (!viewAlbum) return
    if (playerAlbum?.identifier === viewAlbum.identifier) {
      const i = queue.findIndex((t) => t.key === track.key)
      if (i >= 0) { setQIndex(i); requestPlay(); haptic(); return }
    }
    startAlbum(viewAlbum, viewTracks, track.key)
  }, [viewAlbum, viewTracks, playerAlbum, queue, startAlbum, requestPlay, haptic])

  const playAlbum = useCallback((album, { shuffled = false } = {}) => {
    const hit = metaCache.current.get(album.identifier)
    if (hit?.tracks?.length) {
      if (shuffled) setShuffle(true)
      startAlbum(hit, hit.tracks, null, shuffled ? true : null)
      return
    }
    fetchAlbum(album.identifier).then((built) => {
      if (!built.tracks.length) { toast('В этом релизе нет аудиофайлов', 'warn'); return }
      if (shuffled) setShuffle(true)
      startAlbum(built, built.tracks, null, shuffled ? true : null)
    }).catch(() => toast('Не удалось загрузить релиз', 'error'))
  }, [fetchAlbum, startAlbum, toast])

  const startRadio = useCallback(() => {
    const pool = filtered.length ? filtered : visibleAlbums
    if (!pool.length) return
    setShuffle(true)
    playAlbum(pool[Math.floor(Math.random() * pool.length)], { shuffled: true })
    toast('Радио запущено — случайный релиз', 'success')
  }, [filtered, visibleAlbums, playAlbum, toast])

  const nextAlbumAuto = useCallback(async (dir = 1) => {
    const pool = visibleAlbums
    if (!pool.length || !playerAlbum) { wantPlay.current = false; setBuffering(false); return }
    let idx = pool.findIndex((a) => a.identifier === playerAlbum.identifier)
    if (idx < 0) idx = 0
    for (let step = 0; step < pool.length; step++) {
      idx = (idx + dir + pool.length) % pool.length
      try {
        const built = await fetchAlbum(pool[idx].identifier)
        if (built.tracks.length) {
          const order = shuffle ? shuffleArr(built.tracks) : (dir > 0 ? built.tracks : [...built.tracks].reverse())
          setPlayerAlbum(built); setBaseTracks(built.tracks); setQueue(order); setQIndex(0)
          setCurrentTime(0); setBuffered(0); setDuration(order[0]?.duration || 0)
          requestPlay(); return
        }
      } catch {}
    }
    wantPlay.current = false; setBuffering(false)
    toast('Больше нет релизов с аудио', 'warn')
  }, [visibleAlbums, playerAlbum, fetchAlbum, shuffle, requestPlay, toast])

  const playNext = useCallback(() => {
    if (!queue.length) return
    if (qIndex < queue.length - 1) { setQIndex(qIndex + 1); setCurrentTime(0); requestPlay(); haptic() }
    else if (repeat === 'album') { setQIndex(0); setCurrentTime(0); requestPlay() }
    else if (repeat === 'all') nextAlbumAuto(1)
    else { wantPlay.current = false; setBuffering(false); audioRef.current?.pause() }
  }, [queue.length, qIndex, repeat, nextAlbumAuto, requestPlay, haptic])

  const playPrev = useCallback(() => {
    const a = audioRef.current
    if (a && a.currentTime > 3) { a.currentTime = 0; setCurrentTime(0); return }
    if (qIndex > 0) { setQIndex(qIndex - 1); setCurrentTime(0); requestPlay(); haptic() }
    else if (repeat === 'all') nextAlbumAuto(-1)
    else if (a) { a.currentTime = 0; setCurrentTime(0) }
  }, [qIndex, repeat, nextAlbumAuto, requestPlay, haptic])

  const togglePlay = useCallback(() => {
    const a = audioRef.current
    if (!current) {
      if (queue.length) { setQIndex(0); requestPlay() } else startRadio()
      return
    }
    if (isPlaying) { wantPlay.current = false; setBuffering(false); a?.pause() } else requestPlay()
    haptic()
  }, [current, queue.length, isPlaying, requestPlay, startRadio, haptic])

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => {
      const next = !s
      if (!queue.length) return next
      const cur = current
      if (next) {
        const rest = queue.filter((t) => t.key !== cur?.key)
        const order = cur ? [cur, ...shuffleArr(rest)] : shuffleArr(queue)
        setQueue(order); setQIndex(cur ? 0 : qIndex)
      } else {
        setQueue(baseTracks)
        setQIndex(cur ? Math.max(0, baseTracks.findIndex((t) => t.key === cur.key)) : 0)
      }
      return next
    })
    haptic()
  }, [queue, current, baseTracks, qIndex, haptic])

  const cycleRepeat = useCallback(() => { setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'album' : 'off')); haptic() }, [haptic])
  const toggleFav = useCallback((id) => { setFavs((f) => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n }); haptic() }, [haptic])

  const removeFromQueue = useCallback((key) => {
    const idx = queue.findIndex((t) => t.key === key)
    if (idx < 0) return
    const removed = queue[idx]
    const snapshot = { queue, qIndex }
    const nextQueue = queue.filter((t) => t.key !== key)
    let nextIndex = qIndex
    if (idx < qIndex) nextIndex = qIndex - 1
    else if (idx === qIndex) nextIndex = Math.min(qIndex, nextQueue.length - 1)
    setQueue(nextQueue); setQIndex(nextIndex)
    if (!nextQueue.length) { wantPlay.current = false; audioRef.current?.pause() }
    toast(`«${removed.title}» убран из очереди`, 'info', { label: 'Отменить', run: () => { setQueue(snapshot.queue); setQIndex(snapshot.qIndex) } })
  }, [queue, qIndex, toast])

  const reorderQueue = useCallback((from, to) => {
    if (from === to || from == null || to == null) return
    const curKey = current?.key
    const next = [...queue]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setQueue(next)
    if (curKey) setQIndex(Math.max(0, next.findIndex((t) => t.key === curKey)))
  }, [queue, current])

  const restoreOrder = useCallback(() => {
    if (!baseTracks.length) return
    setQueue(baseTracks)
    setQIndex(Math.max(0, baseTracks.findIndex((t) => t.key === current?.key)))
    setShuffle(false)
  }, [baseTracks, current])

  useEffect(() => { const a = audioRef.current; if (a) a.volume = muted ? 0 : volume }, [volume, muted, current])
  useEffect(() => { setCurrentTime(0); setBuffered(0); setDuration(current?.duration || 0) }, [current?.key])

  const onCanPlay = () => {
    const a = audioRef.current
    if (!a) return
    if (pendingSeek.current != null) {
      try { a.currentTime = pendingSeek.current } catch {}
      setCurrentTime(pendingSeek.current); pendingSeek.current = null
    }
    if (wantPlay.current) a.play().catch(() => { setBuffering(false) })
    else setBuffering(false)
  }

  const onProgress = () => {
    const a = audioRef.current
    if (!a || !a.buffered.length || !Number.isFinite(a.duration) || a.duration <= 0) return
    try { setBuffered(Math.min(1, a.buffered.end(a.buffered.length - 1) / a.duration)) } catch {}
  }

  const onAudioError = () => {
    setBuffering(false); setIsPlaying(false)
    if (!current) return
    toast(`Не удалось загрузить «${current.title}»`, 'error', { label: 'Пропустить', run: () => playNext() })
  }

  const ratioFrom = (clientX) => {
    const el = seekRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width))
  }
  const seekDown = (e) => {
    if (!current || !duration) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    scrubbing.current = true
    setScrub(ratioFrom(e.clientX) * duration)
  }
  const seekMove = (e) => { if (scrubbing.current && duration) setScrub(ratioFrom(e.clientX) * duration) }
  const seekUp = (e) => {
    if (!scrubbing.current) return
    scrubbing.current = false
    const t = ratioFrom(e.clientX) * duration
    const a = audioRef.current
    if (a) { try { a.currentTime = t } catch {} }
    setCurrentTime(t); setScrub(null)
  }
  const seekKey = (e) => {
    if (!current || !duration) return
    const a = audioRef.current
    if (!a) return
    if (e.key === 'ArrowRight') { a.currentTime = Math.min(duration, a.currentTime + 5); e.preventDefault() }
    if (e.key === 'ArrowLeft') { a.currentTime = Math.max(0, a.currentTime - 5); e.preventDefault() }
    if (e.key === 'Home') { a.currentTime = 0; e.preventDefault() }
    if (e.key === 'End') { a.currentTime = Math.max(0, duration - 1); e.preventDefault() }
  }

  useEffect(() => {
    const save = () => {
      if (!current || !playerAlbum) return
      writeLS(K.session, { albumId: playerAlbum.identifier, trackKey: current.key, time: audioRef.current?.currentTime || 0, shuffle, repeat, ts: Date.now() })
    }
    const id = setInterval(save, 5000)
    window.addEventListener('pagehide', save)
    return () => { clearInterval(id); window.removeEventListener('pagehide', save); save() }
  }, [current, playerAlbum, shuffle, repeat])

  useEffect(() => {
    if (restored.current) return
    const s = readLS(K.session, null)
    if (!s?.albumId || !s?.trackKey) return
    if (Date.now() - (s.ts || 0) > 1000 * 60 * 60 * 48) return
    restored.current = true
    fetchAlbum(s.albumId).then((built) => {
      if (!built.tracks.length) return
      const order = s.shuffle ? shuffleArr(built.tracks) : built.tracks
      const idx = order.findIndex((t) => t.key === s.trackKey)
      const finalOrder = idx > 0 ? [order[idx], ...order.filter((_, i) => i !== idx)] : order
      setPlayerAlbum(built); setBaseTracks(built.tracks); setQueue(finalOrder); setQIndex(0)
      if (typeof s.shuffle === 'boolean') setShuffle(s.shuffle)
      if (s.repeat) setRepeat(s.repeat)
      pendingSeek.current = s.time || 0
      setCurrentTime(s.time || 0)
      setDuration(finalOrder[0]?.duration || 0)
      setResume({ time: s.time || 0 })
    }).catch(() => {})
  }, [fetchAlbum])

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (e.key === 'Escape') {
        if (queueOpen) { setQueueOpen(false); e.preventDefault(); return }
        if (typing) { t.blur(); return }
        if (view === 'album') { goBack(); e.preventDefault() }
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case ' ': e.preventDefault(); togglePlay(); break
        case 'ArrowRight': if (audioRef.current && current) { audioRef.current.currentTime = Math.min(duration || 0, audioRef.current.currentTime + 5); e.preventDefault() } break
        case 'ArrowLeft': if (audioRef.current && current) { audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5); e.preventDefault() } break
        case 'ArrowUp': setVolume((v) => Math.min(1, +(v + 0.05).toFixed(2))); setMuted(false); e.preventDefault(); break
        case 'ArrowDown': setVolume((v) => Math.max(0, +(v - 0.05).toFixed(2))); e.preventDefault(); break
        case 'm': case 'M': case 'ь': setMuted((m) => !m); break
        case 's': case 'S': case 'ы': toggleShuffle(); break
        case 'r': case 'R': case 'к': cycleRepeat(); break
        case 'q': case 'Q': case 'й': setQueueOpen((o) => !o); break
        case 'n': case 'N': case 'т': playNext(); break
        case 'p': case 'P': case 'з': playPrev(); break
        default: break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, toggleShuffle, cycleRepeat, playNext, playPrev, goBack, view, queueOpen, current, duration])

  const goToPlaying = useCallback(() => {
    if (!playerAlbum) return
    if (viewAlbumIdRef.current !== playerAlbum.identifier) {
      viewAlbumIdRef.current = playerAlbum.identifier
      setViewAlbum(playerAlbum); setViewTracks(baseTracks); setAlbumError(''); setDescOpen(false)
    }
    navigate({ name: 'album', id: playerAlbum.identifier })
  }, [playerAlbum, baseTracks, navigate])

  const shownTime = scrub != null ? scrub : currentTime
  const totalView = viewTracks.reduce((s, t) => s + (t.duration || 0), 0)
  const seekPct = duration ? Math.min(100, (shownTime / duration) * 100) : 0

  return (
    <>
      <div className="atmos" aria-hidden="true"><span className="blob b1" /><span className="blob b2" /><span className="blob b3" /></div>
      <div className="top-shield" aria-hidden="true" />

      <div className="app">
        <audio
          ref={audioRef}
          src={current?.url}
          preload="metadata"
          onPlay={() => { setIsPlaying(true); setBuffering(false); setResume(null) }}
          onPause={() => setIsPlaying(false)}
          onEnded={playNext}
          onCanPlay={onCanPlay}
          onLoadedMetadata={(e) => { setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : (current?.duration || 0)); onCanPlay() }}
          onTimeUpdate={(e) => { if (!scrubbing.current) setCurrentTime(e.currentTarget.currentTime) }}
          onProgress={onProgress}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onError={onAudioError}
        />

        {view === 'library' && (
          <>
            <div className="toolbar">
              <div className="wrap toolbar-grid">
                <button className="brand tb-brand" onClick={goHome} aria-label="Nenormalizm Recs — в начало каталога">
                  <Logo h={isPhone ? 36 : 46} playing={isPlaying} />
                  <span className="brand-text"><b>Nenormalizm Recs</b><span>archive radio</span></span>
                </button>

                <div className="search tb-search">
                  <ISearch size={16} />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск: релиз, артист, каталог…" aria-label="Поиск по каталогу" />
                  {query && <button className="search-clear" onClick={() => setQuery('')} aria-label="Очистить поиск"><IClose size={15} /></button>}
                </div>

                <button className="btn btn-primary tb-radio" onClick={startRadio} disabled={!visibleAlbums.length}>
                  <IPlay size={15} /> Радио
                </button>

                <div className="chips tb-chips" role="group" aria-label="Фильтры">
                  <button className="chip fav" aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)}>
                    <IHeart size={13} filled={favOnly} /> Избранное{totalFavs > 0 ? ` · ${totalFavs}` : ''}
                  </button>
                  {decades.map((d) => (
                    <button key={d} className="chip era" aria-pressed={String(era) === String(d)} onClick={() => setEra(String(era) === String(d) ? 'all' : String(d))}>{d}-е</button>
                  ))}
                </div>

                <select className="select tb-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Сортировка">
                  <option value="new">Сначала новые</option>
                  <option value="old">Сначала старые</option>
                  <option value="title">По названию</option>
                  <option value="artist">По артисту</option>
                </select>

                <button className="icon-btn tb-density" aria-pressed={density === 'list'} onClick={() => setDensity(density === 'grid' ? 'list' : 'grid')} aria-label="Плотность списка" title="Плитка / список">
                  {density === 'grid' ? <IList size={17} /> : <IGrid size={17} />}
                </button>

                <button className="icon-btn tb-refresh" onClick={loadLibrary} aria-label="Обновить каталог" title="Обновить каталог" disabled={libLoading}>
                  <IRetry size={17} />
                </button>

                <button className="icon-btn tb-theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Сменить тему" title="Тема">
                  {theme === 'dark' ? <ISun size={17} /> : <IMoon size={17} />}
                </button>
              </div>
            </div>

            <div className="wrap">
              {libLoading && !albums.length && (
                <div className="boot">
                  <Logo h={84} playing />
                  <div className="boot-txt"><b>Настраиваем приём</b><span>Читаем архив лейбла…</span></div>
                </div>
              )}

              <div className="stats">
                <b>{filtered.length}</b><span>{pluralReleases(filtered.length)}</span>
                <span className="sep">/</span><span>{visibleAlbums.length} в архиве</span>
                {filtersActive && (
                  <>
                    <span className="sep">/</span>
                    <button className="btn btn-quiet" style={{ height: 26, padding: '0 8px', fontSize: 12 }} onClick={resetFilters}>Сбросить фильтры</button>
                  </>
                )}
              </div>

              {libLoading && !albums.length && <Skeletons />}

              {!libLoading && libError && !albums.length && (
                <div className="state error">
                  <div className="state-icon"><IAlert size={24} /></div>
                  <h3>Каталог не загрузился</h3>
                  <p>{libError}. Проверьте соединение или отключите блокировщик для этого домена — запросы идут напрямую в archive.org.</p>
                  <button className="btn btn-primary" onClick={loadLibrary}><IRetry size={15} /> Повторить</button>
                </div>
              )}

              {!libLoading && !libError && !filtered.length && (
                <div className="state">
                  <div className="state-mark"><Logo h={60} /></div>
                  <h3>Ничего не найдено</h3>
                  <p>Под текущие фильтры не подходит ни один релиз. Сбросьте фильтры или измените поисковый запрос.</p>
                  <button className="btn btn-ghost" onClick={resetFilters}>Показать всё</button>
                </div>
              )}

              {!!filtered.length && (
                <div className={cx('grid', density === 'list' && 'list')}>
                  {filtered.map((a, i) => {
                    const playing = playerAlbum?.identifier === a.identifier
                    const fav = favs.has(a.identifier)
                    return (
                      <div
                        key={a.identifier}
                        className={cx('card', playing && 'playing')}
                        style={{ animationDelay: `${Math.min(i, 16) * 26}ms` }}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate({ name: 'album', id: a.identifier })}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate({ name: 'album', id: a.identifier }) } }}
                        aria-label={`Открыть релиз ${a.title}`}
                      >
                        <div className="card-cover-wrap">
                          <Cover className="card-cover" src={`https://archive.org/services/img/${a.identifier}`} alt={a.title} seed={a.identifier} />
                          {playing && <span className="card-eq"><Eq paused={!isPlaying} /></span>}
                          <button className={cx('card-fav', fav && 'on')} onClick={(e) => { e.stopPropagation(); toggleFav(a.identifier) }} aria-label={fav ? 'Убрать из избранного' : 'В избранное'} aria-pressed={fav}>
                            <IHeart size={16} filled={fav} />
                          </button>
                          <button className="card-play" onClick={(e) => { e.stopPropagation(); playing && isPlaying ? togglePlay() : playAlbum(a) }} aria-label={playing && isPlaying ? 'Пауза' : `Слушать ${a.title}`}>
                            {playing && isPlaying ? <IPause size={17} /> : <IPlay size={17} />}
                          </button>
                        </div>
                        <div>
                          <div className="card-cat">{catalogOf(a)}{yearOf(a) ? ` · ${yearOf(a)}` : ''}</div>
                          <div className="card-title">{stripCatalog(a.title) || a.identifier}</div>
                          <div className="card-artist">{asText(a.creator) || 'Various Artists'}</div>
                        </div>
                        <div className="card-meta">
                          <button className={cx('icon-btn', 'ghost', 'list-fav')} style={fav ? { color: 'var(--magenta)' } : undefined} onClick={(e) => { e.stopPropagation(); toggleFav(a.identifier) }} aria-label={fav ? 'Убрать из избранного' : 'В избранное'}>
                            <IHeart size={16} filled={fav} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {view === 'album' && (
          <>
            <div className="album-bar">
              <div className="wrap album-bar-in">
                <button className="back-btn" onClick={goBack}><IBack size={17} /> Назад к каталогу</button>
                <button className="bar-logo" onClick={goHome} aria-label="В каталог"><Logo h={28} playing={isPlaying} /></button>
                <span className="crumb">Библиотека / {viewAlbum ? catalogOf(viewAlbum) : route.id}</span>
                <div className="bar-actions">
                  {viewAlbum && (
                    <button
                      className="icon-btn"
                      aria-pressed={favs.has(viewAlbum.identifier)}
                      style={favs.has(viewAlbum.identifier) ? { color: 'var(--magenta)', borderColor: 'var(--magenta)' } : undefined}
                      onClick={() => toggleFav(viewAlbum.identifier)}
                      aria-label={favs.has(viewAlbum.identifier) ? 'Убрать из избранного' : 'В избранное'}
                    >
                      <IHeart size={17} filled={favs.has(viewAlbum.identifier)} />
                    </button>
                  )}
                  <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Сменить тему">
                    {theme === 'dark' ? <ISun size={17} /> : <IMoon size={17} />}
                  </button>
                </div>
              </div>
            </div>

            {albumLoading && !viewAlbum && (
              <div className="wrap" style={{ paddingTop: 28 }}>
                <div className="sk" style={{ height: 232, marginBottom: 20 }} />
                <div className="sk sk-line w60" /><div className="sk sk-line w40" />
              </div>
            )}

            {albumError && (
              <div className="wrap">
                <div className="state error">
                  <div className="state-icon"><IAlert size={24} /></div>
                  <h3>Релиз не открылся</h3>
                  <p>{albumError}</p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => openAlbumView(route.id)}><IRetry size={15} /> Повторить</button>
                    <button className="btn btn-ghost" onClick={goBack}><IBack size={15} /> В каталог</button>
                  </div>
                </div>
              </div>
            )}

            {viewAlbum && (
              <>
                <div className="hero">
                  <Cover className="hero-bg" src={viewAlbum.cover} alt="" seed={viewAlbum.identifier} />
                  <div className="hero-fade" />
                  <div className="wrap hero-in">
                    <Cover className="hero-cover" src={viewAlbum.cover} alt={viewAlbum.title} seed={viewAlbum.identifier} />
                    <div>
                      <div className="hero-cat"><IDisc size={13} /> {catalogOf(viewAlbum)}</div>
                      <h1 className="hero-title">{stripCatalog(viewAlbum.title) || viewAlbum.identifier}</h1>
                      {viewAlbum.creator && <div className="hero-artist">{viewAlbum.creator}</div>}
                      <div className="hero-meta">
                        {yearOf(viewAlbum) && <span className="tag accent">{yearOf(viewAlbum)}</span>}
                        <span className="tag">{viewTracks.length} {pluralTracks(viewTracks.length)}</span>
                        {totalView > 0 && <span className="tag">{fmtTime(totalView)}</span>}
                        {viewAlbum.subjects.map((s) => <span className="tag cyan" key={s}>{s}</span>)}
                      </div>
                      <div className="hero-actions">
                        <button className="btn btn-primary" onClick={() => startAlbum(viewAlbum, viewTracks, null, false)}><IPlay size={15} /> Слушать релиз</button>
                        <button className="btn btn-ghost" onClick={() => { setShuffle(true); startAlbum(viewAlbum, viewTracks, null, true) }}><IShuffle size={15} /> Вперемешку</button>
                      </div>
                      {viewAlbum.description && (
                        <div className="desc">
                          {viewAlbum.description.length > 320 && !descOpen ? viewAlbum.description.slice(0, 320).trimEnd() + '…' : viewAlbum.description}
                          {viewAlbum.description.length > 320 && (
                            <button className="desc-toggle" onClick={() => setDescOpen((v) => !v)}>{descOpen ? 'Свернуть ▲' : 'Показать полностью ▼'}</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="wrap">
                  {playerAlbum && current && playerAlbum.identifier !== viewAlbum.identifier && (
                    <div className="now-other">
                      <span className="lbl">Сейчас играет</span>
                      <span className="txt">{current.title} — {stripCatalog(playerAlbum.title)}</span>
                      <button className="btn btn-ghost" style={{ height: 32, fontSize: 12.5 }} onClick={goToPlaying}><IUp size={14} /> Перейти</button>
                    </div>
                  )}

                  <div className="tracks">
                    <div className="tracks-head"><h3>Треклист</h3><span className="sum">{viewTracks.length} · {fmtTime(totalView)}</span></div>
                    <div role="list">
                      {viewTracks.map((t, i) => {
                        const isCur = current?.key === t.key
                        return (
                          <button key={t.key} role="listitem" className="track" aria-current={isCur ? 'true' : undefined} onClick={() => playFromView(t)} title={t.title}>
                            <span className="t-num">{isCur ? <Eq paused={!isPlaying} /> : String(i + 1).padStart(2, '0')}</span>
                            <span className="t-title">{t.title}</span>
                            <span className="t-fmt">{FORMAT_SHORT[t.format] || t.format}</span>
                            <span className="t-time">{t.duration ? fmtTime(t.duration) : '—'}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="album-foot">
                    <IDisc size={14} /><span>Источник:</span>
                    <a href={`https://archive.org/details/${encodeURIComponent(viewAlbum.identifier)}`} target="_blank" rel="noreferrer noopener">archive.org/details/{viewAlbum.identifier}</a>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <div className="player-spacer" aria-hidden="true" />
      </div>

      {queueOpen && (
        <>
          <div className="queue-scrim" onClick={() => setQueueOpen(false)} />
          <aside className="queue" aria-label="Очередь воспроизведения">
            <div className="queue-head">
              <IQueue size={16} /><h3>Очередь</h3>
              <span className="cnt">{queue.length ? `${qIndex + 1}/${queue.length}` : '0'}</span>
              <button className="icon-btn ghost" onClick={() => setQueueOpen(false)} aria-label="Закрыть очередь"><IClose size={16} /></button>
            </div>
            <div className="queue-tools">
              <button className="chip" aria-pressed={shuffle} onClick={toggleShuffle}><IShuffle size={13} /> Перемешать</button>
              <button className="chip" onClick={restoreOrder} disabled={!baseTracks.length}><IRetry size={13} /> Исходный порядок</button>
            </div>
            <div className="queue-list">
              {!queue.length && <div className="queue-empty">Очередь пуста. Запустите релиз или включите радио.</div>}
              {queue.map((t, i) => (
                <div
                  key={t.key}
                  className={cx('q-row', dragOver === i && 'dragover', dragFrom.current === i && 'dragging')}
                  role="button"
                  tabIndex={0}
                  aria-current={i === qIndex ? 'true' : undefined}
                  draggable
                  onDragStart={() => { dragFrom.current = i }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(i) }}
                  onDragLeave={() => setDragOver((v) => (v === i ? null : v))}
                  onDrop={(e) => { e.preventDefault(); reorderQueue(dragFrom.current, i); dragFrom.current = null; setDragOver(null) }}
                  onDragEnd={() => { dragFrom.current = null; setDragOver(null) }}
                  onClick={() => { setQIndex(i); requestPlay() }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setQIndex(i); requestPlay() } }}
                >
                  <span className="q-grip" aria-hidden="true"><IGrip size={14} /></span>
                  <span className="q-title">{i === qIndex ? '▸ ' : ''}{t.title}</span>
                  <span className="q-time">{t.duration ? fmtTime(t.duration) : '—'}</span>
                  <button className="q-del" onClick={(e) => { e.stopPropagation(); removeFromQueue(t.key) }} aria-label={`Убрать ${t.title}`}><ITrash size={14} /></button>
                </div>
              ))}
            </div>
          </aside>
        </>
      )}

      {showPlayer && (
        <div className="player" ref={playerRef}>
          <div className="wrap player-in">
            <div className="p-meta">
              <button className="p-cover-btn" onClick={goToPlaying} aria-label="Открыть играющий релиз" title="Открыть играющий релиз">
                <Cover src={playerAlbum?.cover} alt={playerAlbum?.title || ''} seed={playerAlbum?.identifier} />
                <span className="p-cover-hint"><IUp size={16} /></span>
              </button>
              <div className="p-text">
                <div className="p-title" title={current?.title}>{current?.title || 'Готово к воспроизведению'}</div>
                <div className="p-album">{playerAlbum ? stripCatalog(playerAlbum.title) : ''}</div>
              </div>
            </div>

            <div className="p-center">
              <div className="p-controls">
                <button className={cx('p-btn', shuffle && 'on')} onClick={toggleShuffle} aria-pressed={shuffle} aria-label="Перемешать (S)" title="Перемешать (S)"><IShuffle size={17} /></button>
                <button className="p-btn" onClick={playPrev} aria-label="Предыдущий (P)" title="Предыдущий (P)"><IPrev size={19} /></button>
                <button className="p-btn play" onClick={togglePlay} aria-label={isPlaying ? 'Пауза (Space)' : 'Играть (Space)'} title="Space">
                  {buffering && !isPlaying ? <span className="spinner" /> : isPlaying ? <IPause size={19} /> : <IPlay size={19} />}
                </button>
                <button className="p-btn" onClick={playNext} aria-label="Следующий (N)" title="Следующий (N)"><INext size={19} /></button>
                <button className={cx('p-btn', repeat !== 'off' && 'on')} onClick={cycleRepeat} aria-label={`Повтор: ${repeat === 'off' ? 'выключен' : repeat === 'all' ? 'весь каталог' : 'релиз'}`} title="Повтор (R)">
                  <IRepeat size={17} />{repeat === 'album' && <span className="badge">1</span>}
                </button>
              </div>
              <div className="p-seek-row">
                <span className="p-time">{fmtTime(shownTime)}</span>
                <div
                  className={cx('seek', scrub != null && 'drag')}
                  ref={seekRef}
                  role="slider"
                  tabIndex={0}
                  aria-label="Позиция воспроизведения"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration || 0)}
                  aria-valuenow={Math.round(shownTime || 0)}
                  aria-valuetext={`${fmtTime(shownTime)} из ${fmtTime(duration)}`}
                  onPointerDown={seekDown}
                  onPointerMove={seekMove}
                  onPointerUp={seekUp}
                  onPointerCancel={seekUp}
                  onKeyDown={seekKey}
                >
                  <div className="seek-track">
                    <div className="seek-buf" style={{ width: `${buffered * 100}%` }} />
                    <div className="seek-fill" style={{ width: `${seekPct}%` }} />
                  </div>
                  <span className="seek-knob" style={{ left: `${seekPct}%` }} />
                </div>
                <span className="p-time right">{fmtTime(duration)}</span>
              </div>
            </div>

            <div className="p-right">
              {resume && !isPlaying && (
                <button className="resume-chip" onClick={() => { pendingSeek.current = resume.time; requestPlay(); setResume(null) }}>
                  <IPlay size={12} /><span className="resume-word">Продолжить</span> {fmtTime(resume.time)}
                </button>
              )}
              <div className="vol">
                <button className="p-btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted} aria-label={muted ? 'Включить звук (M)' : 'Выключить звук (M)'} title="Звук (M)">
                  {muted || volume === 0 ? <IMute size={17} /> : <IVol size={17} />}
                </button>
                <input type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} onChange={(e) => { setVolume(parseFloat(e.target.value)); setMuted(false) }} aria-label="Громкость" />
              </div>
              <button className={cx('p-btn', queueOpen && 'on')} onClick={() => setQueueOpen((o) => !o)} aria-pressed={queueOpen} aria-label="Очередь (Q)" title="Очередь (Q)"><IQueue size={18} /></button>
            </div>
          </div>
        </div>
      )}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div className={cx('toast', t.tone)} key={t.id}>
            <span className="t-ico">{t.tone === 'success' ? <ICheck size={14} /> : t.tone === 'error' || t.tone === 'warn' ? <IAlert size={14} /> : <IInfo size={14} />}</span>
            <span className="t-msg">{t.msg}</span>
            {t.action && <button className="t-act" onClick={() => { t.action.run(); setToasts((x) => x.filter((y) => y.id !== t.id)) }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </>
  )
}