import type { Book } from '@/types'
import type { PlayerState } from '@/hooks/usePlayer'
import { BookButton } from './BookButton'
import { Transport } from './Transport'

interface Props {
  book: Book
  player: PlayerState
  chapterCount: number
  onExit: () => void
  onRibbon: () => void
}

/**
 * Listening view. Everything except the cover and the controls is removed —
 * the point is to be in the book, not in an interface.
 */
export function NowPlaying({ book, player, chapterCount, onExit, onRibbon }: Props) {
  return (
    <div className="folio-view">
      <div className="folio-view__top">
        <BookButton variant="pamphlet" size="sm" onClick={onExit}>← Back to the book</BookButton>
        <span className="folio">{player.chapterIdx + 1} / {chapterCount}</span>
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

      <Transport player={player} disabled={false} onRibbon={onRibbon} />
    </div>
  )
}
