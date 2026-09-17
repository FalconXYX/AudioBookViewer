import { useState } from 'react'
import type { PlayerState } from '@/hooks/usePlayer'
import { formatTime, formatTimeLeftAtSpeed } from '@/lib/format'

interface Props {
  player: PlayerState
  disabled: boolean
  /** Whether this chapter already has a ribbon in it. */
  marked: boolean
  onRibbon: () => void
}

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]

/**
 * Material Symbols `replay_10` and `forward_10`, used as drawn. The previous
 * icon was a hand-built arc with a <text> "10" laid over it, and the arc ran
 * straight through the digits at every size. Here the numerals are part of the
 * path and sit in the gap the arc leaves for them. Forward is its own drawing
 * rather than a mirror of back, because mirroring reverses the digits too.
 */
const REPLAY_10 =
  'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z'
  + 'm-1.1 11H10v-3.3L9 13v-.7l1.8-.6h.1V16z'
  + 'm4.3-1.8c0 .3 0 .6-.1.8l-.3.6-.5.3-.6.1-.6-.1-.5-.3-.3-.6-.1-.8v-.7c0-.3 0-.6.1-.8l.3-.6.5-.3.6-.1.6.1.5.3.3.6.1.8v.7z'
  + 'm-.9-.8v-.5l-.1-.4-.2-.2-.2-.1-.2.1-.2.2-.1.4v1.7l.1.4.2.2.2.1.2-.1.2-.2.1-.4v-1.2z'

const FORWARD_10 =
  'M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z'
  + 'm-7.46 3H9.7v-3.3l-1.02.32v-.64l1.77-.63h.09V16z'
  + 'm4.05-1.75c0 .32-.03.6-.1.82s-.17.42-.29.57-.28.26-.45.33-.37.1-.59.1-.41-.03-.59-.1-.33-.18-.46-.33-.23-.34-.3-.57-.11-.5-.11-.82v-.74c0-.32.03-.6.1-.82s.17-.42.29-.57.28-.26.45-.33.37-.1.59-.1.41.03.59.1.33.18.46.33.23.34.3.57.11.5.11.82v.74z'
  + 'm-.85-.86c0-.19-.01-.35-.04-.48s-.06-.24-.11-.32-.11-.14-.19-.17-.16-.05-.25-.05-.18.02-.25.05-.14.09-.19.17-.09.19-.12.32-.04.29-.04.48v.97c0 .19.01.35.04.48s.06.24.12.33.11.14.19.17.16.05.25.05.18-.02.25-.05.14-.09.19-.17.09-.2.11-.33.04-.29.04-.48v-.97z'

function SkipIcon({ dir }: { dir: 'back' | 'forward' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={dir === 'back' ? REPLAY_10 : FORWARD_10} />
    </svg>
  )
}

export function Transport({ player, disabled, marked, onRibbon }: Props) {
  // While dragging, follow the pointer rather than the timeupdate stream,
  // which fires four times a second and would fight the user.
  const [scrub, setScrub] = useState<number | null>(null)
  const shown = scrub ?? player.positionInChapter
  const max = Math.max(1, player.chapterDuration)

  const commit = () => {
    if (scrub !== null) void player.seekInChapter(scrub)
    setScrub(null)
  }

  return (
    <div className="transport">
      <div className="transport__bar">
        <span className="transport__time">{formatTime(shown)}</span>
        <input
          type="range"
          className="scrub"
          min={0}
          max={max}
          step={1}
          value={Math.min(shown, max)}
          disabled={disabled}
          aria-label="Position in chapter"
          onChange={(e) => setScrub(Number(e.target.value))}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
        />
        <span className="transport__time">−{formatTime(player.chapterRemaining)}</span>
      </div>

      <div className="transport__row">
        <button
          type="button"
          className="tbtn tbtn--ribbon"
          aria-pressed={marked}
          aria-label={marked ? 'Take the ribbon out of this chapter' : 'Slip a ribbon in here'}
          title={marked
            ? 'Ribboned. It shows in Contents; press again to take it out.'
            : 'Mark this spot. It shows as a ribbon in Contents.'}
          disabled={disabled}
          onClick={onRibbon}
        >
          <svg viewBox="0 0 12 20" aria-hidden="true"><path d="M0 0h12v20l-6-5-6 5z" /></svg>
        </button>

        <button
          type="button"
          className="tbtn"
          aria-label="Previous chapter"
          disabled={disabled || player.chapterIdx === 0}
          onClick={() => void player.prevChapter()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h2v12H7zm10 0v12l-8-6z" /></svg>
        </button>

        <button
          type="button"
          className="tbtn"
          aria-label="Back 10 seconds"
          disabled={disabled}
          onClick={() => void player.skipBack()}
        >
          <SkipIcon dir="back" />
        </button>

        <button
          type="button"
          className="tbtn tbtn--play"
          aria-label={player.isPlaying ? 'Pause' : 'Play'}
          disabled={disabled}
          onClick={() => void player.togglePlay()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {player.isPlaying
              ? <path d="M6 5h3.5v14H6zm8.5 0H18v14h-3.5z" />
              : <path d="M8 5v14l11-7z" />}
          </svg>
        </button>

        <button
          type="button"
          className="tbtn"
          aria-label="Forward 10 seconds"
          disabled={disabled}
          onClick={() => void player.skipForward()}
        >
          <SkipIcon dir="forward" />
        </button>

        <button
          type="button"
          className="tbtn"
          aria-label="Next chapter"
          disabled={disabled}
          onClick={() => void player.nextChapter()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6h2v12h-2zM7 6l8 6-8 6z" /></svg>
        </button>
      </div>

      <div className="rate">
        <label>
          <span className="faint">Speed </span>
          <select
            value={player.playbackRate}
            disabled={disabled}
            onChange={(e) => player.setPlaybackRate(Number(e.target.value))}
          >
            {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </label>
        <span className="num" aria-live="polite">
          {formatTimeLeftAtSpeed(player.bookRemaining, player.playbackRate)} left
        </span>
      </div>

      {player.error && <p className="alert" role="alert" style={{ margin: 0 }}>{player.error}</p>}
    </div>
  )
}
