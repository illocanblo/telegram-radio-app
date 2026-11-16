import { useState } from 'react'

/**
 * Логотип приложения берётся из вашего файла: public/logo.svg
 * Положите свой SVG по этому пути (или измените LOGO_SRC на его имя) —
 * он появится на главной странице, в шапке релиза, на загрузке и в иконке вкладки.
 * Пока файла нет, вместо него показывается текстовый знак — без ошибок и пустых мест.
 */
export const LOGO_SRC = '/logo.svg'

export default function Logo({ h = 44, playing = false, plate = 'none', className = '' }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span className={['logo-word', className].filter(Boolean).join(' ')} style={{ '--logo-h': `${h}px` }}>
        <b>NENORMALIZM</b>
        <i>RECS</i>
      </span>
    )
  }

  return (
    <span
      className={['logo', playing ? 'is-playing' : '', className].filter(Boolean).join(' ')}
      data-plate={plate}
      style={{ '--logo-h': `${h}px` }}
    >
      <img
        src={LOGO_SRC}
        alt="Nenormalizm Recs"
        loading="eager"
        decoding="async"
        draggable="false"
        onError={() => setFailed(true)}
      />
      <span className="logo-dot" aria-hidden="true" />
    </span>
  )
}