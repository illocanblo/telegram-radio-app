import { useMemo, useState, useCallback } from 'react'
import {
  getLinkConfig, setLinkConfig, directLink, webLink, copyText, shareToTelegram,
  paramForAlbum, paramForQuery, PARAM_RADIO, PARAM_FAV, PARAM_STATS, PARAM_LINKS,
  paramForDecade, PARAM_MAX,
} from './deeplink.js'

const CSS = `
.dl{padding-top:18px;padding-bottom:8px;animation:dlIn .4s var(--ease) both}
@keyframes dlIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.dl-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.dl-head h1{font-size:22px;font-weight:800;letter-spacing:-.02em;flex:1;min-width:180px}
.dl-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-l);padding:16px;margin-bottom:14px}
.dl-card h3{font-size:12px;font-family:var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.dl-card h3 em{font-style:normal;margin-left:auto;font-family:var(--font);letter-spacing:0;text-transform:none;color:var(--muted);font-size:12px}
.dl-card p{font-size:12.5px;color:var(--muted);line-height:1.6;margin-bottom:12px}
.dl-card p b{color:var(--text)}
.dl-card code{font-family:var(--mono);font-size:11.5px;background:var(--ink-700);padding:1px 6px;border-radius:5px;color:var(--accent-text);word-break:break-all}
.dl-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;align-items:end}
.dl-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.dl-field span{font-size:11px;font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
.dl-field input,.dl-field select{height:40px;padding:0 14px;border-radius:99px;border:1px solid var(--border-strong);background:var(--surface-2);color:var(--text);font:inherit;font-size:13px;outline:none;min-width:0}
.dl-field input:focus,.dl-field select:focus{border-color:var(--acid);box-shadow:0 0 0 3px rgba(198,255,61,.16)}
.dl-steps{display:flex;flex-direction:column}
.dl-step{display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px;padding:13px 0;border-bottom:1px solid var(--border)}
.dl-step:last-child{border-bottom:0;padding-bottom:2px}
.dl-step .n{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-family:var(--mono);font-size:12px;font-weight:700;border:1px solid var(--border-strong);color:var(--dim);background:var(--surface-2)}
.dl-step.done .n{background:var(--success);border-color:var(--success);color:#04140d}
.dl-step.active .n{background:var(--acid);border-color:var(--acid);color:var(--acid-ink);box-shadow:0 0 14px rgba(198,255,61,.4)}
.dl-step b{display:block;font-size:13.5px;font-weight:650;margin-bottom:4px}
.dl-step p{margin:0;font-size:12.5px;color:var(--muted);line-height:1.55}
.dl-rows{display:flex;flex-direction:column;gap:10px}
.dl-row{border:1px solid var(--border);border-radius:var(--radius-m);padding:11px 12px;background:var(--surface-2)}
.dl-row .t{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.dl-row .t b{font-size:13px;font-weight:650;flex:1;min-width:0}
.dl-row .t s{text-decoration:none;font-family:var(--mono);font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em}
.dl-row .u{font-family:var(--mono);font-size:11.5px;color:var(--muted);word-break:break-all;line-height:1.5;margin-bottom:9px}
.dl-row .a{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.dl-row .a .msg{font-size:11.5px;color:var(--success)}
.dl-row .a .msg.bad{color:var(--danger)}
.dl-note{font-size:12.5px;color:var(--muted);line-height:1.6;border:1px solid var(--border);border-radius:var(--radius-m);padding:12px 14px;margin-bottom:14px;background:var(--surface)}
.dl-note.warn{border-color:rgba(255,180,61,.35);background:rgba(255,180,61,.08)}
.dl-note b{color:var(--text)}
.dl-note.warn b{color:var(--warning)}
.dl-empty{padding:22px 8px;text-align:center;color:var(--dim);font-size:13px}
@media (max-width:640px){.dl-head h1{font-size:19px}}
`

let styled = false
function injectCss() {
  if (styled || typeof document === 'undefined') return
  const el = document.createElement('style')
  el.setAttribute('data-nr-links', '')
  el.textContent = CSS
  document.head.appendChild(el)
  styled = true
}

