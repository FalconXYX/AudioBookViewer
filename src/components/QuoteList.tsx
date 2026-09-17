import type { Chapter, Quote } from '@/types'
import { formatTime } from '@/lib/format'
import { BookButton } from './BookButton'

interface Props {
  quotes: Quote[]
  /** Only needed to name the chapter a quote came from. */
  chapters?: Chapter[]
  heading?: string
  emptyNote?: string
  /** Where each quote came from, for the all-books view. */
  bookTitleOf?: (bookId: string) => string
  onGoTo?: (q: Quote) => void
  onRemove?: (id: string) => Promise<void> | void
}

/**
 * The quotations themselves, set as quotations: the words first and largest,
 * the attribution under them, and the machinery (chapter, timestamp, controls)
 * last and quietest. A commonplace book is read, not administered.
 */
export function QuoteList({
  quotes, chapters, heading, emptyNote, bookTitleOf, onGoTo, onRemove,
}: Props) {
  return (
    <section className="quotes">
      {heading && <h3 className="sc sc--ruled">{heading}</h3>}
      {quotes.length === 0
        ? emptyNote && <p className="quotes__empty">{emptyNote}</p>
        : (
          <ul className="quotes__list">
            {quotes.map((q) => {
              const chapter = q.chapter_idx !== null ? chapters?.[q.chapter_idx] : undefined
              // Show where the quote STARTS, not where capture was pressed, so
              // the printed time is the one "Play from here" actually goes to.
              const startsAt = q.clip_start_sec ?? q.position_sec
              const placed = q.chapter_idx !== null && startsAt !== null
              return (
                <li key={q.id} className="quote">
                  <blockquote className="quote__text">{q.text}</blockquote>
                  <div className="quote__by">
                    {q.author && <cite>{q.author}</cite>}
                    {/* Who said it stays the citation; who passed it on is a
                        subordinate clause, not a second equal byline. */}
                    {q.quoted_author && (
                      <span className="quote__via">as quoted by {q.quoted_author}</span>
                    )}
                  </div>
                  {q.note && <p className="quote__note">{q.note}</p>}
                  <div className="quote__foot">
                    {bookTitleOf && q.book_id && (
                      <span className="quote__src">{bookTitleOf(q.book_id)}</span>
                    )}
                    {!q.book_id && <span className="quote__src quote__src--loose">Not from the shelf</span>}
                    {placed && (
                      <span className="quote__at num">
                        {chapter ? `${chapter.title} · ` : ''}{formatTime(startsAt!)}
                      </span>
                    )}
                    {q.transcribed && <span className="quote__tag">transcribed</span>}
                    <span className="quote__spacer" />
                    {onGoTo && placed && (
                      <BookButton variant="pamphlet" size="sm" onClick={() => onGoTo(q)}>
                        Play from here
                      </BookButton>
                    )}
                    {onRemove && (
                      <BookButton variant="pamphlet" size="sm"
                                  onClick={() => { void onRemove(q.id) }}>
                        Remove
                      </BookButton>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
    </section>
  )
}
