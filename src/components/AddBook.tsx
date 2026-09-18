import { useState } from 'react'
import type { ScannedBook } from '@/types'
import { useScanner } from '@/hooks/useScanner'
import { formatDurationLong } from '@/lib/format'
import { supportsFileSystemAccess } from '@/lib/scanner'
import { BookButton } from './BookButton'

interface Props {
  onSave: (scanned: ScannedBook, handle: FileSystemDirectoryHandle) => Promise<void>
  onCancel: () => void
}

const LAYOUT: Record<ScannedBook['sourceKind'], string> = {
  multi_file: 'one file per chapter',
  single_file_chapters: 'one file, chapters embedded',
  single_file: 'one file, no chapter markers',
}

export function AddBook({ onSave, onCancel }: Props) {
  const scanner = useScanner()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const result = scanner.result

  if (!supportsFileSystemAccess()) {
    return (
      <div className="addbook">
        <div className="addbook__inner">
          <h2>Add a book</h2>
          <p className="alert" role="alert">
            This browser cannot open folders. Use Chrome or Edge on desktop.
          </p>
          <BookButton onClick={onCancel}>Back</BookButton>
        </div>
      </div>
    )
  }

  return (
    <div className="addbook">
      <div className="addbook__inner">
        <h2>Add a book</h2>

        {!result && (
          <>
            <p className="muted">
              Choose the folder holding the audio. Chapters, order, length and any embedded
              cover are read from the files themselves.
            </p>
            <div className="addbook__actions">
              <BookButton variant="primary" onClick={() => void scanner.scan()} disabled={scanner.scanning}>
                {scanner.scanning ? 'Scanning…' : 'Choose folder'}
              </BookButton>
              <BookButton variant="pamphlet" onClick={onCancel}>Cancel</BookButton>
            </div>
          </>
        )}

        {scanner.progress && scanner.progress.phase !== 'done' && (
          <p className="muted" aria-live="polite">
            {scanner.progress.phase === 'listing'
              ? `Found ${scanner.progress.filesFound} files…`
              : `Reading tags ${scanner.progress.filesProcessed} / ${scanner.progress.filesFound}`}
            <br />
            <span className="faint">{scanner.progress.currentFile}</span>
          </p>
        )}

        {scanner.error && <p className="alert" role="alert">{scanner.error}</p>}

        {result && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSaving(true)
              setSaveError(null)
              // Saved in sequence rather than in parallel: they share one
              // directory handle and one device-source row per book, and a
              // burst of concurrent writes is how duplicates appear.
              void (async () => {
                try {
                  for (const book of result.books) await onSave(book, result.handle)
                } catch (err) {
                  setSaveError(err instanceof Error ? err.message : String(err))
                } finally {
                  setSaving(false)
                }
              })()
            }}
          >
            <p className="muted">
              <strong>{result.handle.name}</strong>
              {' — '}
              {result.books.length === 1
                ? 'one book'
                : `${result.books.length} books found in this folder`}
            </p>

            {result.books.map((book, i) => (
              <section key={`${book.title}-${i}`} className="found">
                <div className="found__head">
                  <h3>{book.title || 'Untitled'}</h3>
                  {result.books.length > 1 && (
                    <BookButton variant="pamphlet" size="sm"
                                onClick={() => scanner.dropBook(i)}>
                      Not a book
                    </BookButton>
                  )}
                </div>
                <p className="muted">
                  {book.chapters.length}{' '}
                  {book.chapters.length === 1 ? 'chapter' : 'chapters'},{' '}
                  {formatDurationLong(book.totalDurationSec)}
                  <br />
                  <span className="faint">
                    {LAYOUT[book.sourceKind]}
                  </span>
                </p>

                <div className="found__fields">
                  <label>
                    <span className="sc sc--cool">Title</span>
                    <input value={book.title} required
                      onChange={(e) => scanner.patchBook(i, { title: e.target.value })} />
                  </label>
                  <label>
                    <span className="sc sc--cool">Author</span>
                    <input value={book.author ?? ''}
                      onChange={(e) => scanner.patchBook(i, { author: e.target.value || null })} />
                  </label>
                </div>

                <details>
                  <summary className="muted">
                    Check the chapter order ({book.chapters.length})
                  </summary>
                  <ol className="found__toc">
                    {book.chapters.map((c) => (
                      <li key={c.idx}>
                        <div className="found__row">
                          <span className="found__n">{c.idx + 1}</span>
                          <span className="found__t">
                            {c.title}
                            <br />
                            <span className="faint">{c.file_name}</span>
                          </span>
                          <span className="found__d">{formatDurationLong(c.duration_sec)}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </details>
              </section>
            ))}

            {saveError && <p className="alert" role="alert">{saveError}</p>}

            <div className="addbook__actions">
              <BookButton variant="primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : result.books.length > 1 ? `Add ${result.books.length} books` : 'Add to shelf'}
              </BookButton>
              <BookButton variant="pamphlet" onClick={scanner.reset} disabled={saving}>
                Pick a different folder
              </BookButton>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
