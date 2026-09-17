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
      <div className="detail">
        <div className="detail__inner">
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
    <div className="detail">
      <div className="detail__inner">
        <h2>Add a book</h2>

        {!result && (
          <>
            <p className="muted" style={{ maxWidth: '34rem' }}>
              Choose the folder holding the audio. Chapters, order, length and any embedded
              cover are read from the files themselves.
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem' }}>
              <BookButton variant="primary" onClick={() => void scanner.scan()} disabled={scanner.scanning}>
                {scanner.scanning ? 'Scanning…' : 'Choose folder'}
              </BookButton>
              <BookButton variant="pamphlet" onClick={onCancel}>Cancel</BookButton>
            </div>
          </>
        )}

        {scanner.progress && scanner.progress.phase !== 'done' && (
          <p className="muted" aria-live="polite" style={{ marginTop: '1.5rem' }}>
            {scanner.progress.phase === 'listing'
              ? `Found ${scanner.progress.filesFound} files…`
              : `Reading tags ${scanner.progress.filesProcessed} / ${scanner.progress.filesFound}`}
            <br />
            <span className="faint" style={{ fontSize: '0.8rem' }}>{scanner.progress.currentFile}</span>
          </p>
        )}

        {scanner.error && <p className="alert" role="alert">{scanner.error}</p>}

        {result && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSaving(true)
              setSaveError(null)
              void onSave(result.scanned, result.handle)
                .catch((err) => setSaveError(err instanceof Error ? err.message : String(err)))
                .finally(() => setSaving(false))
            }}
          >
            <p className="muted" style={{ marginTop: '0.5rem' }}>
              <strong style={{ color: 'var(--text)' }}>{result.scanned.folderLabel}</strong>
              {' — '}{result.scanned.chapters.length} chapters,{' '}
              {formatDurationLong(result.scanned.totalDurationSec)}
              <br />
              <span className="faint" style={{ fontSize: '0.8rem' }}>
                Detected layout: {LAYOUT[result.scanned.sourceKind]}
              </span>
            </p>

            <div style={{ display: 'grid', gap: '0.9rem', maxWidth: '28rem', margin: '1.75rem 0' }}>
              <label style={{ display: 'grid', gap: '0.3rem' }}>
                <span className="stat__k">Title</span>
                <input value={result.scanned.title} required
                  onChange={(e) => scanner.patchResult({ title: e.target.value })} />
              </label>
              <label style={{ display: 'grid', gap: '0.3rem' }}>
                <span className="stat__k">Author</span>
                <input value={result.scanned.author ?? ''}
                  onChange={(e) => scanner.patchResult({ author: e.target.value || null })} />
              </label>
            </div>

            <details>
              <summary className="muted" style={{ cursor: 'pointer' }}>
                Check the chapter order ({result.scanned.chapters.length})
              </summary>
              <ol className="chapters" style={{ marginTop: '0.75rem' }}>
                {result.scanned.chapters.map((c) => (
                  <li key={c.idx}>
                    <div style={{ display: 'flex', gap: '1rem', padding: '0.55rem 0.4rem', alignItems: 'baseline' }}>
                      <span className="n">{c.idx + 1}</span>
                      <span className="t">
                        {c.title}
                        <br />
                        <span className="faint" style={{ fontSize: '0.75rem' }}>{c.file_name}</span>
                      </span>
                      <span className="d">{formatDurationLong(c.duration_sec)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </details>

            {saveError && <p className="alert" role="alert">{saveError}</p>}

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.75rem' }}>
              <BookButton variant="primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Add to shelf'}
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
