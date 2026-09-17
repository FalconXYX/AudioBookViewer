import type { Chapter } from '@/types'
import { formatTime } from '@/lib/format'

interface Props {
  chapters: Chapter[]
  currentIdx: number
  bookTitle: string
  fraction: number
  markedIdx: Set<number>
  onSelect: (idx: number) => void
  onToggleMark: (idx: number) => void
  disabled: boolean
}

export function ChapterList({
  chapters, currentIdx, bookTitle, fraction, markedIdx, onSelect, onToggleMark, disabled,
}: Props) {
  if (chapters.length === 0) return null
  return (
    <div className="spread__page">
      {/* a ribbon lies deeper the further you have read */}
      <span className="ribbon" aria-hidden="true"
            style={{ height: `${56 + Math.round(Math.min(1, fraction) * 120)}px` }} />
      <div className="leaf">
        <div className="leaf__runhead"><b>Contents</b><span>{bookTitle}</span></div>
        <ol className="toc">
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
        <div className="leaf__folio">{chapters.length} chapters</div>
      </div>
    </div>
  )
}

