import { useState } from 'react'
import type { PlayerState } from '@/hooks/usePlayer'
import { formatTime, formatTimeLeftAtSpeed } from '@/lib/format'

interface Props {
  player: PlayerState
  disabled: boolean
  onRibbon: () => void
}

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]

/** Circular arrow with the skip amount inside — the usual audiobook affordance. */
function SkipIcon({ dir }: { dir: 'back' | 'forward' }) {
  const flip = dir === 'forward' ? 'scale(-1,1) translate(-24,0)' : undefined
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g transform={flip}>
        <path d="M12 5V2L7 6l5 4V7a5.5 5.5 0 1 1-5.5 5.5H4.8A7.2 7.2 0 1 0 12 5z" />
      </g>
      <text
        x="12"
        y="17.8"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        10
      </text>
    </svg>
  )
}

export function Transport({ player, disabled, onRibbon }: Props) {
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
          aria-label="Slip a ribbon in here"
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
