import { useId, useState } from 'react'
import type { NewQuote } from '@/hooks/useQuotes'
import type { Quote } from '@/types'
import { BookButton } from './BookButton'
import { NameSuggestions } from './NameSuggestions'

interface Props {
  quote: Quote
  onSave: (id: string, patch: Partial<NewQuote>) => Promise<boolean>
  onClose: () => void
  authors?: string[]
  sources?: string[]
}

/**
 * Amending a quote after the fact.
 *
 * A line is usually kept in a hurry — mid-listen, or with a book held open in
 * the other hand — so the source, the note and often the words themselves get
 * settled later. This opens in the margin beside the quote rather than over
 * it, because a commonplace book is annotated in place, not administered
 * through a dialog.
 *
 * The quotation itself is editable. The transcriber writes into that field,
 * and machine text from a thirty-second clip is the single thing here most
 * likely to be wrong.
 */
export function QuoteAmend({ quote, onSave, onClose, authors = [], sources = [] }: Props) {
  const [text, setText] = useState(quote.text)
  const [author, setAuthor] = useState(quote.author ?? '')
  const [other, setOther] = useState(quote.quoted_author ?? '')
  const [note, setNote] = useState(quote.note ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const listId = useId()

  // With no book, the second name is where the line was found; with one, it is
  // whoever the author was quoting. One column, two jobs — see QuoteList.
  const loose = !quote.book_id

  const dirty = text !== quote.text
    || author !== (quote.author ?? '')
    || other !== (quote.quoted_author ?? '')
    || note !== (quote.note ?? '')

  const save = async () => {
    if (!text.trim()) { setErr('A quote needs some words.'); return }
    setErr(null)
    setBusy(true)
    const ok = await onSave(quote.id, {
      text: text.trim(),
      author: author.trim() || null,
      quoted_author: other.trim() || null,
      note: note.trim() || null,
    })
    setBusy(false)
    if (!ok) { setErr('That did not save. Your changes are still here — try again.'); return }
    onClose()
  }

  return (
    <div className="composer composer--inline composer--amend">
      <label className="composer__field">
        <span className="sc sc--cool">
          The quote {quote.transcribed && <i>transcribed, so worth reading twice</i>}
        </span>
        <textarea rows={3} value={text} disabled={busy} autoFocus
                  onChange={(e) => setText(e.target.value)} />
      </label>

      <label className="composer__field">
        <span className="sc sc--cool">Said by</span>
        <input value={author} list={`${listId}-a`} disabled={busy}
               autoComplete="off" autoCapitalize="words" spellCheck={false}
               onChange={(e) => setAuthor(e.target.value)} placeholder="Nobody credited" />
        <datalist id={`${listId}-a`}>
          {authors.map((a) => <option key={a} value={a} />)}
        </datalist>
        <NameSuggestions options={authors} value={author} onPick={setAuthor} />
      </label>

      <label className="composer__field">
        <span className="sc sc--cool">{loose ? 'Where you found it' : 'Relayed by'} <i>optional</i></span>
        <input value={other} list={loose ? `${listId}-s` : undefined} disabled={busy}
               autoComplete="off" spellCheck={false}
               onChange={(e) => setOther(e.target.value)}
               placeholder={loose ? 'A book, a talk, a friend' : 'Whoever passed it on'} />
        {loose && (
          <>
            <datalist id={`${listId}-s`}>
              {sources.map((s) => <option key={s} value={s} />)}
            </datalist>
            <NameSuggestions options={sources} value={other} onPick={setOther} />
          </>
        )}
      </label>

      <label className="composer__field">
        <span className="sc sc--cool">Your note <i>optional</i></span>
        <input value={note} disabled={busy} onChange={(e) => setNote(e.target.value)}
               placeholder="Why it stuck" />
      </label>

      {err && <p className="alert" role="alert">{err}</p>}
      <div className="composer__foot">
        <BookButton variant="pamphlet" size="sm" onClick={onClose} disabled={busy}>
          {dirty ? 'Discard changes' : 'Close'}
        </BookButton>
        <BookButton variant="primary" openLabel="Saving…" onClick={() => void save()}
                    disabled={busy || !dirty}>Save it</BookButton>
      </div>
    </div>
  )
}