function Row({ title, tag, url, param, onShare }) {
  const [msg, setMsg] = useState('')
  const tooLong = param && param.length > PARAM_MAX
  const doCopy = async () => {
    if (!url) { setMsg('bad:Заполните username бота'); return }
    const ok = await copyText(url)
    setMsg(ok ? 'Скопировано' : 'bad:Не удалось скопировать')
    setTimeout(() => setMsg(''), 2600)
  }
  const bad = msg.startsWith('bad:')
  return (
    <div className="dl-row">
      <div className="t"><b>{title}</b>{tag && <s>{tag}</s>}</div>
      <div className="u">{url || 'ссылка появится после ввода username бота'}</div>
      <div className="a">
        <button className="btn btn-ghost" style={{ height: 34, fontSize: 12.5 }} onClick={doCopy} disabled={!url}>Копировать</button>
        {onShare && <button className="btn btn-quiet" style={{ height: 34, fontSize: 12.5 }} onClick={() => onShare(url, title)} disabled={!url}>Отправить в чат</button>}
        {param && <s style={{ textDecoration: 'none', fontFamily: 'var(--mono)', fontSize: 10.5, color: tooLong ? 'var(--danger)' : 'var(--dim)' }}>startapp={param} · {param.length}/{PARAM_MAX}</s>}
        {msg && <span className={`msg ${bad ? 'bad' : ''}`}>{bad ? msg.slice(4) : msg}</span>}
      </div>
    </div>
  )
}

