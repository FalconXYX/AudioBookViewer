import { useMemo, useState } from 'react'
import type { BookWithProgress } from '@/hooks/useLibrary'
import type { NewQuote } from '@/hooks/useQuotes'
import { searchQuotes, useQuoteSuggestions } from '@/hooks/useQuotes'
import type { SortOrder } from '@/lib/quoteGroups'
import { applyFacets, facetsOf, groupQuotes, sourceTitleOf } from '@/lib/quoteGroups'
import type { Quote, SharedWork } from '@/types'
import { BookButton } from './BookButton'
import { QuoteBrowser } from './QuoteBrowser'
import { QuoteList } from './QuoteList'
import { LooseQuoteForm } from './LooseQuoteForm'
import logoUrl from '../assets/logo.png'

interface Props {
  books: BookWithProgress[]
  quotes: Quote[]
  loading: boolean
  onAdd: (q: NewQuote) => Promise<Quote | null>
  onRemove: (id: string) => Promise<unknown>
  onUpdate: (id: string, patch: Partial<NewQuote>) => Promise<boolean>
  onOpenBook: (bookId: string) => void
  onClose: () => void
  /** Whatever last went wrong talking to the server, so it can be said aloud. */
  error?: string | null
  /** Narrow layout: shorter copy, and the composer is the whole screen. */
  phone?: boolean
  /** Books with a quote base, so a quote can be offered to one. */
  works?: SharedWork[]
  /** Preview harness only: opens the add form so it can be looked at. */
  demoAdding?: boolean
}

