import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Progress } from '@/types'
import { supabase } from '@/lib/supabase'

/** How often to push position while playing. */
const SAVE_INTERVAL_MS = 5_000

/**
 * The largest jump between two ticks that still counts as listening. Ticks
 * arrive about four times a second, so even at 3x a real advance is well under
 * this; anything larger is a seek or a chapter jump and must NOT be counted, or
 * scrubbing through a book would log hours you never heard.
 */
const MAX_REAL_ADVANCE_SEC = 5

/** Local calendar day as YYYY-MM-DD. en-CA is ISO-shaped and stays local. */
function localDay(): string {
  return new Date().toLocaleDateString('en-CA')
}

export interface ProgressState {
  /** Saved position at load time — feed this into usePlayer as the resume point. */
  initial: Progress | null
  /** False until the initial fetch settles; the player waits for this. */
  loaded: boolean
  /** Record the latest position. Cheap: buffers in a ref, flushed on a timer. */
  report: (chapterIdx: number, positionSec: number, bookPositionSec: number) => void
  /** Force an immediate write (on pause, on leaving the book). */
  flush: () => Promise<void>
}

export function useProgress(user: User | null, bookId: string | null): ProgressState {
  const [initial, setInitial] = useState<Progress | null>(null)
  const [loaded, setLoaded] = useState(false)

  const pending = useRef<{ chapterIdx: number; positionSec: number; bookPositionSec: number } | null>(null)
  const lastSaved = useRef<string>('')
  /** Previous absolute position, used to derive how much was actually played. */
  const lastBookPos = useRef<number | null>(null)
  /** Seconds heard since the last flush, keyed by local day. */
  const heard = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    let active = true
    setLoaded(false)
    setInitial(null)
    pending.current = null
    lastSaved.current = ''
    lastBookPos.current = null
    heard.current = new Map()

    if (!user || !bookId) {
      setLoaded(true)
      return
    }

    void (async () => {
      const { data } = await supabase
        .from('progress')
        .select('*')
        .eq('book_id', bookId)
        .maybeSingle()
      if (!active) return
      setInitial((data as Progress | null) ?? null)
      setLoaded(true)
    })()

    return () => {
      active = false
    }
  }, [user, bookId])

  const report = useCallback(
    (chapterIdx: number, positionSec: number, bookPositionSec: number) => {
      pending.current = { chapterIdx, positionSec, bookPositionSec }

      // Derive listening from forward movement only. A seek, a chapter jump or
      // a rewind produces a delta outside the window and is ignored.
      const prev = lastBookPos.current
      if (prev !== null) {
        const delta = bookPositionSec - prev
        if (delta > 0 && delta < MAX_REAL_ADVANCE_SEC) {
          const day = localDay()
          heard.current.set(day, (heard.current.get(day) ?? 0) + delta)
        }
      }
      lastBookPos.current = bookPositionSec
    },
    [],
  )

  const flush = useCallback(async () => {
    const next = pending.current
    if (!next || !user || !bookId) return

    // Skip no-op writes (paused player, repeated flushes).
    const signature = `${next.chapterIdx}:${Math.round(next.positionSec)}`
    const owes = [...heard.current.values()].some((s) => s >= 1)
    if (signature === lastSaved.current && !owes) return
    lastSaved.current = signature

    // Fold the accrued listening into the history. Adds rather than overwrites,
    // so a second device listening the same day sums instead of clobbering.
    for (const [day, seconds] of heard.current) {
      const whole = Math.floor(seconds)
      if (whole < 1) continue
      const { error } = await supabase.rpc('add_listening', {
        p_book_id: bookId, p_day: day, p_seconds: whole,
      })
      if (error) break            // keep the tally; try again next flush
      const rest = seconds - whole
      if (rest > 0) heard.current.set(day, rest)
      else heard.current.delete(day)
    }

    await supabase.from('progress').upsert(
      {
        book_id: bookId,
        user_id: user.id,
        chapter_idx: next.chapterIdx,
        position_sec: next.positionSec,
        book_position_sec: next.bookPositionSec,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'book_id' },
    )
  }, [user, bookId])

  // Periodic flush, plus a flush when the tab is hidden or closed. Losing at
  // most one interval of position is an acceptable trade for not writing on
  // every timeupdate.
  useEffect(() => {
    if (!user || !bookId) return

    const timer = window.setInterval(() => void flush(), SAVE_INTERVAL_MS)
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      void flush()
    }
  }, [user, bookId, flush])

  return { initial, loaded, report, flush }
}
