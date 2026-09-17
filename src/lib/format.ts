/** 3725 -> "1:02:05". Under an hour -> "2:05". */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const s = Math.floor(totalSeconds % 60)
  const m = Math.floor((totalSeconds / 60) % 60)
  const h = Math.floor(totalSeconds / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** 3725 -> "1h 2m". Used for "time left in book". */
export function formatDurationLong(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0m'
  const m = Math.round(totalSeconds / 60)
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h === 0) return `${rem}m`
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

/**
 * Time left adjusted for playback speed — at 1.5x, 60 minutes of audio is
 * 40 minutes of your life. This is the number you actually want on screen.
 */
export function formatTimeLeftAtSpeed(secondsRemaining: number, rate: number): string {
  return formatDurationLong(secondsRemaining / (rate || 1))
}
