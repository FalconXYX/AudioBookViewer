import { useEffect, useState } from 'react'

/**
 * The same condition the phone block in app.css opens with. It is written out
 * twice — once here, once there — because CSS cannot tell React what it
 * matched. If you change one, change the other.
 *
 * The height clause catches a phone turned sideways: 844×390 sails past any
 * width test but has no room for a head bar and a keyboard at once. `pointer:
 * coarse` keeps a short desktop window out of it.
 */
export const PHONE_QUERY = '(max-width: 40rem), (max-height: 26rem) and (pointer: coarse)'

/**
 * True when the app is being shown somewhere the shelf cannot go.
 *
 * This exists for one reason beyond styling: the phone stylesheet hides the
 * head, the case and the desk outright, so anything that is not the quotes
 * screen would render as an empty room. Whoever calls this has to force the
 * view, and has to keep doing it — a desktop window dragged narrow crosses the
 * same line, which is why this listens rather than reading once at boot.
 */
export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY)
    const onChange = (e: MediaQueryListEvent) => setPhone(e.matches)
    mq.addEventListener('change', onChange)
    // Between first render and this effect the window may already have moved.
    setPhone(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return phone
}
