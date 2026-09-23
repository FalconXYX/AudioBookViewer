import { useState } from 'react'
import type { Chapter, Quote, SharedWork } from '@/types'
import type { NewQuote } from '@/hooks/useQuotes'
import { formatTime } from '@/lib/format'
import { BookButton } from './BookButton'
import { QuoteAmend } from './QuoteAmend'
import { ShareControl } from './ShareControl'

interface Props {
  quotes: Quote[]
  /** Only needed to name the chapter a quote came from. */
  chapters?: Chapter[]
  heading?: string
  emptyNote?: string
  /** Where each quote came from, for the all-books view. */
  bookTitleOf?: (bookId: string) => string
  onGoTo?: (q: Quote) => void
  onRemove?: (id: string) => Promise<unknown> | void
  /** Supplying this puts an Amend control on every quote. */
  onUpdate?: (id: string, patch: Partial<NewQuote>) => Promise<boolean>
  authors?: string[]
  sources?: string[]
  /** True when a heading above already names the source, so it is not repeated. */
  hideSource?: boolean
  /** Books with a quote base. Supplying these puts a Share control on a quote. */
  works?: SharedWork[]
  /** What each quote is filed under, for matching against those books. */
  sourceTitleOf?: (q: Quote) => string | null
}

/**
 * The quotations themselves, set as quotations: the words first and largest,
 * the attribution under them, and the machinery (chapter, timestamp, controls)
 * last and quietest. A commonplace book is read, not administered.
 */
export function QuoteList({
  quotes, chapters, heading, emptyNote, bookTitleOf, onGoTo, onRemove,
  onUpdate, authors, sources, hideSource, works, sourceTitleOf,
}: Props) {
  const [amending, setAmending] = useState<string | null>(null)

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
              // One column, two meanings. On a quote from the shelf the second
              // name is whoever the author was relaying; on a quote from
              // anywhere else it is where the line was found, and calling a
              // book title "as quoted by" was making nonsense of both.
              const relayer = q.book_id ? q.quoted_author : null
              const foundIn = q.book_id ? null : q.quoted_author

              if (amending === q.id && onUpdate) {
                return (
                  <li key={q.id} className="quote quote--amending">
                    <QuoteAmend quote={q} onSave={onUpdate} authors={authors} sources={sources}
                                onClose={() => setAmending(null)} />
                  </li>
                )
              }

              return (
                <li key={q.id} className="quote">
                  <blockquote className="quote__text">{q.text}</blockquote>
                  <div className="quote__by">
                    {q.author && <cite>{q.author}</cite>}
                    {/* Who said it stays the citation; who passed it on is a
                        subordinate clause, not a second equal byline. */}
                    {relayer && <span className="quote__via">as quoted by {relayer}</span>}
                  </div>
                  {q.note && <p className="quote__note">{q.note}</p>}
                  <div className="quote__foot">
                    {/* Under a group heading the source is already named, and
                        repeating it only shows off the three spellings the
                        same book was typed under. */}
                    {!hideSource && bookTitleOf && q.book_id && (
                      <span className="quote__src">{bookTitleOf(q.book_id)}</span>
                    )}
                    {!hideSource && foundIn && <span className="quote__src">{foundIn}</span>}
                    {!hideSource && !q.book_id && !foundIn && (
                      <span className="quote__src quote__src--loose">Not from the shelf</span>
                    )}
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
                    {works && works.length > 0 && onUpdate && (
                      <ShareControl
                        quote={q} works={works}
                        sourceTitle={sourceTitleOf ? sourceTitleOf(q) : null}
                        onUpdate={onUpdate}
                      />
                    )}
                    {onUpdate && (
                      <BookButton variant="pamphlet" size="sm" onClick={() => setAmending(q.id)}>
                        Amend
                      </BookButton>
                    )}
                    {onRemove && (
                      <BookButton
                        variant="pamphlet"
                        size="sm"
                        onClick={() => {
                          // Nothing here is recoverable and the control sits a
                          // thumb-width from "Play from here", so it asks.
                          const head = q.text.length > 60 ? `${q.text.slice(0, 60)}…` : q.text
                          if (confirm(`Forget this line?\n\n“${head}”\n\nIt cannot be brought back.`)) {
                            void onRemove(q.id)
                          }
                        }}
                      >
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
