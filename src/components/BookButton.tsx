import { useCallback, useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'

type Phase = 'riffling' | 'open' | 'closing'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'pamphlet'
  size?: 'sm'
  block?: boolean
  children: ReactNode
  /** Preview harness only: pins the animation at one phase so it can be seen. */
  phaseOverride?: Phase
}

/** Ported from bookbutton.html. The prototype holds the book open for 1400ms;
 *  the action waits for the whole sequence, so that is trimmed to keep the
 *  total comfortably inside Chrome's 5s transient-activation window — the
 *  folder picker and the permission prompt both need the click's gesture to
 *  still be live when they finally run. */
const RIFFLE_MS = 480
const HOLD_MS = 300
const CLOSE_MS = 340
const TOTAL_MS = RIFFLE_MS + HOLD_MS + CLOSE_MS   // 1120ms

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A book. The spine is the left EDGE of the object and the cover is hinged on
 * it, so the two are one coherent thing seen from the front.
 *
 * Hovering cracks the cover; pressing swings it open, riffles the pages past
 * and lets the cover fall shut. The action runs when the book has closed
 * again, so the sequence is never cut off halfway by a view change.
 */
export function BookButton({
  variant, size, block, className = '', children, onClick, phaseOverride, ...rest
}: Props) {
  const [phase, setPhase] = useState<Phase | undefined>()
  const timers = useRef<number[]>([])

  // The button often unmounts mid-animation (it navigates), so the timers
  // have to be cancellable or they set state on a dead component.
  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])
  useEffect(() => clear, [clear])

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // A pamphlet has no animation to wait for, and someone who has asked for
    // reduced motion should not be made to wait either.
    if (variant === 'pamphlet' || reducedMotion()) { onClick?.(e); return }
    if (phase) return // already running; ignore the second press

    // React pools nothing in v17+, but the event is still reused by the time
    // the timer fires, so hand the handler a detached copy.
    const detached = { ...e, preventDefault: () => {}, stopPropagation: () => {} } as typeof e

    clear()
    setPhase('riffling')
    timers.current.push(
      window.setTimeout(() => setPhase('open'), RIFFLE_MS),
      window.setTimeout(() => setPhase('closing'), RIFFLE_MS + HOLD_MS),
      window.setTimeout(() => {
        setPhase(undefined)
        onClick?.(detached)
      }, TOTAL_MS),
    )
  }

  const cls = ['btn', variant && `btn--${variant}`, size && `btn--${size}`,
               block && 'btn--block', className].filter(Boolean).join(' ')

  if (variant === 'pamphlet') {
    return (
      <button type="button" {...rest} className={cls} onClick={handleClick}>
        <span className="btn__flat">{children}</span>
      </button>
    )
  }

  return (
    <button type="button" {...rest} className={cls} data-phase={phaseOverride ?? phase} onClick={handleClick}>
      {/* carries the intrinsic width; the visible label rides on the cover */}
      <span className="btn__sizer" aria-hidden="true">{children}</span>

      <span className="btn__book" aria-hidden="true">
        <span className="btn__spine">
          <i className="btn__rib" /><i className="btn__rib" /><i className="btn__rib" />
        </span>

        <span className="btn__deck" />
        <span className="btn__rim btn__rim--1" />
        <span className="btn__rim btn__rim--2" />

        {/* The leaf carries the button's OWN label, so the open book shows
            something real. The prototype printed "Chapter 1" here; inventing
            content is exactly the costume this design keeps out. */}
        <span className="btn__leaf btn__leaf--final">
          <span className="btn__page-text">{children}</span>
        </span>
        <span className="btn__leaf btn__riffle btn__riffle--5" />
        <span className="btn__leaf btn__riffle btn__riffle--4" />
        <span className="btn__leaf btn__riffle btn__riffle--3" />
        <span className="btn__leaf btn__riffle btn__riffle--2" />
        <span className="btn__leaf btn__riffle btn__riffle--1" />
        <span className="btn__leaf btn__leaf--preview" />

        <span className="btn__leaf btn__cover">
          <span className="btn__tooling">
            <span className="btn__label">{children}</span>
          </span>
        </span>
      </span>
    </button>
  )
}
