import type { Chapter } from '@/types'
import type { BookWithProgress } from '@/hooks/useLibrary'
import { formatDurationLong } from '@/lib/format'
import { stampDate } from '@/lib/paratext'

interface Props {
  book: BookWithProgress
  chapters: Chapter[]
  accession: string | null
  chapterIdx: number
}

export function Apparatus({ book, chapters, accession, chapterIdx }: Props) {
  const added = stampDate(book.created_at)
  const heard = stampDate(book.progress?.updated_at)
  const pct = Math.round(book.fractionComplete * 100)

  // The truth rule: if the datum is missing, omit the row.
  const rows: Array<[string, string]> = []
  if (accession) rows.push(['In your library', accession.replace('No. ', '#')])
  if (added) rows.push(['Added', added])
  if (heard) rows.push(['Last played', heard])
  if (chapters.length) rows.push(['Chapter', `${chapterIdx + 1} of ${chapters.length}`])
  rows.push(['Length', formatDurationLong(book.total_duration_sec)])
  rows.push(['Progress', `${pct}%`])
  if (book.folder_label) rows.push(['Folder', book.folder_label])


  return (
    <aside className="apparatus">
      <div className="sheet">
        <span className="sc sc--ruled">Details</span>
        <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </div>
      {/* the six shortcuts that exist in BookView.tsx today with zero on-screen
          affordance anywhere in the app */}
      <div className="keys">
        <span className="sc">Shortcuts</span>
        <ul>
          <li><kbd>Space</kbd> play or pause</li>
          <li><kbd>←</kbd> back ten seconds</li>
          <li><kbd>→</kbd> forward ten seconds</li>
          <li><kbd>↑</kbd> faster</li>
          <li><kbd>↓</kbd> slower</li>
          <li><kbd>Esc</kbd> leave the listening view</li>
        </ul>
      </div>
    </aside>
  )
}

