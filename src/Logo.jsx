import { useState } from 'react'

export const LOGO_SRC = '/logo.svg'

export default function Logo({ h = 44, playing = false, className = '' }) {
  const [imgFailed, setImgFailed] = useState(false)

  // Only render the logo when it's large enough to stay readable.
  // Below 32px the details become too small to be useful.
  const readable = h >= 32
  if (!readable || imgFailed) return null

  const cls = ['logo', playing ? 'is-playing' : '', className].filter(Boolean).join(' ')
  const style = { '--logo-h': `${h}px` }

  return (
    <span className={cls} style={style} role="img" aria-label="Nenormalizm Recs">
      <span className="logo-mark">
        <img
          src={LOGO_SRC}
          alt=""
          loading="eager"
          decoding="async"
          draggable="false"
          onError={() => setImgFailed(true)}
        />
      </span>
      <span className="logo-dot" aria-hidden="true" />
    </span>
  )
}