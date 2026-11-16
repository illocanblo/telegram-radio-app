import { useEffect, useState } from 'react'

export const LOGO_SRC = '/logo.svg'

let svgPromise = null

function normalizeSvg(text) {
  try {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
    if (doc.querySelector('parsererror')) return null
    const svg = doc.querySelector('svg')
    if (!svg) return null

    svg.querySelectorAll('script, foreignObject').forEach((n) => n.remove())
    svg.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((a) => {
        if (/^on/i.test(a.name)) el.removeAttribute(a.name)
      })
    })

    const w = parseFloat(svg.getAttribute('width') || '')
    const h = parseFloat(svg.getAttribute('height') || '')
    let vb = svg.getAttribute('viewBox')
    if (!vb && w > 0 && h > 0) {
      vb = `0 0 ${w} ${h}`
      svg.setAttribute('viewBox', vb)
    }
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    svg.setAttribute('focusable', 'false')
    svg.setAttribute('aria-hidden', 'true')

    if (vb) {
      const [minX, minY, vw, vh] = vb.split(/[\s,]+/).map(Number)
      if (vw > 0 && vh > 0) {
        const pct = (v) => (typeof v === 'string' && v.trim().endsWith('%') ? parseFloat(v) : null)
        svg.querySelectorAll('rect').forEach((r) => {
          const rx = parseFloat(r.getAttribute('x') || '0') || 0
          const ry = parseFloat(r.getAttribute('y') || '0') || 0
          const rwAttr = r.getAttribute('width') || '0'
          const rhAttr = r.getAttribute('height') || '0'
          const rw = pct(rwAttr) != null ? (pct(rwAttr) / 100) * vw : parseFloat(rwAttr) || 0
          const rh = pct(rhAttr) != null ? (pct(rhAttr) / 100) * vh : parseFloat(rhAttr) || 0
          const covers =
            rw >= vw * 0.97 && rh >= vh * 0.97 &&
            Math.abs(rx - minX) <= vw * 0.03 && Math.abs(ry - minY) <= vh * 0.03
          if (covers) r.remove()
        })
      }
    }

    return new XMLSerializer().serializeToString(svg)
  } catch {
    return null
  }
}

function loadSvg() {
  if (!svgPromise) {
    svgPromise = fetch(LOGO_SRC, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('logo missing'))))
      .then((t) => normalizeSvg(t))
      .catch(() => null)
  }
  return svgPromise
}

export default function Logo({ h = 44, playing = false, className = '' }) {
  const [markup, setMarkup] = useState(undefined)
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    let alive = true
    loadSvg().then((m) => { if (alive) setMarkup(m) })
    return () => { alive = false }
  }, [])

  const cls = ['logo', playing ? 'is-playing' : '', className].filter(Boolean).join(' ')
  const style = { '--logo-h': `${h}px` }

  if (typeof markup === 'string') {
    return (
      <span className={cls} style={style} role="img" aria-label="Nenormalizm Recs">
        <span className="logo-mark" dangerouslySetInnerHTML={{ __html: markup }} />
        <span className="logo-dot" aria-hidden="true" />
      </span>
    )
  }

  if (markup === null && imgFailed) {
    return (
      <span className={['logo-word', className].filter(Boolean).join(' ')} style={style}>
        <b>NENORMALIZM</b>
        <i>RECS</i>
      </span>
    )
  }

  return (
    <span className={cls} style={style} role="img" aria-label="Nenormalizm Recs">
      <span className="logo-mark">
        <img src={LOGO_SRC} alt="" loading="eager" decoding="async" draggable="false" onError={() => setImgFailed(true)} />
      </span>
      <span className="logo-dot" aria-hidden="true" />
    </span>
  )
}