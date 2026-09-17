import type { BookWithProgress } from '@/hooks/useLibrary'
import { BookButton } from './BookButton'
import { RUN_LABEL, bindingFor, runOf, thicknessFor, type Run } from '@/lib/paratext'

interface Props {
  books: BookWithProgress[]
  loading: boolean
  selectedId: string | null
  query: string
  onSelect: (bookId: string) => void
  onAdd: () => void
}
const RUNS: Run[] = ['reading', 'unopened', 'finished']

export function Shelf({ books, loading, selectedId, query, onSelect, onAdd }: Props) {
  const q = query.trim().toLowerCase()
  const shown = q ? books.filter((b) => b.title.toLowerCase().includes(q) ||
                                        (b.author ?? '').toLowerCase().includes(q)) : books
  return (
    <nav className="case" aria-label="Bookshelf">
      <div className="case__drawer">
        {loading && <p className="case__empty">Opening the case…</p>}
        {!loading && books.length === 0 && (
          <p className="case__empty">Nothing on the shelf yet. Point the app at a folder of
            audio files and it will work out the chapters.</p>
        )}
        {!loading && books.length > 0 && shown.length === 0 && (
          <p className="case__empty">Nothing on the shelf matches “{query}”.</p>
        )}
        {RUNS.map((run) => {
          const inRun = shown.filter((b) => runOf(b) === run)
          if (inRun.length === 0) return null
          return (
            <div className="run" key={run}>
              <h2 className="run__label"><b>{RUN_LABEL[run]}</b><i className="num">{inRun.length}</i></h2>
              <ul className="run__books">
                {inRun.map((book) => (
                  <li key={book.id}>
                    <button type="button" className="volume"
                      aria-current={book.id === selectedId ? 'true' : undefined}
                      onClick={() => onSelect(book.id)}
                      style={{
                        ['--spine-tint' as string]: bindingFor(book.id),
                        ['--thick' as string]: thicknessFor(book.id),
                        ['--pct' as string]: `${Math.min(100, book.fractionComplete * 100)}%`,
                      }}>
                      <span className="volume__title">{book.title}</span>
                      {book.author && <span className="volume__author">{book.author}</span>}
                      {book.fractionComplete > 0 && (
                        <span className="volume__edge" aria-hidden="true"><i /></span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="plank" aria-hidden="true" />
            </div>
          )
        })}
      </div>
      <div className="case__foot">
        <BookButton block onClick={onAdd}>Add a book</BookButton>
      </div>
    </nav>
  )
}

