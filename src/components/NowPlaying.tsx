import type { Book } from '@/types'
import type { PlayerState } from '@/hooks/usePlayer'
import { BookButton } from './BookButton'
import { Transport } from './Transport'

interface Props {
  book: Book
  player: PlayerState
  chapterCount: number
  marked: boolean
  onExit: () => void
  onRibbon: () => void
}

/**
 * Listening view. Everything except the cover and the controls is removed —
 * the point is to be in the book, not in an interface.
 */
export function NowPlaying({ book, player, chapterCount, marked, onExit, onRibbon }: Props) {
  return (
    <div className="folio-view">
      {/* The shelf stays visible to the left, so the way back belongs on the
          right — the opposite side from the navigation you already have. */}
      <div className="folio-view__top">
        <span className="folio">{player.chapterIdx + 1} / {chapterCount}</span>
        <BookButton variant="pamphlet" size="sm" openLabel="Closing…" onClick={onExit}>Back to the book</BookButton>
      </div>

      <div className="folio-view__stage">
        <span className="board-cover">
          {book.cover_url
            ? <img src={book.cover_url} alt="" />
            : <span className="cover--empty" aria-hidden="true" />}
        </span>
        <div className="folio-view__titles">
          <div className="sc sc--wide">Chapter</div>
          <div className="folio-view__chapter">{player.chapter?.title ?? book.title}</div>
          <div className="folio-view__book">{book.title}</div>
        </div>
      </div>

      <Transport player={player} disabled={false} marked={marked} onRibbon={onRibbon} />
    </div>
  )
}
