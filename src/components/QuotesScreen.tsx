import { useMemo, useState } from 'react'
import type { BookWithProgress } from '@/hooks/useLibrary'
import type { NewQuote } from '@/hooks/useQuotes'
import { searchQuotes } from '@/hooks/useQuotes'
import type { Quote } from '@/types'
import { BookButton } from './BookButton'
import { QuoteList } from './QuoteList'
import { LooseQuoteForm } from './LooseQuoteForm'
import logoUrl from '../assets/logo.png'

interface Props {
  books: BookWithProgress[]
  quotes: Quote[]
  loading: boolean
  onAdd: (q: NewQuote) => Promise<unknown>
  onRemove: (id: string) => Promise<void>
  onOpenBook: (bookId: string) => void
  onClose: () => void
  /** Preview harness only: opens the add form so it can be looked at. */
  demoAdding?: boolean
}

/** All of it, one shelf per book plus everything that came from elsewhere. */
export function QuotesScreen({
  books, quotes, loading, onAdd, onRemove, onOpenBook, onClose, demoAdding,
}: Props) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(demoAdding ?? false)

  const titleOf = useMemo(() => {
    const m = new Map(books.map((b) => [b.id, b.title]))
    return (id: string) => m.get(id) ?? 'A book no longer on the shelf'
  }, [books])

  const found = useMemo(() => searchQuotes(quotes, query, titleOf), [quotes, query, titleOf])

  // Group by book, with the loose ones last. Books with nothing kept are left
  // out entirely rather than listed as empty shelves.
  const groups = useMemo(() => {
    const byBook = new Map<string, Quote[]>()
    const loose: Quote[] = []
    for (const q of found) {
      if (!q.book_id) { loose.push(q); continue }
      const list = byBook.get(q.book_id) ?? []
      list.push(q)
      byBook.set(q.book_id, list)
    }
    const ordered = books
      .filter((b) => byBook.has(b.id))
      .map((b) => ({ id: b.id, title: b.title, quotes: byBook.get(b.id)! }))
    // Quotes whose book has been deleted still belong to somebody.
    for (const [id, list] of byBook) {
      if (!books.some((b) => b.id === id)) {
        ordered.push({ id, title: titleOf(id), quotes: list })
      }
    }
    return { ordered, loose }
  }, [found, books, titleOf])

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
            <p className="quotes__count num">
              {loading ? 'Reading your commonplace book…'
                : `${found.length} of ${quotes.length} kept`}
            </p>
            <BookButton variant="primary" openLabel="Opening…" onClick={() => setAdding(true)}>
              Add a quote
            </BookButton>
          </div>

          {adding && (
            <LooseQuoteForm
              onSave={async (q) => { await onAdd(q); setAdding(false) }}
              onClose={() => setAdding(false)}
            />
          )}

          {!loading && !adding && quotes.length === 0 && (
            <p className="quotes__empty">Nothing kept yet.</p>
          )}

          {!loading && quotes.length > 0 && found.length === 0 && (
            <p className="quotes__empty">Nothing matches “{query}”.</p>
          )}

          {groups.ordered.map((g) => (
            <div key={g.id} className="quotes__group">
              <h3 className="sc sc--ruled">
                <button type="button" className="quotes__book" onClick={() => onOpenBook(g.id)}>
                  {g.title}
                </button>
                <i className="num">{g.quotes.length}</i>
              </h3>
              <QuoteList quotes={g.quotes} onRemove={onRemove} />
            </div>
          ))}

          {groups.loose.length > 0 && (
            <div className="quotes__group">
              <h3 className="sc sc--ruled">
                From elsewhere<i className="num">{groups.loose.length}</i>
              </h3>
              <QuoteList quotes={groups.loose} onRemove={onRemove} />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