/** All of it, one shelf per book plus everything that came from elsewhere. */
export function QuotesScreen({
  books, quotes, loading, onAdd, onRemove, onUpdate, onOpenBook, onClose,
  error, phone, works, demoAdding,
}: Props) {
  const { authors, sources } = useQuoteSuggestions(quotes, books)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(demoAdding ?? false)
  const [bookKey, setBookKey] = useState<string | null>(null)
  const [authorKey, setAuthorKey] = useState<string | null>(null)
  const [order, setOrder] = useState<SortOrder>('newest')
  // Shut books, by key. A set of what is CLOSED rather than what is open, so
  // a newly appearing book is open by default — the common case is wanting to
  // read them, not having to unfold each one.
  const [shut, setShut] = useState<ReadonlySet<string>>(new Set())

  const toggle = (key: string) => setShut((prev) => {
    const next = new Set(prev)
    if (!next.delete(key)) next.add(key)
    return next
  })

  const titleOf = useMemo(() => {
    const m = new Map(books.map((b) => [b.id, b.title]))
    return (id: string) => m.get(id) ?? 'A book no longer on the shelf'
  }, [books])

  const found = useMemo(() => searchQuotes(quotes, query, titleOf), [quotes, query, titleOf])

  // The books and the people actually present, counted, for browsing by.
  // Built from every quote rather than from what is currently on screen, so
  // the lists do not shrink out from under the reader as they narrow.
  const facets = useMemo(() => facetsOf(quotes, titleOf), [quotes, titleOf])

  const narrowed = useMemo(
    () => applyFacets(found, titleOf, bookKey, authorKey),
    [found, titleOf, bookKey, authorKey],
  )

  // One shelf per source, whether or not the shelf knows the book. Two lines
  // from the same paperback belong under its title, not in a drawer marked
  // "elsewhere" — see lib/quoteGroups.
  const groups = useMemo(
    () => groupQuotes(narrowed, titleOf, order),
    [narrowed, titleOf, order],
  )

  return (
    <div className="stats-screen">
      <header className="stats-screen__bar">
        <span className="stats-screen__mark">
          <img src={logoUrl} alt="" />
          <b>Quotes</b>
        </span>
        <label className="head__find quotes__find">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" />
          </svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
                 placeholder="Search the words, the author or the book"
                 aria-label="Search quotes" />
        </label>
        <BookButton variant="pamphlet" size="sm" onClick={onClose}>Close</BookButton>
      </header>

      <div className="stats-screen__body">
        <section className="stats-block">
          <div className="quotes__head">
            {/* The browser below carries the running count; this only speaks
                while there is nothing to count yet. */}
            <p className="quotes__count num">
              {loading ? 'Reading your commonplace book…' : ''}
            </p>
            <BookButton variant="primary" openLabel="Opening…" onClick={() => setAdding(true)}>
              {phone ? 'Keep a line' : 'Add a quote'}
            </BookButton>
          </div>

          {error && <p className="alert" role="alert">{error}</p>}

          {adding && (
            <LooseQuoteForm
              onSave={onAdd}
              onClose={() => setAdding(false)}
              authors={authors}
              sources={sources}
            />
          )}

          {!loading && !adding && quotes.length === 0 && (
            <p className="quotes__empty">
              Nothing kept yet.
              {phone && ' Start with whatever is open in your other hand.'}
            </p>
          )}

          {!loading && quotes.length > 0 && !adding && (
            <QuoteBrowser
              books={facets.books} authors={facets.authors}
              bookKey={bookKey} authorKey={authorKey}
              onBook={setBookKey} onAuthor={setAuthorKey}
              order={order} onOrder={setOrder}
              showing={narrowed.length} total={quotes.length}
              collapsible={phone}
            />
          )}

          {!loading && quotes.length > 0 && narrowed.length === 0 && (
            <p className="quotes__empty">
              {query ? `Nothing matches “${query}”.` : 'Nothing under that.'}
            </p>
          )}

          {groups.sources.map((g) => {
            const open = !shut.has(g.key)
            return (
              <div key={g.key} className="quotes__group">
                <h3 className="sc sc--ruled">
                  {/* The title folds the book shut. Opening the book itself
                      moved to its own control beside the count — a heading
                      that did both would have to guess which you meant. */}
                  <button
                    type="button"
                    className="quotes__book"
                    aria-expanded={open}
                    aria-controls={`group-${g.key}`}
                    onClick={() => toggle(g.key)}
                  >
                    <span className="quotes__caret" aria-hidden="true" />
                    {g.title}
                  </button>
                  <i className="num">{g.quotes.length}</i>
                  {g.bookId && (
                    <button type="button" className="quotes__open"
                            onClick={() => onOpenBook(g.bookId!)}>
                      Open
                    </button>
                  )}
                </h3>
                {open && (
                  <div id={`group-${g.key}`}>
                    <QuoteList quotes={g.quotes} onRemove={onRemove} onUpdate={onUpdate}
                               authors={authors} sources={sources} hideSource
                               works={works} sourceTitleOf={(q) => sourceTitleOf(q, titleOf)} />
                  </div>
                )}
              </div>
            )
          })}

          {groups.loose.length > 0 && (() => {
            const open = !shut.has('__loose')
            return (
              <div className="quotes__group">
                <h3 className="sc sc--ruled">
                  <button
                    type="button"
                    className="quotes__book"
                    aria-expanded={open}
                    aria-controls="group-loose"
                    onClick={() => toggle('__loose')}
                  >
                    <span className="quotes__caret" aria-hidden="true" />
                    From elsewhere
                  </button>
                  <i className="num">{groups.loose.length}</i>
                </h3>
                {open && (
                  <div id="group-loose">
                    {/* These name no source, so nothing can be matched for
                        them — but they are often the very lines a reader
                        wanted to share, so the picker is still offered. */}
                    <QuoteList quotes={groups.loose} onRemove={onRemove} onUpdate={onUpdate}
                               authors={authors} sources={sources}
                               works={works} sourceTitleOf={() => null} />
                  </div>
                )}
              </div>
            )
          })()}

          {/* An ending, so the list finishes rather than running off the
              bottom edge. The asterism is the same mark the book page signs
              off with. */}
          {!loading && !adding && narrowed.length > 0 && (
            <div className="quotes__foot">
              <p className="colophon">
                {narrowed.length === quotes.length
                  ? <>That is the whole of it — <b>{quotes.length}</b> kept.</>
                  : <>The end of what matches — <b>{narrowed.length}</b> of <b>{quotes.length}</b> kept.</>}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
