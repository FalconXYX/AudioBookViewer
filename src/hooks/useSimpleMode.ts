import { useCallback, useEffect, useState } from 'react'

const KEY = 'abv:lift'

/** Read once, synchronously, so the first paint is already correct. */
function initial(): boolean {
  try { return localStorage.getItem(KEY) === 'on' } catch { return false }
}

/**
 * The brightness/contrast variant. A comparison toggle, not a setting the app
 * is built around — it flips one attribute on <html> and every surface follows
 * from theme.css, so there is no second stylesheet to keep in step.
 */
export function useLift(): [boolean, () => void] {
  const [on, setOn] = useState(initial)

  useEffect(() => {
    document.documentElement.dataset.lift = on ? 'on' : 'off'
    try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* private mode */ }
  }, [on])

  // A keyboard toggle as well, because comparing two shades means flipping
  // back and forth quickly while looking at the same spot on the screen.
  const toggle = useCallback(() => setOn((v) => !v), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (e.key.toLowerCase() === 'l' && !e.metaKey && !e.ctrlKey && !e.altKey) toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  return [on, toggle]
}
