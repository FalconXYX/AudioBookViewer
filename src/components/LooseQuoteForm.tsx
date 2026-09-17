import { useState } from 'react'
import type { NewQuote } from '@/hooks/useQuotes'
import { BookButton } from './BookButton'

interface Props {
  onSave: (q: NewQuote) => Promise<void>
  onClose: () => void
}

/**
 * A quote from anywhere — a paper book, a conversation, a film. No book, no
 * timestamp, so the row's audio columns stay null and it sorts under
 * "From elsewhere".
 */
export function LooseQuoteForm({ onSave, onClose }: Props) {
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [source, setSource] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!text.trim()) { setErr('A quote needs some words.'); return }
    setBusy(true)
    await onSave({
      book_id: null,
      text: text.trim(),
      author: author.trim() || null,
      quoted_author: source.trim() || null,
      note: note.trim() || null,
    })
    setBusy(false)
  }

  return (
    <div className="composer composer--inline">
      <label className="composer__field">
        <span className="sc sc--cool">The quote</span>
        <textarea rows={3} value={text} autoFocus disabled={busy}
                  onChange={(e) => setText(e.target.value)} />
      </label>
      <label className="composer__field">
        <span className="sc sc--cool">Said by</span>
        <input value={author} onChange={(e) => setAuthor(e.target.value)}
               placeholder="Nobody credited" />
      </label>
      <label className="composer__field">
        <span className="sc sc--cool">Where you found it <i>optional</i></span>
        <input value={source} onChange={(e) => setSource(e.target.value)}
               placeholder="A book, a talk, a friend" />
      </label>
      <label className="composer__field">
        <span className="sc sc--cool">Your note <i>optional</i></span>
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {err && <p className="alert" role="alert">{err}</p>}
      <div className="composer__foot">
        <BookButton variant="pamphlet" size="sm" onClick={onClose}>Cancel</BookButton>
        <BookButton variant="primary" openLabel="Keeping it…" onClick={() => void save()}
                    disabled={busy}>Keep it</BookButton>
      </div>
    </div>
  )
}
