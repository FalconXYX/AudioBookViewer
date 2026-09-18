import { useState } from 'react'
import { AddBook } from './components/AddBook'
import { BookView } from './components/BookView'
import { DayBook } from './components/DayBook'
import { Footer } from './components/Footer'
import { Head } from './components/Head'
import { Shelf } from './components/Shelf'
import { SignIn } from './components/SignIn'
import { QuotesScreen } from './components/QuotesScreen'
import { Stats } from './components/Stats'
import { useAuth } from './hooks/useAuth'
import { useLibrary } from './hooks/useLibrary'
import { useSimpleMode } from './hooks/useSimpleMode'
import { useQuotes } from './hooks/useQuotes'
import { useSettings } from './hooks/useSettings'
import { accessionNo } from './lib/paratext'

type View =
  | { name: 'book'; bookId: string }
  | { name: 'add' }
  | { name: 'stats' }
  | { name: 'quotes' }
  | { name: 'none' }

export default function App() {
  const auth = useAuth()
  const library = useLibrary(auth.user)
  const settings = useSettings(auth.user)
  const quotes = useQuotes(auth.user)
  const [simple, toggleSimple] = useSimpleMode()
  const [view, setView] = useState<View>({ name: 'none' })
  const [query, setQuery] = useState('')

  if (auth.loading) {
    return <div className="empty"><p className="faint">Loading…</p></div>
  }

  if (!auth.user) {
    // The backdrop is the case itself, blurred — not an empty field.
    return (
      <>
        <div
          className="shell shell--backdrop"
          aria-hidden="true"
          {...({ inert: '' } as Record<string, string>)}
        >
          <Head
            books={[]} openBook={undefined} where={null}
            query="" onQuery={() => {}} email={undefined} onSignOut={() => {}}
          />
          <nav className="case">
            <div className="case__drawer">
              <div className="run">
                <ul className="run__books">
                  {[2, 5, 7, 4, 1, 6, 3, 8, 9, 2].map((slot, i) => (
                    <li key={i}>
                      <span
                        className="volume"
                        style={{
                          ['--spine-tint' as string]: `var(--binding-${slot})`,
                          ['--thick' as string]: `${34 + ((i * 7) % 16)}px`,
                        }}
                      />
                    </li>
                  ))}
                </ul>
                <div className="plank" />
              </div>
            </div>
          </nav>
          <main className="desk" />
        </div>
        <SignIn
          onSignIn={() => void auth.signInWithGoogle()}
          loading={auth.loading}
          error={auth.error}
          onDismissError={auth.clearError}
        />
      </>
    )
  }

  const openBook = view.name === 'book' ? library.books.find((b) => b.id === view.bookId) : undefined

  return (
    <div className="shell">
      <Head
        books={library.books}
        openBook={openBook}
        where={null}
        query={query}
        onQuery={setQuery}
        email={auth.user.email}
        onSignOut={() => void auth.signOut()}
        onHome={() => setView({ name: 'none' })}
        onStats={() => setView(view.name === 'stats' ? { name: 'none' } : { name: 'stats' })}
        statsActive={view.name === 'stats'}
        onQuotes={() => setView(view.name === 'quotes' ? { name: 'none' } : { name: 'quotes' })}
        quotesActive={view.name === 'quotes'}
        simple={simple}
        onSimple={toggleSimple}
      />

      {/* The switch changes the whole page at once. Without an announcement a
          screen-reader user gets no confirmation that anything happened, and
          the visual knob is no help. Polite, so it never interrupts. */}
      <p className="sr-only" role="status" aria-live="polite">
        {simple ? 'Simple mode on' : 'Simple mode off'}
      </p>

      <Shelf
        books={library.books}
        loading={library.loading}
        selectedId={view.name === 'book' ? view.bookId : null}
        query={query}
        onSelect={(bookId) =>
          // Clicking the open book again closes it, so the shelf is never a
          // dead end even if the header crumb is missed.
          setView(view.name === 'book' && view.bookId === bookId
            ? { name: 'none' }
            : { name: 'book', bookId })}
        onAdd={() => setView({ name: 'add' })}
      />

      <main className="desk">
        {library.error && <p className="alert" role="alert">{library.error}</p>}

        {view.name === 'add' && (
          <AddBook
            onSave={async (scanned, handle) => {
              const book = await library.createBookFromScan(scanned, handle)
              setView({ name: 'book', bookId: book.id })
            }}
            onCancel={() => setView({ name: 'none' })}
          />
        )}

        {view.name === 'book' && openBook && (
          <BookView
            key={openBook.id}
            user={auth.user}
            book={openBook}
            accession={accessionNo(library.books, openBook.id)}
            autoplayNext={settings.settings.autoplay_next}
            quotes={quotes.quotes}
            onAddQuote={quotes.add}
            onRemoveQuote={quotes.remove}
            onSetCoverBlob={library.setCoverFromBlob}
            onSetCoverUrl={library.setCoverFromUrl}
            onDelete={(bookId) => {
              void library.deleteBook(bookId)
              setView({ name: 'none' })
            }}
          />
        )}

        {view.name === 'book' && !openBook && (
          <div className="empty"><p>That book is no longer on the shelf.</p></div>
        )}

        {view.name === 'none' && (
          <DayBook
            books={library.books}
            onAdd={() => setView({ name: 'add' })}
            onOpen={(bookId) => setView({ name: 'book', bookId })}
          />
        )}

        {view.name !== 'book' && (
          <Footer />
        )}
      </main>

      {view.name === 'quotes' && (
        <QuotesScreen
          books={library.books}
          quotes={quotes.quotes}
          loading={quotes.loading}
          onAdd={quotes.add}
          onRemove={quotes.remove}
          onOpenBook={(bookId) => setView({ name: 'book', bookId })}
          onClose={() => setView({ name: 'none' })}
        />
      )}

      {view.name === 'stats' && (
        <Stats
          user={auth.user}
          books={library.books}
          settings={settings}
          onClose={() => setView({ name: 'none' })}
        />
      )}
    </div>
  )
}
