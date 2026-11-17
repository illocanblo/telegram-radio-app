import { useEffect, useState } from 'react'

export default function useMedia(query) {
  const [match, setMatch] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false
  )

  useEffect(() => {
    if (!window.matchMedia) return
    const mediaQuery = window.matchMedia(query)
    const update = () => setMatch(mediaQuery.matches)
    update()
    if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', update)
    else mediaQuery.addListener(update)
    return () => {
      if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', update)
      else mediaQuery.removeListener(update)
    }
  }, [query])

  return match
}
