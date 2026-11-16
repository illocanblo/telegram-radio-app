import { useEffect, useMemo, useState, useCallback } from 'react'
import { analytics, summaryOf } from './analytics.js'

const CSS = `
.st{padding-top:18px;padding-bottom:8px;animation:stIn .4s var(--ease) both}
@keyframes stIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.st-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.st-head h1{font-size:22px;font-weight:800;letter-spacing:-.02em;flex:1;min-width:180px}
.st-src{display:flex;gap:6px}
.st-status{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.st-pill{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px;border-radius:99px;border:1px solid var(--border-strong);background:var(--surface);font-size:12px;font-family:var(--mono);color:var(--muted)}
.st-pill i{width:8px;height:8px;border-radius:50%;flex:none;background:var(--dim)}
.st-pill.ok i{background:var(--success);box-shadow:0 0 8px var(--success)}
.st-pill.bad i{background:var(--danger);box-shadow:0 0 8px var(--danger)}
.st-pill.warn i{background:var(--warning);box-shadow:0 0 8px var(--warning)}
.st-note{font-size:12.5px;color:var(--muted);line-height:1.6;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-m);padding:12px 14px;margin-bottom:14px}
.st-note b{color:var(--text)}
.st-note.warn{border-color:rgba(255,180,61,.35);background:rgba(255,180,61,.08)}
.st-note.warn b{color:var(--warning)}
.st-probe{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.st-probe .res{font-size:12.5px;color:var(--muted);flex:1;min-width:180px}
.st-probe .res.ok{color:var(--success)}
.st-probe .res.bad{color:var(--danger)}
.st-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}
.st-kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-l);padding:14px 16px;position:relative;overflow:hidden}
.st-kpi::after{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--k,var(--acid))}
.st-kpi span{display:block;font-size:11px;font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
.st-kpi b{display:block;font-size:26px;font-weight:800;letter-spacing:-.03em;margin-top:6px;line-height:1}
.st-kpi i{font-style:normal;font-size:11.5px;color:var(--muted);display:block;margin-top:5px}
.st-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-l);padding:16px;margin-bottom:14px}
.st-card h3{font-size:12px;font-family:var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.st-card h3 em{font-style:normal;margin-left:auto;color:var(--muted);letter-spacing:0;text-transform:none;font-family:var(--font);font-size:12px}
.st-card p{font-size:12.5px;color:var(--muted);line-height:1.6;margin-bottom:12px}
.st-card p b{color:var(--text)}
.st-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.st-bars{display:flex;align-items:flex-end;gap:3px;height:132px}
.st-bar{flex:1;min-width:4px;display:flex;flex-direction:column;justify-content:flex-end;height:100%;position:relative}
.st-bar u{display:block;text-decoration:none;border-radius:3px 3px 0 0;background:linear-gradient(180deg,var(--acid),var(--cyan));min-height:2px;transition:opacity .15s}
.st-bar:hover u{opacity:.72}
.st-axis{display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;color:var(--dim);margin-top:10px}
.st-list{display:flex;flex-direction:column;gap:9px}
.st-row{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:10px;align-items:center;font-size:13px}
.st-row i{font-style:normal;font-family:var(--mono);font-size:11px;color:var(--dim)}
.st-row .lbl{min-width:0}
.st-row .lbl b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-row .lbl s{display:block;text-decoration:none;font-family:var(--mono);font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.05em}
.st-row .bar{position:relative;height:4px;border-radius:99px;background:var(--ink-600);margin-top:5px;overflow:hidden}
.st-row .bar u{position:absolute;left:0;top:0;bottom:0;text-decoration:none;background:linear-gradient(90deg,var(--cyan),var(--acid))}
.st-row var{font-style:normal;font-family:var(--mono);font-size:12px;color:var(--muted);white-space:nowrap}
.st-stack{display:flex;height:12px;border-radius:99px;overflow:hidden;background:var(--ink-600);margin-bottom:12px}
.st-stack u{text-decoration:none;display:block}
.st-legend{display:flex;flex-wrap:wrap;gap:10px}
.st-legend span{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);font-family:var(--mono)}
.st-legend i{width:8px;height:8px;border-radius:2px;flex:none}
.st-key{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.st-key input{height:40px;flex:1 1 200px;min-width:0;padding:0 14px;border-radius:99px;border:1px solid var(--border-strong);background:var(--surface-2);color:var(--text);font:inherit;font-size:13px;outline:none}
.st-key input:focus{border-color:var(--acid);box-shadow:0 0 0 3px rgba(198,255,61,.16)}
.st-empty{padding:26px 8px;text-align:center;color:var(--dim);font-size:13px}
.st-err{color:var(--danger);font-size:12.5px;margin-top:10px}
.st-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
@media (max-width:640px){
  .st-head h1{font-size:19px}
  .st-kpi b{font-size:22px}
  .st-bars{height:110px}
}
`

