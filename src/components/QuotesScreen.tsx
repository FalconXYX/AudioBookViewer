import { useMemo, useState } from 'react'
import type { BookWithProgress } from '@/hooks/useLibrary'
import type { NewQuote } from '@/hooks/useQuotes'
import { searchQuotes, useQuoteSuggestions } from '@/hooks/useQuotes'
import type { SortOrder } from '@/lib/quoteGroups'
import { applyFacets, facetsOf, groupQuotes } from '@/lib/quoteGroups'
import type { Quote } from '@/types'
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
  /** Preview harness only: opens the add form so it can be looked at. */
  demoAdding?: boolean
}

/** All of it, one shelf per book plus everything that came from elsewhere. */
export function QuotesScreen({
  books, quotes, loading, onAdd, onRemove, onUpdate, onOpenBook, onClose,
  error, phone, demoAdding,
}: Props) {
  const { authors, sources } = useQuoteSuggestions(quotes, books)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(demoAdding ?? false)
  const [bookKey, setBookKey] = useState<string | null>(null)
  const [authorKey, setAuthorKey] = useState<string | null>(null)
  const [order, setOrder] = useState<SortOrder>('newest')

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

          {groups.sources.map((g) => (
            <div key={g.key} className="quotes__group">
              <h3 className="sc sc--ruled">
                {/* A shelf book opens; a paper one has nothing to open, so it
                    narrows the page to itself instead. */}
                <button
                  type="button"
                  className="quotes__book"
                  onClick={() => (g.bookId ? onOpenBook(g.bookId) : setBookKey(g.key))}
                >
                  {g.title}
                </button>
                <i className="num">{g.quotes.length}</i>
              </h3>
              <QuoteList quotes={g.quotes} onRemove={onRemove} onUpdate={onUpdate}
                         authors={authors} sources={sources} hideSource />
            </div>
          ))}

          {groups.loose.length > 0 && (
            <div className="quotes__group">
              <h3 className="sc sc--ruled">
                From elsewhere<i className="num">{groups.loose.length}</i>
              </h3>
              <QuoteList quotes={groups.loose} onRemove={onRemove} onUpdate={onUpdate}
                         authors={authors} sources={sources} />
            </div>
          )}

        </section>
      </div>
    </div>
  )
}
