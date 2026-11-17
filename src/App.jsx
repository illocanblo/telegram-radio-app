import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import Logo from './Logo.jsx'
import Stats from './Stats.jsx'
import Links from './Links.jsx'
import { analytics } from './analytics.js'
import {
  readStartParam, routeFromParam, readRoute, writeRoute,
  paramForAlbum, directLink, webLink, getLinkConfig, copyText,
} from './deeplink.js'
import {
  tg, capabilities, setBottomBar, setClosingConfirmation, hideKeyboard,
  hapticNotify, isFullscreen, toggleFullscreen, onFullscreenChange,
  homeScreenStatus, addToHomeScreen, onHomeScreenAdded,
  shareToStory, downloadFile, openExternal, showSettingsButton, confirmNative,
  setMainButton, setSecondaryButton, onMainButton, onSecondaryButton,
} from './telegram.js'
import * as sync from './sync.js'
import useMedia from './hooks/useMedia.js'

const UPLOADER_EMAILS = ['nenormalizm@gmail.com', 'nenormalizmlab@gmail.com', 'sobrio21@yandex.ru']

const FORMAT_RANK = { 'VBR MP3': 0, MP3: 1, M4A: 2, AAC: 2, 'Ogg Vorbis': 3, Opus: 3, FLAC: 4, Flac: 4, Shorten: 5 }
const FORMAT_SHORT = { 'VBR MP3': 'MP3', MP3: 'MP3', M4A: 'M4A', AAC: 'AAC', 'Ogg Vorbis': 'OGG', Opus: 'OPUS', FLAC: 'FLAC', Flac: 'FLAC', Shorten: 'SHN' }

const K = {
  prefs: 'nr.prefs.v1', library: 'nr.library.v1', favs: 'nr.favs.v1',
  hidden: 'nr.hidden.v1', session: 'nr.session.v1', played: 'nr.played.v1',
}
const PLAYED_MAX = 600
const META_TTL = 6 * 60 * 60 * 1000
const META_MAX = 40
const META_IDX = 'nr.meta.idx'
const META_VER = 1
const FETCH_TIMEOUT = 12000
const PREFETCH_CONCURRENCY = 2
const PREFETCH_AUTO_MAX = 6

const cx = (...a) => a.filter(Boolean).join(' ')
const metaKey = (id) => `nr.meta.${id}`

function readLS(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function readStoredMeta(id) {
  try {
    const raw = sessionStorage.getItem(metaKey(id))
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || p.v !== META_VER || Date.now() - (p.ts || 0) > META_TTL) return null
    return p.d || null
  } catch { return null }
}

function purgeStoredMeta() {
  try {
    const idx = JSON.parse(sessionStorage.getItem(META_IDX) || '[]')
    idx.forEach((x) => { try { sessionStorage.removeItem(metaKey(x)) } catch {} })
    sessionStorage.removeItem(META_IDX)
  } catch {}
}

function storeMeta(id, d) {
  const write = () => {
    sessionStorage.setItem(metaKey(id), JSON.stringify({ v: META_VER, ts: Date.now(), d }))
    let idx = []
    try { idx = JSON.parse(sessionStorage.getItem(META_IDX) || '[]') } catch {}
    idx = idx.filter((x) => x !== id)
    idx.push(id)
    while (idx.length > META_MAX) {
      const old = idx.shift()
      try { sessionStorage.removeItem(metaKey(old)) } catch {}
    }
    sessionStorage.setItem(META_IDX, JSON.stringify(idx))
  }
  try { write() } catch { try { purgeStoredMeta(); write() } catch {} }
}

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

function fmtSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n > 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} ГБ`
  if (n > 1024 * 1024) return `${Math.round(n / 1024 / 1024)} МБ`
  return `${Math.round(n / 1024)} КБ`
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
function safeFileName(s) {
  return String(s || 'track').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'track'
}
const fileUrl = (id, name) => `https://archive.org/download/${id}/${String(name).split('/').map(encodeURIComponent).join('/')}`
const coverUrl = (id) => `https://archive.org/services/img/${id}`

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
    const ext = (base.match(/\.[^/.]+$/) || ['.mp3'])[0]
    map.set(dedupeKey, {
      key: `${identifier}/${f.name}`,
      name: f.name,
      title: base.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim(),
      ext,
      url: fileUrl(identifier, f.name),
      duration: parseLength(f.length),
      format: f.format,
      rank,
      folder: parts.length > 1 ? parts.slice(0, -1).join('/') : '',
    })
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
}

function findZip(data, identifier) {
  const files = Array.isArray(data?.files) ? data.files : []
  const zips = files.filter((f) => f?.name && /\.zip$/i.test(f.name))
  if (!zips.length) return null
  zips.sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0))
  const best = zips.find((z) => z.name.toLowerCase().includes(identifier.toLowerCase())) || zips[0]
  return { name: best.name, url: fileUrl(identifier, best.name), size: Number(best.size) || 0 }
}

function compressUrl(identifier, formats) {
  const list = [...new Set(formats.filter(Boolean))]
  const base = `https://archive.org/compress/${encodeURIComponent(identifier)}`
  return list.length ? `${base}/formats=${list.map(encodeURIComponent).join(',')}` : base
}

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
const IChart = (p) => <Ico {...p} d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
const ILink = (p) => <Ico {...p} d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
const IExpand = (p) => <Ico {...p} d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" />
const ICollapse = (p) => <Ico {...p} d="M9 4v5H4M15 20v-5h5M20 9h-5V4M4 15h5v5" />
const IHome = (p) => <Ico {...p} d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6" />
const IStory = (p) => <Ico {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="5" {...S} strokeDasharray="4 3" /><path d="M12 8.5v7M8.5 12h7" {...S} /></Ico>
const IDownload = (p) => <Ico {...p} d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14" />
const IAlbumZip = (p) => <Ico {...p}><path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Z" {...S} /><path d="M12 12v8M4 7.5l8 4.5 8-4.5" {...S} /></Ico>
const ICloud = (p) => <Ico {...p} d="M7 18h10a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 6.6 11A3.5 3.5 0 0 0 7 18Z" />
const IChev = (p) => <Ico {...p} d="M6 9.5l6 6 6-6" />
const ISortNew = (p) => <Ico {...p} d="M4 6h10M4 12h7M4 18h4M18 5v14M18 19l-3.2-3.2M18 19l3.2-3.2" />
const ISortOld = (p) => <Ico {...p} d="M4 6h4M4 12h7M4 18h10M18 19V5M18 5l-3.2 3.2M18 5l3.2 3.2" />
const ISortAlpha = (p) => <Ico {...p} d="M3 18l3.6-11 3.6 11M4.4 14.2h4.4M14 7h6l-6 10h6" />
const ISortArtist = (p) => <Ico {...p}><circle cx="12" cy="8.5" r="3.6" {...S} /><path d="M5 20a7 7 0 0 1 14 0" {...S} /></Ico>

function Cover({ src, alt, className, seed, style, eager }) {
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
  return <img className={className} src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" style={style} onError={() => setFailed(true)} />
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

function TrackSkeletons({ n = 6 }) {
  return (
    <div role="list" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div className="track" key={i} style={{ cursor: 'default' }}>
          <span className="t-num">{String(i + 1).padStart(2, '0')}</span>
          <span className="sk sk-line" style={{ margin: 0, width: `${58 + ((i * 13) % 34)}%` }} />
          <span className="t-fmt" style={{ opacity: 0.35 }}>MP3</span>
          <span className="sk sk-line" style={{ margin: 0, width: 38 }} />
          <span className="t-slot" />
        </div>
      ))}
    </div>
  )
}