let styled = false
function injectCss() {
  if (styled || typeof document === 'undefined') return
  const el = document.createElement('style')
  el.setAttribute('data-nr-stats', '')
  el.textContent = CSS
  document.head.appendChild(el)
  styled = true
}

const PALETTE = ['var(--acid)', 'var(--cyan)', 'var(--magenta)', 'var(--amber)', 'var(--violet)', 'var(--success)', 'var(--info)', 'var(--ink-500)']
const PLAT_RU = { ios: 'iOS', android: 'Android', desktop: 'Desktop', web: 'Web', other: 'Прочее' }
const nfmt = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0))
const minutes = (sec) => Math.round((sec || 0) / 60)

function Kpi({ label, value, hint, color }) {
  return <div className="st-kpi" style={{ '--k': color }}><span>{label}</span><b>{value}</b>{hint && <i>{hint}</i>}</div>
}

function Pill({ state, children }) {
  return <span className={`st-pill ${state}`}><i />{children}</span>
}

function Daily({ series, field }) {
  const rows = series.slice(-30)
  if (!rows.length) return <div className="st-empty">Пока нет данных</div>
  const max = Math.max(1, ...rows.map((r) => r[field] || 0))
  return (
    <>
      <div className="st-bars">
        {rows.map((r) => (
          <div className="st-bar" key={r.day} title={`${r.day}: ${nfmt(r[field] || 0)}`}>
            <u style={{ height: `${Math.max(2, ((r[field] || 0) / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="st-axis">
        <span>{rows[0].day.slice(5)}</span><span>макс {nfmt(max)}</span><span>{rows[rows.length - 1].day.slice(5)}</span>
      </div>
    </>
  )
}

function Stack({ data, labels = {} }) {
  const entries = Object.entries(data || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((s, [, v]) => s + v, 0)
  if (!total) return <div className="st-empty">Пока нет данных</div>
  return (
    <>
      <div className="st-stack">
        {entries.map(([k, v], i) => (
          <u key={k} style={{ width: `${(v / total) * 100}%`, background: PALETTE[i % PALETTE.length] }} title={`${labels[k] || k}: ${nfmt(v)}`} />
        ))}
      </div>
      <div className="st-legend">
        {entries.map(([k, v], i) => (
          <span key={k}><i style={{ background: PALETTE[i % PALETTE.length] }} />{labels[k] || k} · {Math.round((v / total) * 100)}%</span>
        ))}
      </div>
    </>
  )
}

function TopList({ rows, render }) {
  if (!rows.length) return <div className="st-empty">Пока нет данных</div>
  const max = Math.max(1, ...rows.map((r) => r.plays || 0))
  return (
    <div className="st-list">
      {rows.slice(0, 10).map((r, i) => {
        const info = render(r)
        return (
          <div className="st-row" key={r.key || r.id}>
            <i>{String(i + 1).padStart(2, '0')}</i>
            <div className="lbl">
              <b title={info.title}>{info.title}</b>
              <s>{info.sub}</s>
              <div className="bar"><u style={{ width: `${((r.plays || 0) / max) * 100}%` }} /></div>
            </div>
            <var>{nfmt(r.plays)}</var>
          </div>
        )
      })}
    </div>
  )
}

export default function Stats({ albums = [], onBack }) {
  injectCss()
  const [tick, setTick] = useState(0)
  const [status, setStatus] = useState(() => analytics.status())
  const [source, setSource] = useState('device')
  const [key, setKey] = useState(() => { try { return sessionStorage.getItem('nr.stats.key') || '' } catch { return '' } })
  const [remote, setRemote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [range, setRange] = useState(30)
  const [metric, setMetric] = useState('play')
  const [undo, setUndo] = useState(null)
  const [probe, setProbe] = useState(null)
  const [probing, setProbing] = useState(false)
  const [sent, setSent] = useState(null)
  const [sending, setSending] = useState(false)

  const sync = useCallback(() => { setTick((t) => t + 1); setStatus(analytics.status()) }, [])

  useEffect(() => analytics.subscribe(sync), [sync])
  useEffect(() => { analytics.probe().then(sync) }, [sync])

  const local = useMemo(() => summaryOf(analytics.getLocal()), [tick])

  const albumIndex = useMemo(() => {
    const m = new Map()
    albums.forEach((a) => m.set(a.identifier, a))
    return m
  }, [albums])

  const albumTitle = useCallback((id) => {
    const a = albumIndex.get(id)
    if (!a) return id
    return String(a.title || '').replace(/^\s*\[[^\]]*\]\s*/, '').trim() || id
  }, [albumIndex])

  const albumCat = useCallback((id) => {
    const a = albumIndex.get(id)
    const m = a && String(a.title || '').match(/\[([^\]]+)\]/)
    const y = a && String(a.date || a.publicdate || '').match(/(\d{4})/)
    return [m ? m[1] : String(id).slice(0, 14), y ? y[1] : null].filter(Boolean).join(' · ')
  }, [albumIndex])

  const load = useCallback(async (days = range) => {
    if (!key.trim()) { setErr('Введите ключ STATS_KEY из настроек Vercel'); return }
    setBusy(true); setErr('')
    try {
      const r = await fetch(`/api/summary?days=${days}`, { headers: { 'x-stats-key': key.trim() }, credentials: 'omit', cache: 'no-store' })
      if (r.status === 401) throw new Error('Ключ не подходит')
      if (r.status === 503) throw new Error('Хранилище или STATS_KEY не настроены на сервере')
      if (!r.ok) throw new Error(`Сервер ответил ${r.status}`)
      setRemote(await r.json())
      try { sessionStorage.setItem('nr.stats.key', key.trim()) } catch {}
    } catch (e) {
      setErr(e?.message || 'Не удалось получить сводку')
    } finally { setBusy(false) }
  }, [key, range])

  const openAudience = useCallback(() => {
    setSource('audience')
    setErr('')
    if (!remote && key.trim()) load()
  }, [remote, key, load])

  const forgetKey = useCallback(() => {
    setRemote(null); setKey(''); setErr('')
    try { sessionStorage.removeItem('nr.stats.key') } catch {}
  }, [])

  const runProbe = useCallback(async () => {
    setProbing(true)
    setProbe(await analytics.testSend())
    setProbing(false)
    analytics.probe().then(sync)
  }, [sync])

  const sendNow = useCallback(async () => {
    setSending(true)
    setSent(await analytics.flushNow())
    setSending(false)
    sync()
  }, [sync])

  const data = source === 'audience' && remote ? remote : local
  const totals = data.totals || {}
  const series = source === 'audience' && remote
    ? remote.days
    : local.days.map((d) => ({ day: d, ...analytics.getLocal().days[d] }))

  const starts = totals.play || 0
  const completes = totals.complete || 0
  const rate = starts ? Math.round((completes / starts) * 100) : 0
  const avg = starts ? Math.round((totals.listenSec || 0) / starts) : 0
  const audienceEmpty = source === 'audience' && remote && !starts && !totals.sessions

  const exportJson = () => {
    const payload = source === 'audience' && remote ? { scope: 'audience', ...remote } : { scope: 'device', ...analytics.getLocal() }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `nenormalizm-stats-${source}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  const resetLocal = () => { setUndo(analytics.reset()); setTimeout(() => setUndo(null), 8000) }

  return (
    <div className="wrap st">
      <div className="st-head">
        <button className="back-btn" onClick={onBack}>← Назад к каталогу</button>
        <h1>Статистика</h1>
        <div className="st-src">
          <button className="chip" aria-pressed={source === 'device'} onClick={() => setSource('device')}>Это устройство</button>
          <button className="chip" aria-pressed={source === 'audience'} onClick={openAudience} disabled={busy}>Аудитория</button>
        </div>
      </div>

      <div className="st-status">
        <Pill state={!status.reachable ? 'bad' : status.telemetry ? 'ok' : 'warn'}>
          сбор {!status.reachable ? 'недоступен' : status.telemetry ? 'включён' : 'выключен'}
        </Pill>
        <Pill state={status.storage ? 'ok' : 'bad'}>хранилище {status.storage ? 'готово' : 'не настроено'}</Pill>
        <Pill state={status.summary ? 'ok' : 'bad'}>ключ сводки {status.summary ? 'задан' : 'не задан'}</Pill>
        <Pill state={status.transmitting ? 'ok' : 'warn'}>
          отправка {status.transmitting ? (status.override && status.privacyBlocked ? 'разрешена вручную' : 'активна') : status.privacyBlocked ? 'заблокирована DNT' : 'не идёт'}
        </Pill>
        <Pill state="ok">платформа {PLAT_RU[status.platform] || status.platform}</Pill>
        <Pill state={status.pending ? 'warn' : 'ok'}>в очереди {status.pending}</Pill>
      </div>

      <div className="st-probe">
        <button className="btn btn-ghost" onClick={runProbe} disabled={probing}>{probing ? 'Проверяем…' : 'Проверить приёмник'}</button>
        <button className="btn btn-ghost" onClick={sendNow} disabled={sending}>{sending ? 'Отправляем…' : 'Отправить сейчас'}</button>
        <span className={`res ${sent ? (sent.ok ? 'ok' : 'bad') : probe ? (probe.ok ? 'ok' : 'bad') : ''}`}>
          {sent ? sent.message : probe ? probe.message : 'Проверка отправляет пустой пакет и не записывает данных.'}
        </span>
      </div>

      {status.privacyBlocked && (
        <div className="st-card">
          <h3>Do Not Track</h3>
          <p>
            Этот браузер передаёт сигнал <b>Do Not Track</b>, поэтому приложение по умолчанию
            ничего не отправляет — ни по вам, ни по другим слушателям с таким же сигналом.
            Локальные счётчики при этом продолжают работать. Разрешение ниже действует
            <b> только на этом устройстве и только до конца сессии</b>, на остальных слушателей оно не влияет.
          </p>
          <div className="st-actions">
            <button
              className={status.override ? 'btn btn-ghost' : 'btn btn-primary'}
              onClick={() => { analytics.setOverride(!status.override); setSent(null); sync() }}
            >
              {status.override ? 'Запретить снова' : 'Разрешить для этого устройства'}
            </button>
          </div>
        </div>
      )}

      <div className="st-note">
        {source === 'device' ? (
          <>
            <b>Локальные данные.</b> Счётчики хранятся только в этом браузере. Идентификаторы пользователей,
            IP, cookies и текст поисковых запросов не собираются. Агрегаты по всей аудитории — на вкладке
            «Аудитория» после ввода ключа.
          </>
        ) : (
          <>
            <b>Аудитория.</b> Обезличенные суммы по дням: события, релизы, треки, класс платформы, тема,
            формат, секунды прослушивания. Без идентификаторов людей, без IP и без cookies.
          </>
        )}
      </div>

      {source === 'audience' && !remote && (
        <div className="st-card">
          <h3>Доступ к сводке</h3>
          <p>Введите значение переменной <b>STATS_KEY</b> из Vercel → Settings → Environments → Production.</p>
          <div className="st-key">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Ключ STATS_KEY"
              aria-label="Ключ доступа к сводке"
              onKeyDown={(e) => { if (e.key === 'Enter') load() }}
            />
            <select className="select" value={range} onChange={(e) => setRange(Number(e.target.value))} aria-label="Период">
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={90}>90 дней</option>
            </select>
            <button className="btn btn-primary" onClick={() => load()} disabled={busy}>{busy ? 'Загрузка…' : 'Открыть'}</button>
          </div>
          {err && <div className="st-err">{err}</div>}
        </div>
      )}

      {audienceEmpty && (
        <div className="st-note warn">
          <b>В хранилище пока пусто.</b> События уходят раз в минуту и при закрытии вкладки.
          Послушайте трек, нажмите «Отправить сейчас», затем «Обновить». Если у слушателей включён
          Do Not Track, их события не отправляются — это ожидаемо.
        </div>
      )}

      {(source === 'device' || remote) && (
        <>
          <div className="st-kpis">
            <Kpi label="Сессии" value={nfmt(totals.sessions)} hint="открытий приложения" color="var(--cyan)" />
            <Kpi label="Прослушивания" value={nfmt(starts)} hint={`${nfmt(totals.radio)} запусков радио`} color="var(--acid)" />
            <Kpi label="Минуты" value={nfmt(minutes(totals.listenSec))} hint={`в среднем ${avg} c на трек`} color="var(--violet)" />
            <Kpi label="Дослушали" value={`${rate}%`} hint={`${nfmt(completes)} из ${nfmt(starts)}`} color="var(--success)" />
            <Kpi label="В избранном" value={nfmt(totals.fav_add)} hint={`${nfmt(totals.fav_remove)} снятий`} color="var(--magenta)" />
            <Kpi label="Ошибки" value={nfmt(totals.error)} hint={`${nfmt(totals.skip)} пропусков`} color="var(--danger)" />
          </div>

          <div className="st-card">
            <h3>
              Динамика
              <em>
                <select className="select" value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Метрика" style={{ height: 30 }}>
                  <option value="play">Прослушивания</option>
                  <option value="sessions">Сессии</option>
                  <option value="complete">Дослушивания</option>
                  <option value="listenSec">Секунды</option>
                  <option value="radio">Радио</option>
                  <option value="search">Поиск</option>
                </select>
              </em>
            </h3>
            <Daily series={series} field={metric} />
          </div>

          <div className="st-cols">
            <div className="st-card">
              <h3>Топ релизов <em>{data.topAlbums?.length || 0}</em></h3>
              <TopList rows={data.topAlbums || []} render={(r) => ({ title: albumTitle(r.id), sub: albumCat(r.id) })} />
            </div>
            <div className="st-card">
              <h3>Топ треков <em>{data.topTracks?.length || 0}</em></h3>
              <TopList rows={data.topTracks || []} render={(r) => ({ title: `Трек ${String((r.index ?? 0) + 1).padStart(2, '0')}`, sub: albumTitle(r.album) })} />
            </div>
          </div>

          <div className="st-cols">
            <div className="st-card"><h3>Платформы</h3><Stack data={data.plat} labels={PLAT_RU} /></div>
            <div className="st-card"><h3>Тема</h3><Stack data={data.theme} labels={{ dark: 'Тёмная', light: 'Светлая' }} /></div>
            <div className="st-card"><h3>Форматы</h3><Stack data={data.fmt} /></div>
          </div>

          <div className="st-card">
            <h3>Действия</h3>
            <div className="st-actions">
              <button className="btn btn-ghost" onClick={exportJson}>Скачать JSON</button>
              {source === 'audience' && remote && <button className="btn btn-ghost" onClick={() => load(range)} disabled={busy}>Обновить</button>}
              {source === 'audience' && remote && <button className="btn btn-quiet" onClick={forgetKey}>Сменить ключ</button>}
              {source === 'device' && <button className="btn btn-ghost" onClick={resetLocal}>Сбросить локальные данные</button>}
              {undo && <button className="btn btn-primary" onClick={() => { analytics.restore(undo); setUndo(null) }}>Отменить сброс</button>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}