export default function Links({ albums = [], onBack, currentAlbumId = null }) {
  injectCss()
  const [cfg, setCfg] = useState(() => getLinkConfig())
  const [pick, setPick] = useState(currentAlbumId || '')
  const [q, setQ] = useState('')

  const save = useCallback((patch) => setCfg(setLinkConfig({ ...cfg, ...patch })), [cfg])

  const link = useCallback((param) => directLink({ bot: cfg.bot, app: cfg.app, param, compact: cfg.compact }), [cfg])

  const decades = useMemo(() => {
    const set = new Set()
    albums.forEach((a) => {
      const m = String(a.date || a.publicdate || '').match(/(\d{4})/)
      if (m) set.add(Math.floor(Number(m[1]) / 10) * 10)
    })
    return [...set].sort((a, b) => b - a)
  }, [albums])

  const albumParam = pick ? paramForAlbum(pick) : null
  const queryParam = q.trim() ? paramForQuery(q.trim()) : null
  const configured = !!cfg.bot
  const namedApp = !!cfg.app

  const steps = [
    {
      title: 'Создать Mini App в BotFather',
      done: namedApp,
      body: <>@BotFather → <code>/newapp</code> → выбрать бота → название, описание, картинка 640×360 → URL приложения → короткое имя. Короткое имя становится частью ссылки <code>t.me/бот/имя</code>.</>,
    },
    {
      title: 'Назначить основным приложением',
      done: namedApp,
      body: <>@BotFather → <code>/mybots</code> → ваш бот → <b>Bot Settings</b> → <b>Main Mini App</b> → указать тот же URL. После этого ссылка <code>t.me/бот</code> открывает плеер сразу, без чата.</>,
    },
    {
      title: 'Вписать username бота и короткое имя',
      done: configured,
      body: <>Поля ниже. Username — без <code>@</code>, как в <code>t.me/username</code>. Короткое имя — то, что задано в <code>/newapp</code>. Значения хранятся только в этом браузере.</>,
    },
    {
      title: 'Проверить ссылку',
      done: false,
      body: <>Скопируйте «Каталог» и откройте в Telegram. Приложение должно открыться на весь экран. Ссылка «Релиз» должна сразу открыть выбранный альбом.</>,
    },
    {
      title: 'Разместить ссылку',
      done: false,
      body: <>В описание бота, в закреплённое сообщение, на сайт лейбла и в соцсети. Прямая ссылка работает в любом чате и не требует кнопки «Запустить».</>,
    },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const firstPending = steps.findIndex((s) => !s.done)

  return (
    <div className="wrap dl">
      <div className="dl-head">
        <button className="back-btn" onClick={onBack}>← Назад к каталогу</button>
        <h1>Прямые ссылки</h1>
      </div>

      <div className="dl-card">
        <h3>Настройка <em>{doneCount} из {steps.length}</em></h3>
        <div className="dl-steps">
          {steps.map((s, i) => (
            <div className={`dl-step ${s.done ? 'done' : i === firstPending ? 'active' : ''}`} key={i}>
              <span className="n">{s.done ? '✓' : i + 1}</span>
              <div><b>{s.title}</b><p>{s.body}</p></div>
            </div>
          ))}
        </div>
      </div>

      <div className="dl-card">
        <h3>Адрес приложения</h3>
        <div className="dl-form">
          <label className="dl-field">
            <span>Username бота</span>
            <input value={cfg.bot} onChange={(e) => save({ bot: e.target.value })} placeholder="например nenormalizm_bot" aria-label="Username бота" />
          </label>
          <label className="dl-field">
            <span>Короткое имя Mini App</span>
            <input value={cfg.app} onChange={(e) => save({ app: e.target.value })} placeholder="например radio" aria-label="Короткое имя Mini App" />
          </label>
          <label className="dl-field">
            <span>Режим окна</span>
            <select value={cfg.compact ? 'compact' : 'full'} onChange={(e) => save({ compact: e.target.value === 'compact' })} aria-label="Режим окна">
              <option value="full">На весь экран</option>
              <option value="compact">Компактный (mode=compact)</option>
            </select>
          </label>
        </div>
        <p style={{ marginTop: 12, marginBottom: 0 }}>
          Пустое короткое имя даёт ссылку на <b>основное</b> приложение: <code>t.me/бот</code>.
          Заполненное — на именованное: <code>t.me/бот/имя</code>.
        </p>
      </div>

      {!configured && (
        <div className="dl-note warn">
          <b>Ссылки появятся после ввода username бота.</b> Пока можно пользоваться запасными веб-ссылками ниже —
          они открывают тот же экран прямо в браузере.
        </div>
      )}

      <div className="dl-card">
        <h3>Готовые ссылки</h3>
        <div className="dl-rows">
          <Row title="Каталог" tag="без параметра" url={link('')} onShare={shareToTelegram} />
          <Row title="Радио — случайный релиз" tag="startapp" url={link(PARAM_RADIO)} param={PARAM_RADIO} onShare={shareToTelegram} />
          <Row title="Избранное" tag="startapp" url={link(PARAM_FAV)} param={PARAM_FAV} onShare={shareToTelegram} />
          <Row title="Статистика" tag="для владельца" url={link(PARAM_STATS)} param={PARAM_STATS} />
          <Row title="Этот экран ссылок" tag="для владельца" url={link(PARAM_LINKS)} param={PARAM_LINKS} />
          {decades.map((d) => {
            const p = paramForDecade(d)
            return <Row key={d} title={`Релизы ${d}-х`} tag="startapp" url={link(p)} param={p} onShare={shareToTelegram} />
          })}
        </div>
      </div>

      <div className="dl-card">
        <h3>Ссылка на конкретный релиз <em>{albums.length} в каталоге</em></h3>
        <div className="dl-form" style={{ marginBottom: 12 }}>
          <label className="dl-field">
            <span>Релиз</span>
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Релиз">
              <option value="">— выберите релиз —</option>
              {albums.map((a) => (
                <option key={a.identifier} value={a.identifier}>
                  {String(a.title || a.identifier).replace(/^\s*\[[^\]]*\]\s*/, '')}
                </option>
              ))}
            </select>
          </label>
        </div>
        {pick ? (
          albumParam ? (
            <div className="dl-rows">
              <Row title="Открыть релиз в Telegram" tag="startapp" url={link(albumParam)} param={albumParam} onShare={shareToTelegram} />
              <Row title="Запасная веб-ссылка" tag="браузер" url={webLink(albumParam)} />
            </div>
          ) : (
            <div className="dl-note warn" style={{ marginBottom: 0 }}>
              <b>Идентификатор слишком длинный.</b> В параметр {PARAM_MAX} символов он не помещается —
              используйте веб-ссылку: <code>{webLink('a_' + btoa(pick).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))}</code>
            </div>
          )
        ) : <div className="dl-empty">Выберите релиз, чтобы получить ссылку на него.</div>}
      </div>

      <div className="dl-card">
        <h3>Ссылка на поисковый запрос</h3>
        <div className="dl-form" style={{ marginBottom: 12 }}>
          <label className="dl-field">
            <span>Запрос</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="например glitch" aria-label="Поисковый запрос" />
          </label>
        </div>
        {q.trim() ? (
          queryParam ? (
            <div className="dl-rows">
              <Row title={`Поиск: ${q.trim()}`} tag="startapp" url={link(queryParam)} param={queryParam} onShare={shareToTelegram} />
              <Row title="Запасная веб-ссылка" tag="браузер" url={webLink(queryParam)} />
            </div>
          ) : <div className="dl-note warn" style={{ marginBottom: 0 }}><b>Слишком длинный запрос.</b> Используйте веб-ссылку.</div>
        ) : <div className="dl-empty">Введите запрос, чтобы получить ссылку.</div>}
      </div>

      <div className="dl-note">
        <b>Как это работает.</b> Значение <code>startapp</code> приходит в приложение как{' '}
        <code>initDataUnsafe.start_param</code> и сразу открывает нужный экран. Идентификаторы релизов
        кодируются в base64url, чтобы уложиться в разрешённый набор символов и лимит {PARAM_MAX} знаков.
        Во внешнем браузере параметр может не прийти — для таких случаев есть веб-ссылки с <code>?nr=</code>.
      </div>
    </div>
  )
}