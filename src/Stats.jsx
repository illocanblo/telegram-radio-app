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
.st-note.bad{border-color:rgba(255,84,112,.35);background:rgba(255,84,112,.08)}
.st-note.bad b{color:var(--danger)}
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
.st-err{color:var(--danger);font-size:12.5px;margin-top:10px;line-height:1.55;word-break:break-word}
.st-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.st-wiz{border:1px solid var(--border-strong);border-radius:var(--radius-l);background:linear-gradient(180deg,rgba(198,255,61,.05),transparent 120px),var(--surface);padding:16px;margin-bottom:14px}
.st-wiz > h3{font-size:12px;font-family:var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--accent-text);margin-bottom:4px;display:flex;align-items:center;gap:8px}
.st-wiz > h3 em{font-style:normal;margin-left:auto;font-family:var(--font);letter-spacing:0;text-transform:none;color:var(--muted);font-size:12px}
.st-wiz > p{font-size:12.5px;color:var(--muted);line-height:1.6;margin-bottom:6px}
.st-step{display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px;padding:13px 0;border-bottom:1px solid var(--border)}
.st-step:last-child{border-bottom:0;padding-bottom:2px}
.st-num{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-family:var(--mono);font-size:12px;font-weight:700;border:1px solid var(--border-strong);color:var(--dim);background:var(--surface-2);transition:all .2s var(--ease)}
.st-step.done .st-num{background:var(--success);border-color:var(--success);color:#04140d}
.st-step.active .st-num{background:var(--acid);border-color:var(--acid);color:var(--acid-ink);box-shadow:0 0 14px rgba(198,255,61,.4)}
.st-step .body{min-width:0}
.st-step .body > b{display:block;font-size:13.5px;font-weight:650;margin-bottom:4px}
.st-step.done .body > b{color:var(--muted)}
.st-step .body > p{font-size:12.5px;color:var(--muted);line-height:1.55;margin:0}
.st-step code{font-family:var(--mono);font-size:11.5px;background:var(--ink-700);padding:1px 6px;border-radius:5px;color:var(--accent-text);word-break:break-all}
.st-step .act{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.st-step .act .msg{font-size:12px;color:var(--muted);flex:1 1 140px;min-width:0;line-height:1.5;word-break:break-word}
.st-step .act .msg.ok{color:var(--success)}
.st-step .act .msg.bad{color:var(--danger)}
.st-diag{display:flex;flex-direction:column;gap:7px;width:100%;margin-top:4px}
.st-diag .d{display:grid;grid-template-columns:18px minmax(0,1fr);gap:9px;font-size:12.5px;align-items:start}
.st-diag .d s{text-decoration:none;font-family:var(--mono);font-weight:700;line-height:1.5}
.st-diag .d.ok s{color:var(--success)}
.st-diag .d.bad s{color:var(--danger)}
.st-diag .d b{font-weight:600}
.st-diag .d span{display:block;color:var(--muted);font-size:11.5px;line-height:1.5;word-break:break-word;font-family:var(--mono)}
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

const HINTS = {
  storage_not_configured: 'В Vercel не заданы UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN. Добавьте обе переменные в Production и сделайте Redeploy.',
  bad_url: 'REST URL неверный. Нужен адрес вида https://xxxx.upstash.io из блока REST API в консоли Upstash, без кавычек и без слэша на конце.',
  bad_token: 'Токен содержит перевод строки. Скопируйте значение заново одной строкой.',
  upstash_http: 'Upstash отклонил запрос. HTTP 401 — неверный токен; 404 — неверный URL; 403 — база заблокирована. Сверьте пару URL и токен из одной и той же базы.',
  upstash_command: 'Upstash вернул ошибку команды. Обычно это лимит бесплатного тарифа или удалённая база.',
  upstash_json: 'Ответ Upstash не JSON. Проверьте, что скопирован именно REST URL, а не redis:// адрес.',
  upstash_shape: 'Ответ Upstashunexpected. Проверьте URL базы.',
  network: 'Нет сетевого доступа к Upstash. Проверьте адрес и что база активна.',
  timeout: 'Upstash не ответил за 9 секунд. База может быть приостановлена на бесплатном тарифе — откройте консоль Upstash.',
  unauthorized: 'Ключ не совпадает со STATS_KEY в Vercel.',
  key_not_configured: 'В Vercel не задана переменная STATS_KEY.',
}

function explain(code, detail, status) {
  const base = HINTS[code] || 'Не удалось обратиться к хранилищу.'
  const tech = [code, status ? `HTTP ${status}` : null, detail].filter(Boolean).join(' · ')
  return { base, tech }
}

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

function Step({ n, state, title, children, actions }) {
  return (
    <div className={`st-step ${state}`}>
      <span className="st-num">{state === 'done' ? '✓' : n}</span>
      <div className="body">
        <b>{title}</b>
        <p>{children}</p>
        {actions && <div className="act">{actions}</div>}
      </div>
    </div>
  )
}

function DiagList({ diag }) {
  if (!diag?.steps?.length) return null
  return (
    <div className="st-diag">
      {diag.steps.map((s, i) => (
        <div className={`d ${s.ok ? 'ok' : 'bad'}`} key={i}>
          <s>{s.ok ? '✓' : '✕'}</s>
          <div><b>{s.name}</b>{s.detail && <span>{s.detail}</span>}</div>
        </div>
      ))}
    </div>
  )
}

export default function Stats({ albums = [], onBack }) {
  injectCss()
  const [, setTick] = useState(0)
  const [status, setStatus] = useState(() => analytics.status())
  const [source, setSource] = useState('device')
  const [key, setKey] = useState(() => { try { return sessionStorage.getItem('nr.stats.key') || '' } catch { return '' } })
  const [remote, setRemote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [errTech, setErrTech] = useState('')
  const [range, setRange] = useState(30)
  const [metric, setMetric] = useState('play')
  const [undo, setUndo] = useState(null)
  const [probe, setProbe] = useState(null)
  const [probing, setProbing] = useState(false)
  const [sent, setSent] = useState(null)
  const [sending, setSending] = useState(false)
  const [wizard, setWizard] = useState(false)
  const [diag, setDiag] = useState(null)
  const [diagBusy, setDiagBusy] = useState(false)

  const sync = useCallback(() => { setTick((t) => t + 1); setStatus(analytics.status()) }, [])

  useEffect(() => analytics.subscribe(sync), [sync])
  useEffect(() => { analytics.probe().then(sync) }, [sync])

  const local = summaryOf(analytics.getLocal())

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

  const readError = async (r) => {
    let j = null
    try { j = await r.json() } catch {}
    const code = j?.error || `http_${r.status}`
    const { base, tech } = explain(code, j?.detail, j?.status || (r.status >= 400 ? r.status : null))
    return { base, tech }
  }

  const load = useCallback(async (days = range) => {
    if (!key.trim()) { setErr('Введите ключ STATS_KEY из настроек Vercel'); setErrTech(''); return }
    setBusy(true); setErr(''); setErrTech('')
    try {
      const r = await fetch(`/api/summary?days=${days}`, { headers: { 'x-stats-key': key.trim() }, credentials: 'omit', cache: 'no-store' })
      if (!r.ok) {
        const e = await readError(r)
        setErr(e.base); setErrTech(e.tech)
        return
      }
      setRemote(await r.json())
      setWizard(false)
      try { sessionStorage.setItem('nr.stats.key', key.trim()) } catch {}
    } catch (e) {
      setErr('Нет связи с /api/summary. Функция не задеплоена или запрос заблокирован.')
      setErrTech(String(e?.message || e))
    } finally { setBusy(false) }
  }, [key, range])

  const runDiag = useCallback(async () => {
    if (!key.trim()) { setErr('Сначала введите ключ STATS_KEY'); setErrTech(''); return }
    setDiagBusy(true); setDiag(null)
    try {
      const r = await fetch('/api/diag', { headers: { 'x-stats-key': key.trim() }, credentials: 'omit', cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        const { base, tech } = explain(j?.error || `http_${r.status}`, j?.detail, r.status)
        setDiag({ ok: false, steps: [{ name: 'Запрос диагностики', ok: false, detail: `${base} ${tech}` }] })
      } else {
        setDiag(j)
      }
    } catch (e) {
      setDiag({ ok: false, steps: [{ name: 'Запрос диагностики', ok: false, detail: String(e?.message || e) }] })
    } finally { setDiagBusy(false) }
  }, [key])

  const openAudience = useCallback(() => {
    setSource('audience')
    setErr(''); setErrTech('')
    if (!remote && key.trim()) load()
    else if (!remote) setWizard(true)
  }, [remote, key, load])

  const forgetKey = useCallback(() => {
    setRemote(null); setKey(''); setErr(''); setErrTech(''); setDiag(null); setWizard(true)
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
    const r = await analytics.flushNow()
    setSent(r)
    setSending(false)
    sync()
  }, [sync])

  const allowDevice = useCallback(() => {
    analytics.setOverride(!status.override)
    setSent(null)
    sync()
  }, [status.override, sync])

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

  const envDone = status.storage && status.summary
  const collectDone = status.telemetry
  const sendDone = status.transmitting
  const eventsDone = status.pending > 0 || !!sent?.ok
  const pushedDone = !!sent?.ok
  const openedDone = !!remote
  const stepState = (done, prevDone) => (done ? 'done' : prevDone ? 'active' : '')
  const showWizard = source === 'audience' && (!remote || wizard)

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

      {showWizard && (
        <div className="st-wiz">
          <h3>Как открыть сводку по аудитории <em>{[envDone, collectDone, sendDone, eventsDone, pushedDone, openedDone].filter(Boolean).length} из 6</em></h3>
          <p>Шаги отмечаются сами по реальному состоянию сервера и этого устройства. Выполняйте сверху вниз.</p>

          <Step n="1" state={stepState(envDone, true)} title="Переменные в Vercel">
            Project → Settings → Environments → <b>Production</b>. Нужны <code>UPSTASH_REDIS_REST_URL</code>,{' '}
            <code>UPSTASH_REDIS_REST_TOKEN</code>, <code>STATS_KEY</code>. Значения вставляйте одной строкой,
            без кавычек. URL берите из блока <b>REST API</b> в консоли Upstash, не <code>redis://</code>.
            После правки — <b>Redeploy</b>.
          </Step>

          <Step n="2" state={stepState(collectDone, envDone)} title="Включить сбор">
            Переменная <code>TELEMETRY</code> = <code>1</code>, затем Redeploy.
            {collectDone ? <> Сервер подтверждает: сбор включён.</> : <> Пока сервер отвечает, что сбор выключен.</>}
          </Step>

          <Step
            n="3"
            state={stepState(sendDone, collectDone)}
            title="Разрешить отправку с этого устройства"
            actions={status.privacyBlocked ? (
              <button className={status.override ? 'btn btn-ghost' : 'btn btn-primary'} onClick={allowDevice}>
                {status.override ? 'Запретить снова' : 'Разрешить для этого устройства'}
              </button>
            ) : null}
          >
            {status.privacyBlocked
              ? <>Браузер передаёт <b>Do Not Track</b>. Разрешение действует только здесь и только до конца сессии.</>
              : <>Отправка разрешена, действий не нужно.</>}
          </Step>

          <Step
            n="4"
            state={stepState(eventsDone, sendDone)}
            title="Накопить события"
            actions={<button className="btn btn-ghost" onClick={onBack}>Открыть каталог и послушать</button>}
          >
            Включите любой трек на 10–15 секунд. В очереди неотправленных событий: <b>{status.pending}</b>.
          </Step>

          <Step
            n="5"
            state={stepState(pushedDone, eventsDone)}
            title="Отправить события в хранилище"
            actions={
              <>
                <button className="btn btn-primary" onClick={sendNow} disabled={sending || !sendDone}>
                  {sending ? 'Отправляем…' : 'Отправить сейчас'}
                </button>
                {sent && <span className={`msg ${sent.ok ? 'ok' : 'bad'}`}>{sent.message}</span>}
              </>
            }
          >
            Обычно события уходят раз в минуту и при закрытии вкладки. Кнопка отправляет немедленно.
          </Step>

          <Step
            n="6"
            state={stepState(openedDone, pushedDone)}
            title="Открыть сводку"
            actions={
              <>
                <div className="st-key" style={{ width: '100%' }}>
                  <input
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="Значение STATS_KEY из Vercel"
                    aria-label="Ключ доступа к сводке"
                    onKeyDown={(e) => { if (e.key === 'Enter') load() }}
                  />
                  <select className="select" value={range} onChange={(e) => setRange(Number(e.target.value))} aria-label="Период">
                    <option value={7}>7 дней</option>
                    <option value={30}>30 дней</option>
                    <option value={90}>90 дней</option>
                  </select>
                  <button className="btn btn-primary" onClick={() => load()} disabled={busy}>{busy ? 'Загрузка…' : 'Открыть'}</button>
                  <button className="btn btn-ghost" onClick={runDiag} disabled={diagBusy}>{diagBusy ? 'Проверяем…' : 'Диагностика хранилища'}</button>
                </div>
                {err && <span className="msg bad">{err}{errTech ? <><br /><code>{errTech}</code></> : null}</span>}
                <DiagList diag={diag} />
              </>
            }
          >
            Введите тот же <code>STATS_KEY</code>, что в Vercel. Если приходит 502 — нажмите
            «Диагностика хранилища»: она покажет, что именно отвечает Upstash.
          </Step>
        </div>
      )}

      {source === 'device' && status.privacyBlocked && !status.override && (
        <div className="st-note warn">
          <b>Do Not Track включён.</b> Локальные счётчики ниже работают, но на сервер ничего не уходит.
          Разрешить отправку можно на вкладке «Аудитория», шаг 3.
        </div>
      )}

      {source === 'device' && (
        <div className="st-probe">
          <button className="btn btn-ghost" onClick={runProbe} disabled={probing}>{probing ? 'Проверяем…' : 'Проверить приёмник'}</button>
          <button className="btn btn-ghost" onClick={openAudience}>Настроить сводку по аудитории</button>
          <span className={`res ${probe ? (probe.ok ? 'ok' : 'bad') : ''}`}>
            {probe ? probe.message : 'Проверка отправляет пустой пакет и не записывает данных.'}
          </span>
        </div>
      )}

      <div className="st-note">
        {source === 'device' ? (
          <>
            <b>Локальные данные.</b> Счётчики хранятся только в этом браузере. Идентификаторы пользователей,
            IP, cookies и текст поисковых запросов не собираются.
          </>
        ) : (
          <>
            <b>Аудитория.</b> Обезличенные суммы по дням: события, релизы, треки, класс платформы, тема,
            формат, секунды прослушивания. Без идентификаторов людей, без IP и без cookies.
          </>
        )}
      </div>

      {audienceEmpty && (
        <div className="st-note warn">
          <b>В хранилище пока пусто.</b> Послушайте трек, затем «Отправить сейчас» и «Обновить».
          Если у слушателей включён Do Not Track, их события не отправляются — это ожидаемо.
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
              {source === 'audience' && remote && <button className="btn btn-ghost" onClick={sendNow} disabled={sending}>Отправить сейчас</button>}
              {source === 'audience' && remote && <button className="btn btn-ghost" onClick={runDiag} disabled={diagBusy}>Диагностика хранилища</button>}
              {source === 'audience' && remote && <button className="btn btn-quiet" onClick={() => setWizard((v) => !v)}>{wizard ? 'Скрыть настройку' : 'Показать настройку'}</button>}
              {source === 'audience' && remote && <button className="btn btn-quiet" onClick={forgetKey}>Сменить ключ</button>}
              {source === 'device' && <button className="btn btn-ghost" onClick={resetLocal}>Сбросить локальные данные</button>}
              {undo && <button className="btn btn-primary" onClick={() => { analytics.restore(undo); setUndo(null) }}>Отменить сброс</button>}
            </div>
            {sent && source === 'audience' && (
              <div className="st-err" style={sent.ok ? { color: 'var(--success)' } : undefined}>{sent.message}</div>
            )}
            {err && source === 'audience' && <div className="st-err">{err}{errTech ? <> · {errTech}</> : null}</div>}
            {source === 'audience' && <DiagList diag={diag} />}
          </div>
        </>
      )}
    </div>
  )
}