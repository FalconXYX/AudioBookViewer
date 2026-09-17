import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import type { BookWithProgress } from '@/hooks/useLibrary'
import type { Quote } from '@/types'
import { useBookSource } from '@/hooks/useBookSource'
import { useBookmarks } from '@/hooks/useBookmarks'
import { useChapters } from '@/hooks/useChapters'
import { useDocumentIcon } from '@/hooks/useDocumentIcon'
import { usePlayer } from '@/hooks/usePlayer'
import { useProgress } from '@/hooks/useProgress'
import { formatDurationLong, formatTime } from '@/lib/format'
import { stampDate } from '@/lib/paratext'
import type { NewQuote } from '@/hooks/useQuotes'
import { useBookQuotes } from '@/hooks/useQuotes'
import { Apparatus } from './Apparatus'
import { BookButton } from './BookButton'
import { ChapterList } from './ChapterList'
import { CoverPasteTarget } from './CoverPasteTarget'
import { NowPlaying } from './NowPlaying'
import { QuoteComposer } from './QuoteComposer'
import { QuoteList } from './QuoteList'
import { SourceGate } from './SourceGate'

interface Props {
  user: User
  book: BookWithProgress
  accession: string | null
  autoplayNext: boolean
  /** Every quote the user owns; this view picks out and orders its own. */
  quotes: Quote[]
  onAddQuote: (q: NewQuote) => Promise<unknown>
  onRemoveQuote: (id: string) => Promise<void>
  onSetCoverBlob: (bookId: string, blob: Blob) => Promise<void>
  onSetCoverUrl: (bookId: string, url: string) => Promise<void>
  onDelete: (bookId: string) => void
}

