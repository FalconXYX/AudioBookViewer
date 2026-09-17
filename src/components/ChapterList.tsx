import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Chapter } from '@/types'
import { formatTime } from '@/lib/format'

interface Props {
  chapters: Chapter[]
  currentIdx: number
  fraction: number
  markedIdx: Set<number>
  onSelect: (idx: number) => void
  onToggleMark: (idx: number) => void
  disabled: boolean
}

/** Past this many the list stops being a page and starts being a scroll. */
const LONG_BOOK = 12

export function ChapterList({
  chapters, currentIdx, fraction, markedIdx, onSelect, onToggleMark, disabled,
}: Props) {
  const [open, setOpen] = useState(true)
  const listRef = useRef<HTMLOListElement>(null)
  const long = chapters.length > LONG_BOOK

  // Open on the chapter you are actually on, not on chapter one. Without this
  // a 50-chapter book always starts the reader at the top of the book.
  useLayoutEffect(() => {
    if (!open || !long) return
    const el = listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')
    if (el) listRef.current!.scrollTop = el.offsetTop - listRef.current!.clientHeight / 2.4
  }, [open, long, currentIdx])

  // A book you have not started collapses; one you are inside stays open.
  useEffect(() => { setOpen(fraction > 0 || chapters.length <= LONG_BOOK) }, [fraction, chapters.length])

  if (chapters.length === 0) return null
  return (
    <div className="spread__page">
      {/* a ribbon lies deeper the further you have read */}
      <span className="ribbon" aria-hidden="true"
            style={{ height: `${56 + Math.round(Math.min(1, fraction) * 120)}px` }} />
      <div className="leaf">
        <button type="button" className="leaf__runhead" aria-expanded={open}
                onClick={() => setOpen((v) => !v)}>
          <b>Contents</b>
          <span className="leaf__count">{chapters.length} chapters</span>
          <span className={`leaf__caret${open ? ' leaf__caret--open' : ''}`} aria-hidden="true" />
        </button>
        {open && (
          <ol className={`toc${long ? ' toc--long' : ''}`} ref={listRef}>
            {chapters.map((c) => (
              <li key={c.id}
                  data-played={c.idx < currentIdx ? 'true' : undefined}
                  aria-current={c.idx === currentIdx ? 'true' : undefined}>
                <button type="button" className="toc__row" disabled={disabled}
                        onClick={() => onSelect(c.idx)}>
                  <span className="toc__n">{c.idx + 1}</span>
                  <span className="toc__t">{c.title}</span>
                  <i className="leader leader--ink" aria-hidden="true" />
                  <span className="toc__d">{formatTime(c.duration_sec)}</span>
                  <span className="toc__cum">{formatTime(c.book_offset_sec)}</span>
                </button>
                <button type="button" className="toc__mark"
                        aria-pressed={markedIdx.has(c.idx)}
                        aria-label={markedIdx.has(c.idx)
                          ? `Remove the ribbon from ${c.title}` : `Slip a ribbon into ${c.title}`}
                        onClick={() => onToggleMark(c.idx)} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
