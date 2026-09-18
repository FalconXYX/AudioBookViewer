import { useEffect, useRef, useState } from 'react'
import type { Chapter } from '@/types'
import type { NewQuote } from '@/hooks/useQuotes'
import { formatTime } from '@/lib/format'
import { TranscribeError, decodeClip, modelReady, releaseDecodeCache, transcribe } from '@/lib/transcribe'
import { BookButton } from './BookButton'

interface Props {
  bookId: string | null
  bookAuthor: string | null
  chapter: Chapter | null
  chapterIdx: number
  /** Seconds into the chapter when capture was pressed. */
  at: number
  /** The chapter's audio file, when one is reachable. Null disables transcribing. */
  getFile: (() => Promise<File | null>) | null
  onSave: (q: NewQuote) => Promise<unknown>
  onClose: () => void
}

/** How far back the window reaches by default: you notice a line just after it. */
export const LOOKBACK_SEC = 30

export function QuoteComposer({
  bookId, bookAuthor, chapter, chapterIdx, at, getFile, onSave, onClose,
}: Props) {
  const [start, setStart] = useState(Math.max(0, at - LOOKBACK_SEC))
  const [end, setEnd] = useState(at)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [author, setAuthor] = useState(bookAuthor ?? '')
  const [quotedBy, setQuotedBy] = useState('')
  const [relaying, setRelaying] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [fromMachine, setFromMachine] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { area.current?.focus() }, [])
  // The decode cache holds a whole chapter of PCM for the non-MP4 path. Keeping
  // it alive after the dialog closes is how a long session ends up holding
  // several hundred megabytes for nothing.
  useEffect(() => releaseDecodeCache, [])

  const dur = chapter?.duration_sec ?? end
  const clamp = (v: number) => Math.min(Math.max(0, v), dur)

  const run = async () => {
    if (!getFile) return
    setErr(null)
    setBusy(modelReady() ? 'Listening to the clip…' : 'Fetching the recogniser (one time)…')
    try {
      const file = await getFile()
      if (!file) throw new TranscribeError('That chapter’s file is not reachable right now.')
      const samples = await decodeClip(file, start, end)
      setBusy('Listening to the clip…')
      const out = await transcribe(samples, (p) => {
        if (p.ratio !== null) setBusy(`Fetching the recogniser — ${Math.round(p.ratio * 100)}%`)
      })
      if (!out) throw new TranscribeError('Nothing intelligible in that stretch. Try a wider window.')
      // Append rather than replace: re-running over a different window should
      // add the missing half, not throw away what is already typed.
      setText((prev) => (prev ? `${prev.trimEnd()} ${out}` : out))
      setFromMachine(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Transcription failed.')
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    const body = text.trim()
    if (!body) { setErr('A quote needs some words.'); return }
    setBusy('Saving…')
    await onSave({
      book_id: bookId,
      text: body,
      note: note.trim() || null,
      author: author.trim() || null,
      quoted_author: relaying && quotedBy.trim() ? quotedBy.trim() : null,
      chapter_idx: bookId ? chapterIdx : null,
      position_sec: bookId ? at : null,
      clip_start_sec: bookId ? start : null,
      clip_end_sec: bookId ? end : null,
      transcribed: fromMachine,
    })
    setBusy(null)
    onClose()
  }

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <h2 id="composer-title" className="composer__title">Keep this line</h2>
        {chapter && (
          <p className="composer__where">
            {chapter.title} · {formatTime(at)}
          </p>
        )}

        {getFile && (
          <div className="composer__clip">
            <span className="sc sc--cool">The stretch to listen to</span>
            <div className="composer__range">
              <label>
                <span>From</span>
                <input type="number" value={Math.round(start)} min={0} max={Math.round(dur)}
                       onChange={(e) => setStart(clamp(Number(e.target.value)))} />
              </label>
              <label>
                <span>To</span>
                <input type="number" value={Math.round(end)} min={0} max={Math.round(dur)}
                       onChange={(e) => setEnd(clamp(Number(e.target.value)))} />
              </label>
              <span className="composer__len num">
                {formatTime(start)} – {formatTime(end)} · {Math.max(0, Math.round(end - start))}s
              </span>
            </div>
            <BookButton variant="pamphlet" size="sm" onClick={() => void run()}
                        disabled={!!busy || end <= start}>
              Transcribe it
            </BookButton>
            {!modelReady() && (
              <p className="composer__hint">
                First use downloads a speech model (~75 MB) and caches it. The audio
                is read on this machine and never uploaded.
              </p>
            )}
          </div>
        )}

        <label className="composer__field">
          <span className="sc sc--cool">The quote</span>
          <textarea ref={area} rows={4} value={text} disabled={!!busy}
                    placeholder="Type it, or transcribe the clip above."
                    onChange={(e) => { setText(e.target.value); setFromMachine(false) }} />
        </label>

        <label className="composer__field">
          <span className="sc sc--cool">Said by</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)}
                 placeholder="Nobody credited" />
        </label>

        <label className="composer__check">
          <input type="checkbox" checked={relaying} onChange={(e) => setRelaying(e.target.checked)} />
          <span>{bookAuthor ?? 'The author'} is quoting somebody else here</span>
        </label>
        {relaying && (
          <label className="composer__field">
            {/* `author` is who said the words; this is who is passing them on,
                so the attribution stays right way round on the quotes page. */}
            <span className="sc sc--cool">Relayed by</span>
            <input value={quotedBy || bookAuthor || ''}
                   onChange={(e) => setQuotedBy(e.target.value)} />
          </label>
        )}

        <label className="composer__field">
          <span className="sc sc--cool">Your note <i>optional</i></span>
          <input value={note} onChange={(e) => setNote(e.target.value)}
                 placeholder="Why it stuck" />
        </label>

        {busy && <p className="composer__busy" role="status">{busy}</p>}
        {err && <p className="alert" role="alert">{err}</p>}

        <div className="composer__foot">
          <BookButton variant="pamphlet" size="sm" onClick={onClose}>Cancel</BookButton>
          <BookButton variant="primary" openLabel="Keeping it…" onClick={() => void save()}
                      disabled={!!busy}>Keep it</BookButton>
        </div>
      </div>
    </div>
  )
}