export function BookView({
  user, book, accession, autoplayNext, quotes, onAddQuote, onRemoveQuote,
  onSetCoverBlob, onSetCoverUrl, onDelete,
}: Props) {
  const { chapters } = useChapters(book.id)
  const source = useBookSource(user, book, chapters)
  const progress = useProgress(user, book.id)
  const bookmarks = useBookmarks(user, book.id)

  /** Listening view. Entered by pressing play, left without stopping playback. */
  const [immersive, setImmersive] = useState(false)
  /** Where the head's mini transport is portalled to. */
  const [headSlot, setHeadSlot] = useState<HTMLElement | null>(null)
  /** Non-null while the quote composer is open, holding the captured moment. */
  const [quoting, setQuoting] = useState<{ chapterIdx: number; at: number } | null>(null)

  const ready = source.status === 'ready' && progress.loaded && chapters.length > 0

  const player = usePlayer({
    book,
    chapters,
    getFile: source.getFile,
    enabled: ready,
    initialChapterIdx: progress.initial?.chapter_idx ?? 0,
    initialPositionSec: progress.initial?.position_sec ?? 0,
    autoplayNext,
  })

  useDocumentIcon(book.cover_url, book.title)

  useEffect(() => {
    setHeadSlot(document.getElementById('head-transport'))
  }, [])

  // Buffer position on every tick; useProgress decides when to write.
  const { report, flush } = progress
  useEffect(() => {
    if (!ready) return
    report(player.chapterIdx, player.positionInChapter, player.bookPosition)
  }, [ready, report, player.chapterIdx, player.positionInChapter, player.bookPosition])

  // Pausing is a deliberate stopping point — persist it at once.
  useEffect(() => {
    if (!player.isPlaying) void flush()
  }, [player.isPlaying, flush])

  useEffect(() => () => void flush(), [flush])
  useEffect(() => setImmersive(false), [book.id])

  useEffect(() => {
    if (!ready) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      switch (e.key) {
        case 'Escape': if (immersive) setImmersive(false); break
        case ' ': e.preventDefault(); void player.togglePlay(); break
        case 'ArrowLeft': e.preventDefault(); void player.skipBack(); break
        case 'ArrowRight': e.preventDefault(); void player.skipForward(); break
        case 'ArrowUp': e.preventDefault(); player.nudgeRate(0.05); break
        case 'ArrowDown': e.preventDefault(); player.nudgeRate(-0.05); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready, immersive, player])

  const startListening = (chapterIdx?: number) => {
    setImmersive(true)
    if (chapterIdx === undefined) void player.play()
    else void player.goToChapter(chapterIdx, 0, true)
  }

  const started = book.fractionComplete > 0
  const pct = Math.min(100, book.fractionComplete * 100)
  const added = stampDate(book.created_at)

  // In the order they are said, which is not the order they were kept.
  const bookQuotes = useBookQuotes(quotes, book.id)

  const markedIdx = useMemo(
    () => new Set(bookmarks.bookmarks.map((m) => m.chapter_idx)),
    [bookmarks.bookmarks],
  )

  /** The first callers of bookmarks.add()/remove() anywhere in the app. */
  const toggleMark = (idx: number) => {
    const found = bookmarks.bookmarks.find((m) => m.chapter_idx === idx)
    if (found) void bookmarks.remove(found.id)
    else void bookmarks.add(idx, idx === player.chapterIdx ? player.positionInChapter : 0)
  }

  return (
    <>
      <section className="page">
        <div className="endpaper m-marble" aria-hidden="true" />
        <div className="page__inner">
          <div className="title-board">
            <CoverPasteTarget
              currentCoverUrl={book.cover_url}
              onImage={(blob) => onSetCoverBlob(book.id, blob)}
              onUrl={(url) => onSetCoverUrl(book.id, url)}
            />
            <div className="title-board__body">
              <h2>{book.title}</h2>
              <hr className="rule-double rule-double--gilt" />
              {book.author && <p className="title-board__by">{book.author}</p>}

              <SourceGate source={source} folderLabel={book.folder_label} />

              <div className="plate">
                <div className="plate__accession">
                  {added && <span>Added <b>{added}</b></span>}
                  <span>{chapters.length} files</span>
                  <span>{book.folder_label}</span>
                </div>
              </div>

              <div className="gauge" style={{ ['--pct' as string]: `${pct}%` }} aria-hidden="true">
                <span className="gauge__gilt" />
                {chapters.map((c) => (
                  <span
                    key={c.id}
                    className={`gauge__tick${c.idx === player.chapterIdx ? ' gauge__tick--now' : ''}`}
                    style={{ left: `${(c.book_offset_sec / (book.total_duration_sec || 1)) * 100}%` }}
                  />
                ))}
              </div>
              <div className="gauge__legend">
                <span>Chapter <b className="num">{player.chapterIdx + 1}</b> of <b className="num">{chapters.length}</b></span>
                <i className="leader" aria-hidden="true" />
                <span className="num">{Math.round(pct)}% · {formatDurationLong(book.secondsRemaining)} left</span>
              </div>

              <BookButton variant="primary" openLabel="Opening the book…" disabled={!ready} onClick={() => startListening()}>
                {started ? 'Resume listening' : 'Start listening'}
              </BookButton>
            </div>
          </div>

          <div className="spread">
            <ChapterList
              chapters={chapters}
              currentIdx={player.chapterIdx}
              fraction={book.fractionComplete}
              markedIdx={markedIdx}
              onSelect={(idx) => startListening(idx)}
              onToggleMark={toggleMark}
              disabled={!ready}
            />
            <Apparatus
              book={book}
              chapters={chapters}
              accession={accession}
              chapterIdx={player.chapterIdx}
            />
          </div>

          <QuoteList
            quotes={bookQuotes}
            chapters={chapters}
            heading="Quotes from this book"
            emptyNote="Nothing kept from this book yet."
            onGoTo={(q) => {
              // position_sec is where capture was PRESSED, which is the end of
              // the quote — the window runs backwards from it. Going there
              // plays the sentence after the one you wanted to hear again.
              const from = q.clip_start_sec ?? q.position_sec
              if (q.chapter_idx === null || from === null) return
              setImmersive(true)
              // And "Play from here" should play. It was parking paused.
              void player.goToChapter(q.chapter_idx, from, true)
            }}
            onRemove={onRemoveQuote}
          />

          <p className="colophon">
            <BookButton
              variant="pamphlet"
              size="sm"
              onClick={() => {
                if (confirm(`Remove “${book.title}” from your shelf? Your audio files are untouched.`)) {
                  onDelete(book.id)
                }
              }}
            >
              Remove from shelf
            </BookButton>
          </p>
        </div>
      </section>

      {ready && headSlot && createPortal(
        <>
          <button
            type="button"
            className="head__knob"
            aria-label={player.isPlaying ? 'Pause' : 'Play'}
            onClick={() => void player.togglePlay()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {player.isPlaying
                ? <path d="M6 5h3.5v14H6zm8.5 0H18v14h-3.5z" />
                : <path d="M8 5v14l11-7z" />}
            </svg>
          </button>
          <span>{player.chapter?.title ?? book.title}</span>
          <span className="fig">{formatTime(player.positionInChapter)}</span>
        </>,
        headSlot,
      )}

      {immersive && (
        <NowPlaying
          book={book}
          player={player}
          chapterCount={chapters.length}
          marked={markedIdx.has(player.chapterIdx)}
          onExit={() => setImmersive(false)}
          // Was add-only, so pressing it twice made two ribbons and there was
          // no way to take one out from here.
          onRibbon={() => toggleMark(player.chapterIdx)}
          onQuote={() => setQuoting({ chapterIdx: player.chapterIdx, at: player.positionInChapter })}
        />
      )}
      {quoting && (
        <QuoteComposer
          bookId={book.id}
          bookAuthor={book.author}
          chapter={chapters[quoting.chapterIdx] ?? null}
          chapterIdx={quoting.chapterIdx}
          at={quoting.at}
          getFile={ready
            ? async () => {
                const c = chapters[quoting.chapterIdx]
                return c ? source.getFile(c.file_name) : null
              }
            : null}
          onSave={onAddQuote}
          onClose={() => setQuoting(null)}
        />
      )}
    </>
  )
}
