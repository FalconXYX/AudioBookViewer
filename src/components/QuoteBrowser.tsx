import { useState } from 'react'
import type { Facet, SortOrder } from '@/lib/quoteGroups'

interface Props {
  books: Facet[]
  authors: Facet[]
  bookKey: string | null
  authorKey: string | null
  onBook: (key: string | null) => void
  onAuthor: (key: string | null) => void
  order: SortOrder
  onOrder: (o: SortOrder) => void
  /** How many quotes the current narrowing leaves. */
  showing: number
  total: number
  /** On a phone the two columns would fill the screen before a single quote. */
  collapsible?: boolean
}

const ORDERS: { key: SortOrder; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'title', label: 'By book' },
  { key: 'author', label: 'By author' },
  { key: 'longest', label: 'Longest' },
]

/**
 * Browsing the commonplace book by what is in it.
 *
 * Not a dropdown. A dropdown hides the thing you are trying to look through —
 * you have to already know the name of the book you want before it will help,
 * which is the opposite of browsing. These are the books and the authors you
 * actually have, with counts, laid out to be read down; pressing one narrows
 * the page and pressing it again lets it go.
 *
 * The lists come from the quotes rather than from the shelf, so a paperback
 * that has never been added sits beside the audiobooks as an equal.
 */
export function QuoteBrowser({
  books, authors, bookKey, authorKey, onBook, onAuthor,
  order, onOrder, showing, total, collapsible,
}: Props) {
  const narrowed = bookKey !== null || authorKey !== null
  // Open by default where there is room; on a phone it waits to be asked, so
  // the first thing on screen is still a quote.
  const [open, setOpen] = useState(false)
  const showFacets = !collapsible || open || narrowed

  return (
    <div className="browser">
      <div className="browser__bar">
        <p className="browser__count num">
          {narrowed
            ? `${showing} of ${total} kept`
            : `${total} kept`}
        </p>
        <div className="browser__sort" role="group" aria-label="Sort the quotes">
          {ORDERS.map((o) => (
            <button
              key={o.key}
              type="button"
              className="browser__sortbtn"
              aria-pressed={order === o.key}
              onClick={() => onOrder(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {narrowed && (
          <button type="button" className="browser__clear"
                  onClick={() => { onBook(null); onAuthor(null) }}>
            Show everything
          </button>
        )}
        {collapsible && !narrowed && (
          <button
            type="button"
            className="browser__toggle"
            aria-expanded={open}
            aria-controls="browser-facets"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide' : 'Browse by book or author'}
          </button>
        )}
      </div>

      <div className="browser__facets" id="browser-facets" hidden={!showFacets}>
        <Column
          heading="Books" empty="Nothing filed under a book yet."
          facets={books} selected={bookKey} onPick={onBook}
        />
        <Column
          heading="Authors" empty="Nobody credited yet."
          facets={authors} selected={authorKey} onPick={onAuthor}
        />
      </div>
    </div>
  )
}

function Column({ heading, empty, facets, selected, onPick }: {
  heading: string
  empty: string
  facets: Facet[]
  selected: string | null
  onPick: (key: string | null) => void
}) {
  return (
    <section className="browser__col">
      <h4 className="sc sc--ruled">{heading}<i className="num">{facets.length}</i></h4>
      {facets.length === 0
        ? <p className="browser__empty">{empty}</p>
        : (
          <ul className="browser__list">
            {facets.map((f) => {
              const on = selected === f.key
              return (
                <li key={f.key}>
                  <button
                    type="button"
                    className="browser__item"
                    aria-pressed={on}
                    // Pressing the one already chosen lets it go, so there is
                    // never a filter you cannot get back out of.
                    onClick={() => onPick(on ? null : f.key)}
                  >
                    <span className="browser__label">{f.label}</span>
                    <span className="browser__n num">{f.count}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
    </section>
  )
}
