import { useCallback, useEffect, useState } from 'react'

const KEY = 'abv:simple'

/** Read once, synchronously, so the first paint is already correct. */
function initial(): boolean {
  try { return localStorage.getItem(KEY) === 'on' } catch { return false }
}

/**
 * Simple mode.
 *
 * It began as a brightness variant, but it is really the plain-dealing version
 * of the app: flatter surfaces, stronger contrast, fewer ornaments, and —
 * the part that matters most for anyone driving this with a keyboard or a
 * screen reader — no decorative delay between pressing a control and the
 * thing happening. The book buttons hold an action for 1.12s while the cover
 * opens and shuts; in Simple mode they fire at once.
 *
 * One attribute on <html> drives all of it, so there is no second stylesheet
 * and no component that can drift out of step.
 */
export function useSimpleMode(): [boolean, () => void] {
  const [on, setOn] = useState(initial)

  useEffect(() => {
    document.documentElement.dataset.simple = on ? 'on' : 'off'
    try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* private mode */ }
  }, [on])

  const toggle = useCallback(() => setOn((v) => !v), [])

  // A keyboard shortcut as well, so switching does not require hunting for the
  // control. Skipped while typing, and while any modifier is held so it cannot
  // shadow a browser or screen-reader command.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (e.key.toLowerCase() === 'l') toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  return [on, toggle]
}

/**
 * Whether Simple mode is on, read straight from the DOM.
 *
 * Used by BookButton, which needs the answer inside an event handler rather
 * than as a prop — threading it through every call site would mean touching
 * every button in the app to fix a behaviour that belongs to the mode.
 */
export function simpleModeActive(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.simple === 'on'
}