function SortMenu({ value, options, onChange, open, onOpenChange, count }) {
  const wrapRef = useRef(null)
  const btnRef = useRef(null)
  const itemRefs = useRef([])
  const selected = Math.max(0, options.findIndex((o) => o.value === value))
  const [cursor, setCursor] = useState(selected)

  useEffect(() => {
    if (!open) return
    setCursor(selected)
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onOpenChange(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    const id = requestAnimationFrame(() => { itemRefs.current[selected]?.focus() })
    return () => { document.removeEventListener('pointerdown', onDown, true); cancelAnimationFrame(id) }
  }, [open, selected, onOpenChange])

  const close = (focusBack = true) => {
    onOpenChange(false)
    if (focusBack) requestAnimationFrame(() => btnRef.current?.focus())
  }

  const pick = (v) => { onChange(v); close() }

  const onListKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return }
    if (e.key === 'Tab') { close(false); return }
    let next = cursor
    if (e.key === 'ArrowDown') next = (cursor + 1) % options.length
    else if (e.key === 'ArrowUp') next = (cursor - 1 + options.length) % options.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = options.length - 1
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(options[cursor].value); return }
    else return
    e.preventDefault(); e.stopPropagation()
    setCursor(next)
    itemRefs.current[next]?.focus()
  }

  const active = options[selected]

  return (
    <div className="sortwrap tb-sort" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="sortbtn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Сортировка: ${active.label}`}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault(); e.stopPropagation(); onOpenChange(true)
          }
        }}
      >
        <span className="dot" aria-hidden="true" />
        <span className="lbl">{active.label}</span>
        <span className="chev"><IChev size={15} /></span>
      </button>

      {open && (
        <div className="sortmenu" role="dialog" aria-label="Сортировка каталога">
          <div className="sortmenu-head">
            <b>Порядок релизов</b>
            <s>{count}</s>
          </div>
          <div className="sortmenu-list" role="listbox" aria-label="Сортировка" onKeyDown={onListKey}>
            {options.map((o, i) => (
              <button
                key={o.value}
                ref={(el) => { itemRefs.current[i] = el }}
                type="button"
                role="option"
                aria-selected={o.value === value}
                tabIndex={i === cursor ? 0 : -1}
                className="sortopt"
                style={{ animationDelay: `${i * 32}ms` }}
                onMouseEnter={() => setCursor(i)}
                onClick={(e) => { e.stopPropagation(); pick(o.value) }}
              >
                <span className="ico">{o.icon}</span>
                <span className="txt"><b>{o.label}</b><span>{o.hint}</span></span>
                <span className="mark"><ICheck size={16} /></span>
              </button>
            ))}
          </div>
          <div className="sortmenu-foot">
            <ICloud size={13} /> выбор сохраняется между устройствами
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const isPhone = useMedia('(max-width: 640px)')
  const [caps] = useState(() => capabilities())

  const initialPrefs = readLS(K.prefs, {})
  const [theme, setTheme] = useState(initialPrefs.theme || document.documentElement.dataset.theme || 'dark')
  const [sort, setSort] = useState(initialPrefs.sort || 'new')
  const [sortOpen, setSortOpen] = useState(false)
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
  const [played, setPlayed] = useState(() => new Set(readLS(K.played, [])))
  const [radioRequested, setRadioRequested] = useState(false)
  const [cloudReady, setCloudReady] = useState(!sync.enabled)
  const [fullscreen, setFullscreen] = useState(() => isFullscreen())
  const [homeStatus, setHomeStatus] = useState('unknown')
  const [dlKey, setDlKey] = useState(null)
  const pendingOwnerRoute = useRef(null)

  const [route, setRoute] = useState(() => readRoute())
  const [viewShell, setViewShell] = useState(null)
  const [viewAlbum, setViewAlbum] = useState(null)
  const [viewTracks, setViewTracks] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
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
  const searchRef = useRef(null)
  const wantPlay = useRef(false)
  const pendingSeek = useRef(null)
  const metaCache = useRef(new Map())
  const inflight = useRef(new Map())
  const albumsRef = useRef(albums)
  const routeRef = useRef(route)
  const viewAlbumIdRef = useRef(null)
  const loadedIdRef = useRef(null)
  const reqToken = useRef(0)
  const navigateRef = useRef(null)
  const depth = useRef(0)
  const restored = useRef(false)
  const dragFrom = useRef(null)
  const scrubbing = useRef(false)
  const listenTick = useRef(null)
  const countedPlay = useRef(null)
  const searchTimer = useRef(null)
  const hydrating = useRef(true)
  const mainAction = useRef({ play: null, shuffle: null })
  const lastSessionPush = useRef(0)
  const prefetchQueue = useRef([])
  const prefetchActive = useRef(0)
  const prefetchSeen = useRef(new Set())
  const prefetchAuto = useRef(0)
  const pumpRef = useRef(() => {})

  albumsRef.current = albums

  const current = qIndex >= 0 && qIndex < queue.length ? queue[qIndex] : null
  const view = route.name === 'album' ? 'album' : route.name === 'stats' ? 'stats' : route.name === 'links' ? 'links' : 'library'
  const showPlayer = !!(current || resume)
  const activeAlbum = viewAlbum || viewShell
  const albumReady = !!viewAlbum && viewAlbum.identifier === viewAlbumIdRef.current

  const sortOptions = useMemo(() => ([
    { value: 'new', label: 'Сначала новые', hint: 'по дате публикации', icon: <ISortNew size={16} /> },
    { value: 'old', label: 'Сначала старые', hint: 'с начала архива', icon: <ISortOld size={16} /> },
    { value: 'title', label: 'По названию', hint: 'А → Я, без каталожного номера', icon: <ISortAlpha size={16} /> },
    { value: 'artist', label: 'По артисту', hint: 'А → Я, Various Artists в конце', icon: <ISortArtist size={16} /> },
  ]), [])

  const toast = useCallback((msg, tone = 'info', action = null) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-3), { id, msg, tone, action }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : 4200)
  }, [])

  const haptic = useCallback((kind = 'light') => { try { tg?.HapticFeedback?.impactOccurred(kind) } catch {} }, [])

  useEffect(() => { analytics.init({ theme }) }, [theme])

  useEffect(() => {
    if (!sync.enabled) { hydrating.current = false; return }
    let alive = true
    ;(async () => {
      const pulled = await sync.pull()
      if (!alive) return
      const p = pulled.prefs?.d
      if (p && typeof p === 'object') {
        if (p.theme) setTheme(p.theme)
        if (p.sort) setSort(p.sort)
        if (p.density) setDensity(p.density)
        if (p.era) setEra(p.era)
        if (typeof p.favOnly === 'boolean') setFavOnly(p.favOnly)
        if (typeof p.volume === 'number') setVolume(p.volume)
        if (typeof p.muted === 'boolean') setMuted(p.muted)
        if (typeof p.shuffle === 'boolean') setShuffle(p.shuffle)
        if (p.repeat) setRepeat(p.repeat)
        writeLS(K.prefs, p)
        sync.markPulled('prefs', pulled.prefs.ts)
      }
      if (Array.isArray(pulled.favs?.d)) {
        setFavs(new Set(pulled.favs.d)); writeLS(K.favs, pulled.favs.d); sync.markPulled('favs', pulled.favs.ts)
      }
      if (Array.isArray(pulled.hidden?.d)) {
        setHidden(new Set(pulled.hidden.d)); writeLS(K.hidden, pulled.hidden.d); sync.markPulled('hidden', pulled.hidden.ts)
      }
      if (pulled.session?.d) { writeLS(K.session, pulled.session.d); sync.markPulled('session', pulled.session.ts) }
      hydrating.current = false
      setCloudReady(true)
      if (Object.keys(pulled).length) toast('Настройки и избранное загружены из Telegram', 'success')
    })()
    const flush = () => { sync.flush() }
    const onVis = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onVis) }
  }, [toast])

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
  }, [showPlayer, isPhone, fullscreen])

  useEffect(() => {
    const prefs = { theme, sort, density, era, favOnly, volume, muted, shuffle, repeat }
    writeLS(K.prefs, prefs)
    if (!hydrating.current) sync.push('prefs', prefs)
  }, [theme, sort, density, era, favOnly, volume, muted, shuffle, repeat])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    analytics.setTheme(theme)
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#07080c'
    try { tg?.setHeaderColor?.(bg); tg?.setBackgroundColor?.(bg) } catch {}
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', bg)
  }, [theme])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const hash = window.location.hash.replace(/^#/, '')
      const [, qs] = hash.split('?')
      const params = new URLSearchParams(qs || '')
      const key = params.get('k')

      if (key) {
        try {
          const res = await fetch('/api/verify-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key },
            body: JSON.stringify({ key }),
            cache: 'no-store',
          })
          const data = await res.json()
          if (alive && data.valid) {
            setIsAdmin(true)
            try { sessionStorage.setItem('nr.admin.valid', '1') } catch {}
            const p = pendingOwnerRoute.current
            if (p) {
              pendingOwnerRoute.current = null
              setRoute(p)
              writeRoute(p, { replace: true, depth: 1 })
            }
            try {
              const nextParams = new URLSearchParams(qs || '')
              nextParams.delete('k')
              const suffix = nextParams.toString()
              const nextUrl = window.location.pathname + window.location.search + (suffix ? '#' + suffix : '')
              window.history.replaceState(window.history.state, '', nextUrl)
            } catch {}
          }
        } catch {}
      } else {
        // Check sessionStorage for previously validated admin session
        try {
          const saved = sessionStorage.getItem('nr.admin.valid')
          if (alive && saved === '1') {
            setIsAdmin(true)
            const p = pendingOwnerRoute.current
            if (p) {
              pendingOwnerRoute.current = null
              setRoute(p)
              writeRoute(p, { replace: true, depth: 1 })
            }
          }
        } catch {}
      }
    })()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    setBottomBar(showPlayer ? (theme === 'light' ? '#eaedf5' : '#0a0c12') : bg)
  }, [showPlayer, theme])

  useEffect(() => { setClosingConfirmation(isPlaying) }, [isPlaying])

  useEffect(() => {
    const list = [...favs]
    writeLS(K.favs, list)
    if (!hydrating.current) sync.push('favs', list)
  }, [favs])

  useEffect(() => {
    const list = [...hidden]
    writeLS(K.hidden, list)
    if (!hydrating.current) sync.push('hidden', list)
  }, [hidden])

  useEffect(() => { writeLS(K.played, [...played].slice(-PLAYED_MAX)) }, [played])

  useEffect(() => onFullscreenChange(() => setFullscreen(isFullscreen())), [])

  useEffect(() => {
    if (!caps.homeScreen) return
    let alive = true
    homeScreenStatus().then((s) => { if (alive) setHomeStatus(s) })
    const off = onHomeScreenAdded(() => setHomeStatus('added'))
    return () => { alive = false; off() }
  }, [caps.homeScreen])

  useEffect(() => {
    showSettingsButton(true)
    return () => showSettingsButton(false)
  }, [])

  useEffect(() => {
    const visible = view === 'album' && albumReady && !showPlayer
    setMainButton({ text: 'Слушать релиз', visible })
    setSecondaryButton({
      text: 'Вперемешку',
      visible: visible && caps.secondary,
      color: theme === 'light' ? '#eceff7' : '#1b2030',
      textColor: theme === 'light' ? '#0c1020' : '#eef1f8',
    })
  }, [view, albumReady, showPlayer, caps.secondary, theme])

  useEffect(() => {
    const offMain = onMainButton(() => mainAction.current.play?.())
    const offSecondary = onSecondaryButton(() => mainAction.current.shuffle?.())
    return () => { offMain(); offSecondary() }
  }, [])

  useEffect(() => { if (view !== 'library') setSortOpen(false) }, [view])

  const loadLibrary = useCallback(async () => {
    setLibLoading(true); setLibError('')
    try {
      const or = UPLOADER_EMAILS.map((e) => `uploader:"${e}"`).join(' OR ')
      const p = new URLSearchParams()
      p.set('q', `(${or}) AND mediatype:"audio"`)
      ;['identifier', 'title', 'creator', 'date', 'publicdate', 'mediatype', 'subject'].forEach((f) => p.append('fl[]', f))
      p.append('sort[]', 'publicdate desc'); p.set('rows', '300'); p.set('output', 'json')
      const res = await fetch(`https://archive.org/advancedsearch.php?${p.toString().replace(/\+/g, '%20')}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const docs = data?.response?.docs
      if (!Array.isArray(docs)) throw new Error('Некорректный ответ архива')
      const clean = docs.filter((d) => d && d.identifier).map((d) => ({ ...d, subject: asArray(d.subject || '') }))
      setAlbums(clean)
      writeLS(K.library, { ts: Date.now(), albums: clean })
      if (!clean.length) setLibError('Архив не вернул ни одного релиза.')
    } catch (e) {
      setLibError(e?.message || 'Не удалось связаться с archive.org')
    } finally { setLibLoading(false) }
  }, [])

  useEffect(() => { loadLibrary() }, [loadLibrary])

  const peekAlbum = useCallback((id) => {
    if (!id) return null
    const hit = metaCache.current.get(id)
    if (hit) return hit
    const stored = readStoredMeta(id)
    if (stored && Array.isArray(stored.tracks)) {
      metaCache.current.set(id, stored)
      return stored
    }
    return null
  }, [])

  const fetchAlbum = useCallback((id) => {
    const hit = peekAlbum(id)
    if (hit) return Promise.resolve(hit)
    const running = inflight.current.get(id)
    if (running) return running

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT)
    const job = (async () => {
      const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const md = data?.metadata || {}
      const tracks = buildTracks(data, id)
      const zip = findZip(data, id)
      const built = {
        identifier: id,
        title: asText(md.title) || id,
        creator: asText(md.creator),
        date: md.date || md.publicdate || '',
        cover: coverUrl(id),
        description: cleanDescription(md.description),
        subjects: asArray(md.subject).map(String).slice(0, 8),
        tracks,
        zip,
        archiveUrl: zip?.url || compressUrl(id, tracks.map((t) => t.format)),
        archiveSize: zip?.size || 0,
        archiveReady: !!zip,
      }
      metaCache.current.set(id, built)
      storeMeta(id, built)
      return built
    })().finally(() => { clearTimeout(timer); inflight.current.delete(id) })

    inflight.current.set(id, job)
    return job
  }, [peekAlbum])

  const pump = useCallback(() => {
    while (prefetchActive.current < PREFETCH_CONCURRENCY && prefetchQueue.current.length) {
      const id = prefetchQueue.current.shift()
      if (peekAlbum(id)) continue
      prefetchActive.current += 1
      fetchAlbum(id).catch(() => {}).then(() => {
        prefetchActive.current -= 1
        pumpRef.current()
      })
    }
  }, [fetchAlbum, peekAlbum])
  pumpRef.current = pump

  const prefetch = useCallback((id, { priority = false } = {}) => {
    if (!id || prefetchSeen.current.has(id) || peekAlbum(id)) return
    const conn = typeof navigator !== 'undefined' ? navigator.connection : null
    if (conn && (conn.saveData || /(^|\s)2g/.test(conn.effectiveType || ''))) return
    if (!priority && prefetchAuto.current >= PREFETCH_AUTO_MAX) return
    prefetchSeen.current.add(id)
    if (!priority) prefetchAuto.current += 1
    if (priority) prefetchQueue.current.unshift(id)
    else prefetchQueue.current.push(id)
    pump()
  }, [peekAlbum, pump])

  const shellFor = useCallback((id) => {
    const row = albumsRef.current.find((a) => a.identifier === id)
    return {
      identifier: id,
      title: row ? asText(row.title) : '',
      creator: row ? asText(row.creator) : '',
      date: row?.date || row?.publicdate || '',
      cover: coverUrl(id),
      description: '', subjects: [], tracks: [],
      zip: null, archiveUrl: '', archiveSize: 0, archiveReady: false,
    }
  }, [])

  const loadInto = useCallback(async (id) => {
    const token = ++reqToken.current
    try {
      const built = await fetchAlbum(id)
      if (token !== reqToken.current || viewAlbumIdRef.current !== id) return
      if (!built.tracks.length) {
        loadedIdRef.current = null
        setHidden((h) => new Set([...h, id]))
        toast(`«${stripCatalog(built.title)}» без аудиофайлов — скрыт из каталога`, 'warn', {
          label: 'Вернуть', run: () => setHidden((h) => { const n = new Set(h); n.delete(id); return n }),
        })
        navigateRef.current?.({ name: 'library', id: null }, { replace: true })
        return
      }
      loadedIdRef.current = id
      setViewAlbum(built)
      setViewTracks(built.tracks)
      setAlbumLoading(false)
      analytics.event('album', { album: id })
    } catch (e) {
      if (token !== reqToken.current || viewAlbumIdRef.current !== id) return
      setAlbumError(e?.name === 'AbortError' ? 'Превышено время ожидания archive.org' : (e?.message || 'Не удалось загрузить релиз'))
      setAlbumLoading(false)
      analytics.event('error')
    }
  }, [fetchAlbum, toast])

  const applyRoute = useCallback((next) => {
    routeRef.current = next

    if ((next.name === 'stats' || next.name === 'links') && !isAdmin) {
      setRoute({ name: 'library', id: null })
      writeRoute({ name: 'library', id: null }, { replace: true, depth: 0 })
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      return
    }

    setRoute(next)

    if (next.name === 'album' && next.id) {
      const id = next.id
      if (loadedIdRef.current !== id || viewAlbumIdRef.current !== id) {
        viewAlbumIdRef.current = id
        loadedIdRef.current = null
        setDescOpen(false)
        setAlbumError('')
        setViewShell(shellFor(id))
        const hit = peekAlbum(id)
        if (hit && hit.tracks.length) {
          loadedIdRef.current = id
          setViewAlbum(hit)
          setViewTracks(hit.tracks)
          setAlbumLoading(false)
          analytics.event('album', { album: id })
        } else {
          setViewAlbum(null)
          setViewTracks([])
          setAlbumLoading(true)
          loadInto(id)
        }
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [shellFor, peekAlbum, loadInto, isAdmin])

  const navigate = useCallback((next, { replace = false } = {}) => {
    if (!replace) depth.current += 1
    writeRoute(next, { replace, depth: depth.current })
    applyRoute(next)
  }, [applyRoute])

  navigateRef.current = navigate

  const goBack = useCallback(() => {
    if (queueOpen) { setQueueOpen(false); return }
    if (depth.current > 0) window.history.back()
    else navigate({ name: 'library', id: null }, { replace: true })
  }, [navigate, queueOpen])

  const goHome = useCallback(() => {
    if (routeRef.current.name !== 'library') goBack()
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [goBack])

  useEffect(() => {
    const deep = routeFromParam(readStartParam())
    const initial = deep || readRoute()

    writeRoute({ name: 'library', id: null }, { replace: true, depth: 0 })
    depth.current = 0
    const ownerInitial = (initial.name === 'stats' || initial.name === 'links') && !isAdmin
    if (ownerInitial) {
      pendingOwnerRoute.current = initial
      routeRef.current = { name: 'library', id: null }
      setRoute({ name: 'library', id: null })
    } else if (initial.name !== 'library' || initial.action) {
      depth.current = 1
      writeRoute(initial, { replace: false, depth: 1 })
    }

    if (!ownerInitial) {
      routeRef.current = initial
      setRoute(initial)
    }

    if (!ownerInitial && initial.action === 'fav') setFavOnly(true)
    if (!ownerInitial && initial.action === 'decade') setEra(String(initial.value))
    if (!ownerInitial && initial.action === 'search') setQuery(String(initial.value || ''))
    if (!ownerInitial && initial.action === 'radio') setRadioRequested(true)
    if (!ownerInitial && initial.name === 'album' && initial.id) {
      viewAlbumIdRef.current = initial.id
      setViewShell(shellFor(initial.id))
      const hit = peekAlbum(initial.id)
      if (hit && hit.tracks.length) {
        loadedIdRef.current = initial.id
        setViewAlbum(hit); setViewTracks(hit.tracks); setAlbumLoading(false)
      } else {
        setAlbumLoading(true)
        loadInto(initial.id)
      }
    }

    const syncRoute = () => {
      const next = readRoute()
      const st = window.history.state
      depth.current = typeof st?.depth === 'number' ? st.depth : 0
      if (next.name === routeRef.current.name && next.id === routeRef.current.id) return
      applyRoute(next)
    }
    window.addEventListener('popstate', syncRoute)
    window.addEventListener('hashchange', syncRoute)
    return () => { window.removeEventListener('popstate', syncRoute); window.removeEventListener('hashchange', syncRoute) }
  }, [applyRoute, loadInto, peekAlbum, shellFor, isAdmin])

  useEffect(() => {
    const bb = tg?.BackButton
    if (!bb) return
    const handler = () => goBack()
    try {
      if (view !== 'library' || queueOpen) bb.show(); else bb.hide()
      bb.onClick(handler)
    } catch {}
    return () => { try { bb.offClick(handler) } catch {} }
  }, [view, queueOpen, goBack])

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
    if (q) list = list.filter((a) => [a.title, a.creator, a.identifier, catalogOf(a), ...(a.subject || [])].filter(Boolean).join(' ').toLowerCase().includes(q))
    const byDate = (a) => String(a.date || a.publicdate || '')
    const sorted = [...list]
    if (sort === 'new') sorted.sort((a, b) => byDate(b).localeCompare(byDate(a)))
    else if (sort === 'old') sorted.sort((a, b) => byDate(a).localeCompare(byDate(b)))
    else if (sort === 'title') sorted.sort((a, b) => stripCatalog(a.title).localeCompare(stripCatalog(b.title), 'ru'))
    else if (sort === 'artist') sorted.sort((a, b) => String(a.creator || '').localeCompare(String(b.creator || ''), 'ru'))
    return sorted
  }, [visibleAlbums, favOnly, era, query, sort, favs])

  const totalFavs = useMemo(() => visibleAlbums.filter((a) => favs.has(a.identifier)).length, [visibleAlbums, favs])
  const resetFilters = useCallback(() => { setFavOnly(false); setEra('all'); setQuery(''); analytics.event('filter') }, [])
  const filtersActive = favOnly || era !== 'all' || query.trim() !== ''

  useEffect(() => {
    if (view !== 'library' || !filtered.length) return
    if (typeof IntersectionObserver === 'undefined') return
    let io = null
    const timer = setTimeout(() => {
      io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return
          const id = e.target.getAttribute('data-album')
          io.unobserve(e.target)
          if (id) prefetch(id)
        })
      }, { rootMargin: '0px' })
      document.querySelectorAll('[data-album]').forEach((el) => io.observe(el))
    }, 900)
    return () => { clearTimeout(timer); if (io) io.disconnect() }
  }, [view, filtered.length, prefetch])

  const activeId = activeAlbum?.identifier || null
  const albumUnlocked = useMemo(() => {
    if (!activeId) return false
    const prefix = `${activeId}/`
    for (const k of played) if (k.startsWith(prefix)) return true
    return false
  }, [played, activeId])

  const onSearch = useCallback((v) => {
    setQuery(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { if (v.trim()) analytics.event('search') }, 900)
  }, [])

  const clearSearch = useCallback(() => {
    setQuery('')
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchRef.current?.focus()
  }, [])

  const requestPlay = useCallback(() => {
    wantPlay.current = true
    setBuffering(true)
    const a = audioRef.current
    if (a && a.readyState >= 2) a.play().catch(() => {})
  }, [])

  const registerPlay = useCallback(() => {
    if (!current || !playerAlbum) return
    if (countedPlay.current === current.key) return
    countedPlay.current = current.key
    const idx = baseTracks.findIndex((t) => t.key === current.key)
    analytics.play(playerAlbum.identifier, idx >= 0 ? idx : 0, FORMAT_SHORT[current.format] || 'OTHER')
    setPlayed((p) => {
      if (p.has(current.key)) return p
      const n = new Set(p)
      n.add(current.key)
      return new Set([...n].slice(-PLAYED_MAX))
    })
  }, [current, playerAlbum, baseTracks])

  const startAlbum = useCallback((album, tracks, startKey = null, forceShuffle = null) => {
    if (!tracks?.length) return
    const useShuffle = forceShuffle === null ? shuffle : forceShuffle
    const order = useShuffle ? shuffleArr(tracks) : [...tracks]
    if (startKey) { const i = order.findIndex((t) => t.key === startKey); if (i > 0) { const [pick] = order.splice(i, 1); order.unshift(pick) } }
    setPlayerAlbum(album); setBaseTracks(tracks); setQueue(order); setQIndex(0)
    setCurrentTime(0); setBuffered(0); setDuration(order[0]?.duration || 0); setResume(null)
    countedPlay.current = null
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
    const hit = peekAlbum(album.identifier)
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
  }, [fetchAlbum, peekAlbum, startAlbum, toast])

  const startRadio = useCallback(() => {
    const pool = filtered.length ? filtered : visibleAlbums
    if (!pool.length) return
    setShuffle(true)
    playAlbum(pool[Math.floor(Math.random() * pool.length)], { shuffled: true })
    analytics.event('radio')
    toast('Радио запущено — случайный релиз', 'success')
  }, [filtered, visibleAlbums, playAlbum, toast])

  useEffect(() => {
    if (!radioRequested || !visibleAlbums.length) return
    setRadioRequested(false)
    startRadio()
  }, [radioRequested, visibleAlbums, startRadio])

  mainAction.current = {
    play: albumReady ? () => startAlbum(viewAlbum, viewTracks, null, false) : null,
    shuffle: albumReady ? () => { setShuffle(true); startAlbum(viewAlbum, viewTracks, null, true) } : null,
  }

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
          countedPlay.current = null
          requestPlay()
          const nextIdx = (idx + dir + pool.length) % pool.length
          prefetch(pool[nextIdx].identifier, { priority: true })
          return
        }
      } catch {}
    }
    wantPlay.current = false; setBuffering(false)
    toast('Больше нет релизов с аудио', 'warn')
  }, [visibleAlbums, playerAlbum, fetchAlbum, shuffle, requestPlay, toast, prefetch])

  const markSkip = useCallback(() => {
    const a = audioRef.current
    const d = a?.duration
    if (Number.isFinite(d) && d > 0 && a.currentTime / d < 0.9) analytics.event('skip')
  }, [])

  const playNext = useCallback(() => {
    if (!queue.length) return
    markSkip()
    if (qIndex < queue.length - 1) { setQIndex(qIndex + 1); setCurrentTime(0); requestPlay(); haptic() }
    else if (repeat === 'album') { setQIndex(0); setCurrentTime(0); requestPlay() }
    else if (repeat === 'all') nextAlbumAuto(1)
    else { wantPlay.current = false; setBuffering(false); audioRef.current?.pause() }
  }, [queue.length, qIndex, repeat, nextAlbumAuto, requestPlay, haptic, markSkip])

  const playPrev = useCallback(() => {
    const a = audioRef.current
    if (a && a.currentTime > 3) { a.currentTime = 0; setCurrentTime(0); analytics.event('seek'); return }
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
    if (isPlaying) { wantPlay.current = false; setBuffering(false); a?.pause(); analytics.event('pause') }
    else requestPlay()
    haptic()
  }, [current, queue.length, isPlaying, requestPlay, startRadio, haptic])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    if (!session || typeof session.setActionHandler !== 'function') return

    try {
      if (current && playerAlbum && typeof MediaMetadata !== 'undefined') {
        const artwork = playerAlbum.cover
          ? [{ src: playerAlbum.cover, sizes: '512x512', type: 'image/jpeg' }]
          : []
        session.metadata = new MediaMetadata({
          title: current.title,
          artist: asText(playerAlbum.creator) || 'Nenormalizm Recs',
          album: stripCatalog(playerAlbum.title) || playerAlbum.identifier,
          artwork,
        })
      } else if (typeof session.metadata !== 'undefined') {
        session.metadata = null
      }
      if ('playbackState' in session) {
        session.playbackState = isPlaying ? 'playing' : 'paused'
      }

      const handlers = [
        ['play', () => { if (!isPlaying) togglePlay() }],
        ['pause', () => { if (isPlaying) togglePlay() }],
        ['previoustrack', playPrev],
        ['nexttrack', playNext],
        ['seekto', (details) => {
          if (!Number.isFinite(details.seekTime) || !audioRef.current) return
          try { audioRef.current.currentTime = details.seekTime } catch {}
          setCurrentTime(details.seekTime)
        }],
      ]
      handlers.forEach(([action, handler]) => {
        try { session.setActionHandler(action, handler) } catch {}
      })

      return () => {
        handlers.forEach(([action]) => {
          try { session.setActionHandler(action, null) } catch {}
        })
      }
    } catch {
      return
    }
  }, [current, playerAlbum, isPlaying, togglePlay, playPrev, playNext])

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
    analytics.event('shuffle')
    haptic()
  }, [queue, current, baseTracks, qIndex, haptic])

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'album' : 'off'))
    analytics.event('repeat')
    haptic()
  }, [haptic])

  const toggleFav = useCallback((id) => {
    setFavs((f) => {
      const n = new Set(f)
      if (n.has(id)) { n.delete(id); analytics.event('fav_remove', { album: id }) }
      else { n.add(id); analytics.event('fav_add', { album: id }); hapticNotify('success') }
      return n
    })
    haptic()
  }, [haptic])

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
    analytics.event('q_remove')
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
    analytics.event('q_reorder')
  }, [queue, current])

  const restoreOrder = useCallback(() => {
    if (!baseTracks.length) return
    setQueue(baseTracks)
    setQIndex(Math.max(0, baseTracks.findIndex((t) => t.key === current?.key)))
    setShuffle(false)
  }, [baseTracks, current])

  const albumLink = useCallback((album) => {
    const param = paramForAlbum(album.identifier)
    const cfg = getLinkConfig()
    return (cfg.bot && param ? directLink({ bot: cfg.bot, app: cfg.app, param, compact: cfg.compact }) : '') || webLink(param)
  }, [])

  const shareAlbum = useCallback(async (album) => {
    if (!album) return
    const ok = await copyText(albumLink(album))
    toast(ok ? 'Ссылка на релиз скопирована' : 'Не удалось скопировать ссылку', ok ? 'success' : 'error')
  }, [albumLink, toast])

  const shareStory = useCallback((album) => {
    if (!album) return
    const ok = shareToStory(album.cover, {
      text: `${stripCatalog(album.title) || catalogOf(album)} — Nenormalizm Recs`,
      url: albumLink(album),
      name: 'Слушать',
    })
    if (!ok) toast('Истории недоступны в этом клиенте Telegram', 'warn')
  }, [albumLink, toast])

  const downloadTrack = useCallback(async (track) => {
    if (!track || !played.has(track.key)) return
    setDlKey(track.key)
    const name = `${safeFileName(track.title)}${track.ext || '.mp3'}`
    if (caps.download) {
      const res = await downloadFile(track.url, name)
      setDlKey(null)
      if (res.ok) { toast('Трек отправлен в загрузки Telegram', 'success'); hapticNotify('success') }
      else if (res.reason === 'cancelled') toast('Загрузка отменена', 'info')
      else toast('Не удалось скачать трек', 'error', { label: 'Открыть файл', run: () => openExternal(track.url) })
    } else {
      setDlKey(null)
      openExternal(track.url)
    }
  }, [played, caps.download, toast])

  const downloadAlbum = useCallback(async (album) => {
    if (!album || !album.archiveUrl || !albumUnlocked) return
    const size = album.archiveSize ? ` (${fmtSize(album.archiveSize)})` : ''
    const note = album.archiveReady
      ? `Скачать релиз целиком одним ZIP${size}?`
      : `Скачать релиз целиком? Архив собирается на archive.org из аудиофайлов${size}, это может занять время.`
    const ok = await confirmNative(note)
    if (!ok) return
    setDlKey(`album:${album.identifier}`)
    const name = `${safeFileName(`${catalogOf(album)} ${stripCatalog(album.title)}`)}.zip`
    if (caps.download) {
      const res = await downloadFile(album.archiveUrl, name)
      setDlKey(null)
      if (res.ok) { toast('Архив релиза отправлен в загрузки Telegram', 'success'); hapticNotify('success') }
      else if (res.reason === 'cancelled') toast('Загрузка отменена', 'info')
      else toast('Не удалось скачать архив', 'error', { label: 'Открыть на archive.org', run: () => openExternal(album.archiveUrl) })
    } else {
      setDlKey(null)
      openExternal(album.archiveUrl)
    }
  }, [albumUnlocked, caps.download, toast])

  const addHome = useCallback(async () => {
    if (!addToHomeScreen()) { toast('Добавление на экран недоступно', 'warn'); return }
    setTimeout(async () => setHomeStatus(await homeScreenStatus()), 1200)
  }, [toast])

  useEffect(() => { const a = audioRef.current; if (a) a.volume = muted ? 0 : volume }, [volume, muted, current])
  useEffect(() => { setCurrentTime(0); setBuffered(0); setDuration(current?.duration || 0); listenTick.current = null }, [current?.key, current?.duration])

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
    analytics.event('error')
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
    listenTick.current = t
    analytics.event('seek')
  }
  const seekKey = (e) => {
    if (!current || !duration) return
    const a = audioRef.current
    if (!a) return
    if (e.key === 'ArrowRight') { a.currentTime = Math.min(duration, a.currentTime + 5); e.preventDefault(); analytics.event('seek') }
    if (e.key === 'ArrowLeft') { a.currentTime = Math.max(0, a.currentTime - 5); e.preventDefault(); analytics.event('seek') }
    if (e.key === 'Home') { a.currentTime = 0; e.preventDefault() }
    if (e.key === 'End') { a.currentTime = Math.max(0, duration - 1); e.preventDefault() }
  }

  useEffect(() => {
    const pack = () => ({ albumId: playerAlbum.identifier, trackKey: current.key, time: audioRef.current?.currentTime || 0, shuffle, repeat, ts: Date.now() })
    const save = () => {
      if (!current || !playerAlbum) return
      const payload = pack()
      writeLS(K.session, payload)
      if (!hydrating.current && Date.now() - lastSessionPush.current > 25000) {
        lastSessionPush.current = Date.now()
        sync.push('session', payload, { delay: 1200 })
      }
    }
    const final = () => {
      if (!current || !playerAlbum) return
      const payload = pack()
      writeLS(K.session, payload)
      if (!hydrating.current) sync.push('session', payload, { delay: 0 })
      sync.flush()
    }
    const id = setInterval(save, 5000)
    window.addEventListener('pagehide', final)
    return () => { clearInterval(id); window.removeEventListener('pagehide', final); final() }
  }, [current, playerAlbum, shuffle, repeat])

  useEffect(() => {
    if (restored.current || !cloudReady) return
    if (routeRef.current.name === 'album') return
    const s = readLS(K.session, null)
    if (!s?.albumId || !s?.trackKey) return
    if (Date.now() - (s.ts || 0) > 1000 * 60 * 60 * 48) return
    restored.current = true
    fetchAlbum(s.albumId).then((built) => {
      if (!built.tracks.length) return
      const order = s.shuffle ? shuffleArr(built.tracks) : built.tracks
      const idx = order.findIndex((t) => t.key === s.trackKey)
      const finalOrder = idx > 0 ? [order[idx], ...order.filter((_, i) => i !== idx)] : order
      const dur = finalOrder[0]?.duration || 0
      const saved = Number(s.time) || 0
      const startTime = dur > 0 && saved >= dur - 5 ? 0 : saved
      setPlayerAlbum(built); setBaseTracks(built.tracks); setQueue(finalOrder); setQIndex(0)
      if (typeof s.shuffle === 'boolean') setShuffle(s.shuffle)
      if (s.repeat) setRepeat(s.repeat)
      pendingSeek.current = startTime
      setCurrentTime(startTime)
      setDuration(dur)
      if (startTime > 5) setResume({ time: startTime })
    }).catch(() => {})
  }, [fetchAlbum, cloudReady])

  useEffect(() => {
    const onKey = (e) => {
      if (sortOpen) return
      const t = e.target
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (e.key === 'Escape') {
        if (queueOpen) { setQueueOpen(false); e.preventDefault(); return }
        if (typing) {
          if (t === searchRef.current && query) { clearSearch(); e.preventDefault(); return }
          t.blur(); hideKeyboard(); return
        }
        if (view !== 'library') { goBack(); e.preventDefault() }
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/' && view === 'library') { e.preventDefault(); searchRef.current?.focus(); return }
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
        case 'f': case 'F': case 'а': if (caps.fullscreen) { toggleFullscreen(); setFullscreen(isFullscreen()) } break
        default: break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sortOpen, togglePlay, toggleShuffle, cycleRepeat, playNext, playPrev, goBack, view, queueOpen, current, duration, caps.fullscreen, query, clearSearch])

  const goToPlaying = useCallback(() => {
    if (!playerAlbum) return
    if (loadedIdRef.current !== playerAlbum.identifier) {
      reqToken.current += 1
      viewAlbumIdRef.current = playerAlbum.identifier
      loadedIdRef.current = playerAlbum.identifier
      metaCache.current.set(playerAlbum.identifier, playerAlbum)
      setViewShell(playerAlbum)
      setViewAlbum(playerAlbum)
      setViewTracks(baseTracks)
      setAlbumLoading(false); setAlbumError(''); setDescOpen(false)
    }
    navigate({ name: 'album', id: playerAlbum.identifier })
  }, [playerAlbum, baseTracks, navigate])

  const shownTime = scrub != null ? scrub : currentTime
  const totalView = viewTracks.reduce((s, t) => s + (t.duration || 0), 0)
  const seekPct = duration ? Math.min(100, (shownTime / duration) * 100) : 0
  const playedInView = viewTracks.filter((t) => played.has(t.key)).length

  return (
    <>
      <div className="atmos" aria-hidden="true"><span className="blob b1" /><span className="blob b2" /><span className="blob b3" /></div>
      <div className="top-shield" aria-hidden="true" />

      <div className="app">
        <audio
          ref={audioRef}
          src={current?.url}
          preload="metadata"
          onPlay={() => { setIsPlaying(true); setBuffering(false); setResume(null); registerPlay() }}
          onPlaying={() => { setBuffering(false); registerPlay() }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            if (current && playerAlbum) {
              const idx = baseTracks.findIndex((t) => t.key === current.key)
              analytics.complete(playerAlbum.identifier, idx >= 0 ? idx : 0)
            }
            playNext()
          }}
          onCanPlay={onCanPlay}
          onLoadedMetadata={(e) => { setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : (current?.duration || 0)); onCanPlay() }}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime
            if (!scrubbing.current) setCurrentTime(t)
            analytics.tick(t, isPlaying && !scrubbing.current, listenTick)
          }}
          onProgress={onProgress}
          onWaiting={() => setBuffering(true)}
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
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(e) => onSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.currentTarget.blur(); hideKeyboard() }
                      if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); clearSearch() }
                    }}
                    enterKeyHint="search"
                    autoComplete="off"
                    spellCheck="false"
                    placeholder="Поиск: релиз, артист, каталог, теги…"
                    aria-label="Поиск по каталогу"
                  />
                  {query
                    ? <button className="search-clear" onClick={clearSearch} aria-label="Очистить поиск" title="Очистить"><IClose size={15} /></button>
                    : <span className="search-kbd" aria-hidden="true">/</span>}
                </div>

                <button className="btn btn-primary tb-radio" onClick={startRadio} disabled={!visibleAlbums.length}>
                  <IPlay size={15} /> Радио
                </button>

                <div className="chips tb-chips" role="group" aria-label="Фильтры">
                  <button className="chip fav" aria-pressed={favOnly} onClick={() => { setFavOnly((v) => !v); analytics.event('filter') }}>
                    <IHeart size={13} filled={favOnly} /> Избранное{totalFavs > 0 ? ` · ${totalFavs}` : ''}
                  </button>
                  {decades.map((d) => (
                    <button key={d} className="chip era" aria-pressed={String(era) === String(d)} onClick={() => { setEra(String(era) === String(d) ? 'all' : String(d)); analytics.event('filter') }}>{d}-е</button>
                  ))}
                </div>

                <SortMenu
                  value={sort}
                  options={sortOptions}
                  count={filtered.length}
                  open={sortOpen}
                  onOpenChange={setSortOpen}
                  onChange={(v) => { setSort(v); analytics.event('filter'); haptic() }}
                />

                <button className="icon-btn tb-density" aria-pressed={density === 'list'} onClick={() => { setDensity(density === 'grid' ? 'list' : 'grid'); analytics.event('filter') }} aria-label="Плотность списка" title="Плитка / список">
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
                {sync.enabled && <><span className="sep">/</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><ICloud size={13} /> синхронизация</span></>}
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
                    const warm = () => prefetch(a.identifier, { priority: true })
                    return (
                      <div
                        key={a.identifier}
                        data-album={a.identifier}
                        className={cx('card', playing && 'playing')}
                        style={{ animationDelay: `${Math.min(i, 16) * 26}ms` }}
                        role="button"
                        tabIndex={0}
                        onPointerEnter={warm}
                        onPointerDown={warm}
                        onFocus={warm}
                        onTouchStart={warm}
                        onClick={() => navigate({ name: 'album', id: a.identifier })}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate({ name: 'album', id: a.identifier }) } }}
                        aria-label={`Открыть релиз ${a.title}`}
                      >
                        <div className="card-cover-wrap">
                          <Cover className="card-cover" src={coverUrl(a.identifier)} alt={a.title} seed={a.identifier} />
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
                          {a.subject?.length && (
                            <div className="card-tags">
                              {a.subject.slice(0, 4).map((tag) => (
                                <span key={tag} className="tag-chip">{tag}</span>
                              ))}
                            </div>
                          )}
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

              <div className="album-foot" style={{ paddingTop: 22, paddingBottom: 6 }}>
                <IDisc size={14} />
                <span>Архив лейбла</span>
                {caps.homeScreen && homeStatus !== 'added' && homeStatus !== 'unsupported' && (
                  <button className="btn btn-quiet" style={{ height: 32, padding: '0 12px', fontSize: 12.5, marginLeft: 'auto' }} onClick={addHome}>
                    <IHome size={14} /> На экран телефона
                  </button>
                )}
                {caps.fullscreen && (
                  <button className="btn btn-quiet" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }} onClick={() => { toggleFullscreen(); setFullscreen(isFullscreen()) }}>
                    {fullscreen ? <><ICollapse size={14} /> Обычный режим</> : <><IExpand size={14} /> Полный экран</>}
                  </button>
                )}
                {isAdmin && (
                  <>
                    <button className="btn btn-quiet" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }} onClick={() => navigate({ name: 'links', id: null })} title="Ссылки">
                      <ILink size={14} /> Ссылки
                    </button>
                    <button className="btn btn-quiet" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }} onClick={() => navigate({ name: 'stats', id: null })} title="Статистика">
                      <IChart size={14} /> Статистика
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {view === 'album' && activeAlbum && (
          <>
            <div className="album-bar">
              <div className="wrap album-bar-in">
                <button className="back-btn" onClick={goBack}><IBack size={17} /> Назад к каталогу</button>
                <button className="bar-logo" onClick={goHome} aria-label="В каталог"><Logo h={32} playing={isPlaying} /></button>
                <span className="crumb">Библиотека / {catalogOf(activeAlbum)}</span>
                <div className="bar-actions">
                  <button className="icon-btn" onClick={() => shareAlbum(activeAlbum)} aria-label="Скопировать ссылку на релиз" title="Скопировать ссылку">
                    <ILink size={17} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-pressed={favs.has(activeAlbum.identifier)}
                    style={favs.has(activeAlbum.identifier) ? { color: 'var(--magenta)', borderColor: 'var(--magenta)' } : undefined}
                    onClick={() => toggleFav(activeAlbum.identifier)}
                    aria-label={favs.has(activeAlbum.identifier) ? 'Убрать из избранного' : 'В избранное'}
                  >
                    <IHeart size={17} filled={favs.has(activeAlbum.identifier)} />
                  </button>
                  <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Сменить тему">
                    {theme === 'dark' ? <ISun size={17} /> : <IMoon size={17} />}
                  </button>
                </div>
              </div>
            </div>

            {albumError && !albumReady && (
              <div className="wrap">
                <div className="state error">
                  <div className="state-icon"><IAlert size={24} /></div>
                  <h3>Релиз не открылся</h3>
                  <p>{albumError}</p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => { setAlbumError(''); setAlbumLoading(true); loadInto(activeAlbum.identifier) }}><IRetry size={15} /> Повторить</button>
                    <button className="btn btn-ghost" onClick={goBack}><IBack size={15} /> В каталог</button>
                  </div>
                </div>
              </div>
            )}

            <div className="hero">
              <Cover className="hero-bg" src={activeAlbum.cover} alt="" seed={activeAlbum.identifier} eager />
              <div className="hero-fade" />
              <div className="wrap hero-in">
                <Cover className="hero-cover" src={activeAlbum.cover} alt={activeAlbum.title || activeAlbum.identifier} seed={activeAlbum.identifier} eager />
                <div>
                  <div className="hero-cat"><IDisc size={13} /> {catalogOf(activeAlbum)}</div>
                  {activeAlbum.title
                    ? <h1 className="hero-title">{stripCatalog(activeAlbum.title) || activeAlbum.identifier}</h1>
                    : <div className="sk sk-line" style={{ height: 30, width: '78%', marginBottom: 10 }} />}
                  {activeAlbum.creator
                    ? <div className="hero-artist">{activeAlbum.creator}</div>
                    : (albumLoading && <div className="sk sk-line" style={{ height: 15, width: '42%', marginBottom: 16 }} />)}
                  <div className="hero-meta">
                    {yearOf(activeAlbum) && <span className="tag accent">{yearOf(activeAlbum)}</span>}
                    {albumReady ? (
                      <>
                        <span className="tag">{viewTracks.length} {pluralTracks(viewTracks.length)}</span>
                        {totalView > 0 && <span className="tag">{fmtTime(totalView)}</span>}
                        {viewAlbum.subjects.map((s) => <span className="tag cyan" key={s}>{s}</span>)}
                      </>
                    ) : (
                      <>
                        <span className="sk" style={{ width: 74, height: 22, borderRadius: 6 }} />
                        <span className="sk" style={{ width: 58, height: 22, borderRadius: 6 }} />
                        <span className="sk" style={{ width: 92, height: 22, borderRadius: 6 }} />
                      </>
                    )}
                  </div>
                  <div className="hero-actions">
                    <button className="btn btn-primary" onClick={() => startAlbum(viewAlbum, viewTracks, null, false)} disabled={!albumReady}>
                      <IPlay size={15} /> Слушать релиз
                    </button>
                    <button className="btn btn-ghost" onClick={() => { setShuffle(true); startAlbum(viewAlbum, viewTracks, null, true) }} disabled={!albumReady}>
                      <IShuffle size={15} /> Вперемешку
                    </button>
                    {caps.story && <button className="btn btn-ghost" onClick={() => shareStory(activeAlbum)}><IStory size={15} /> В историю</button>}
                    {albumReady && albumUnlocked && (
                      <button className="btn btn-ghost" onClick={() => downloadAlbum(viewAlbum)} disabled={dlKey === `album:${viewAlbum.identifier}`}>
                        <IAlbumZip size={15} />
                        {dlKey === `album:${viewAlbum.identifier}` ? 'Готовим архив…' : `Скачать релиз ZIP${viewAlbum.archiveSize ? ` · ${fmtSize(viewAlbum.archiveSize)}` : ''}`}
                      </button>
                    )}
                  </div>
                  {!albumUnlocked && (
                    <div className="hero-hint">Загрузка откроется после прослушивания: отдельный трек — после его воспроизведения, весь релиз — после любого трека из него.</div>
                  )}
                  {albumReady && viewAlbum.description && (
                    <div className="desc">
                      {viewAlbum.description.length > 320 && !descOpen ? viewAlbum.description.slice(0, 320).trimEnd() + '…' : viewAlbum.description}
                      {viewAlbum.description.length > 320 && (
                        <button className="desc-toggle" onClick={() => setDescOpen((v) => !v)}>{descOpen ? 'Свернуть ▲' : 'Показать полностью ▼'}</button>
                      )}
                    </div>
                  )}
                  {!albumReady && albumLoading && !albumError && (
                    <div className="desc" aria-hidden="true">
                      <div className="sk sk-line" />
                      <div className="sk sk-line" />
                      <div className="sk sk-line w60" style={{ marginBottom: 0 }} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="wrap">
              {playerAlbum && current && playerAlbum.identifier !== activeAlbum.identifier && (
                <div className="now-other">
                  <span className="lbl">Сейчас играет</span>
                  <span className="txt">{current.title} — {stripCatalog(playerAlbum.title)}</span>
                  <button className="btn btn-ghost" style={{ height: 32, fontSize: 12.5 }} onClick={goToPlaying}><IUp size={14} /> Перейти</button>
                </div>
              )}

              <div className="tracks">
                <div className="tracks-head">
                  <h3>Треклист</h3>
                  {albumReady
                    ? <span className="sum">{viewTracks.length} · {fmtTime(totalView)}{playedInView ? ` · прослушано ${playedInView}` : ''}</span>
                    : <span className="sum" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span className="spinner" style={{ width: 12, height: 12 }} /> загружаем</span>}
                </div>
                {albumReady ? (
                  <div role="list">
                    {viewTracks.map((t, i) => {
                      const isCur = current?.key === t.key
                      const canDl = played.has(t.key)
                      return (
                        <div
                          key={t.key}
                          role="listitem button"
                          tabIndex={0}
                          className="track"
                          aria-current={isCur ? 'true' : undefined}
                          onClick={() => playFromView(t)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playFromView(t) } }}
                          title={t.title}
                        >
                          <span className="t-num">{isCur ? <Eq paused={!isPlaying} /> : String(i + 1).padStart(2, '0')}</span>
                          <span className="t-title">{t.title}</span>
                          <span className="t-fmt">{FORMAT_SHORT[t.format] || t.format}</span>
                          <span className="t-time">{t.duration ? fmtTime(t.duration) : '—'}</span>
                          {canDl ? (
                            <button
                              className="t-dl"
                              onClick={(e) => { e.stopPropagation(); downloadTrack(t) }}
                              disabled={dlKey === t.key}
                              aria-label={`Скачать ${t.title}`}
                              title="Скачать трек"
                            >
                              {dlKey === t.key ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <IDownload size={15} />}
                            </button>
                          ) : <span className="t-slot" aria-hidden="true" />}
                        </div>
                      )
                    })}
                  </div>
                ) : <TrackSkeletons n={6} />}
              </div>

              <div className="album-foot">
                <IDisc size={14} /><span>Источник:</span>
                <button className="btn btn-quiet" style={{ height: 30, padding: '0 8px', fontSize: 12 }} onClick={() => openExternal(`https://archive.org/details/${encodeURIComponent(activeAlbum.identifier)}`, true)}>
                  archive.org/details/{activeAlbum.identifier}
                </button>
              </div>
            </div>
          </>
        )}

        {view === 'stats' && <Stats albums={visibleAlbums} onBack={goBack} />}
        {view === 'links' && <Links albums={visibleAlbums} onBack={goBack} currentAlbumId={activeId} />}

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