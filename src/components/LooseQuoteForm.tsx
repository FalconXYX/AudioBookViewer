import { useId, useRef, useState } from 'react'
import type { NewQuote } from '@/hooks/useQuotes'
import type { Quote } from '@/types'
import { type FoundBook, looksLikeIsbn, lookupIsbn, lookupTitle } from '@/lib/openLibrary'
import { BookButton } from './BookButton'
import { NameSuggestions } from './NameSuggestions'

interface Props {
  onSave: (q: NewQuote) => Promise<Quote | null>
  onClose: () => void
  /** Names already used, offered back rather than retyped. */
  authors?: string[]
  sources?: string[]
}

/**
 * A quote from anywhere the shelf does not reach — a paper book, a talk, a
 * conversation. No chapter and no timestamp, so the row's audio columns stay
 * null and it files under "From elsewhere".
 *
 * This is also the whole of the app on a phone, which is why the lookup and
 * the pickers live here: typing an author's name with a thumb, one-handed,
 * while holding the book open, is the thing the form exists to avoid.
 */
export function LooseQuoteForm({ onSave, onClose, authors = [], sources = [] }: Props) {
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [source, setSource] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // The lookup is its own small state machine, kept apart from saving: it can
  // fail, or find nothing, without that having any bearing on the words.
  const [looking, setLooking] = useState(false)
  const [lookupNote, setLookupNote] = useState<string | null>(null)
  const [choices, setChoices] = useState<FoundBook[] | null>(null)

  const area = useRef<HTMLTextAreaElement>(null)
  const listId = useId()

  const take = (b: FoundBook) => {
    setSource(b.title)
    // Only fill an author the reader has not already written.
    if (!author.trim() && b.author) setAuthor(b.author)
    setChoices(null)
    setLookupNote(b.year ? `${b.title} · ${b.year}` : b.title)
  }

  const look = async () => {
    const q = source.trim()
    if (!q) { setLookupNote('Type a title or an ISBN first.'); return }
    setLooking(true)
    setChoices(null)
    setLookupNote(null)
    if (looksLikeIsbn(q)) {
      const found = await lookupIsbn(q)
      setLooking(false)
      if (found) take(found)
      else setLookupNote('No book with that number. The digits may be off by one.')
      return
    }
    // The author box narrows this enormously; see lookupTitle.
    const list = await lookupTitle(q, author)
    setLooking(false)
    if (list.length === 0) {
      // The author is what makes a title search work — a bare title is ranked
      // by fame, so a new book loses to every older one sharing its name.
      setLookupNote(author.trim()
        ? `Open Library has nothing under that for ${author.trim()}.`
        : 'Nothing found. Filling in "Said by" first narrows this a great deal.')
    }
    else if (list.length === 1) take(list[0])
    else setChoices(list)
  }

  const save = async () => {
    if (!text.trim()) {
      setErr('A quote needs some words.')
      area.current?.focus()
      return
    }
    setErr(null)
    setBusy(true)
    const saved = await onSave({
      book_id: null,
      text: text.trim(),
      author: author.trim() || null,
      // Where it came from. Until a paper book is a row of its own this shares
      // a column with "who relayed it"; QuoteList tells them apart by the
      // absence of a book_id, and reads this one as a source.
      quoted_author: source.trim() || null,
      note: note.trim() || null,
    })
    setBusy(false)
    // Stay open on failure. The words are only in this textarea until the
    // insert comes back, and closing would be the end of them.
    if (!saved) { setErr('That did not save. Your words are still here — try again.'); return }
    onClose()
  }

  return (
    <div className="composer composer--inline">
      <label className="composer__field">
        <span className="sc sc--cool">The quote</span>
        <textarea ref={area} rows={3} value={text} autoFocus disabled={busy}
                  placeholder="Whatever is open in your other hand."
                  onChange={(e) => setText(e.target.value)} />
      </label>

      <label className="composer__field">
        <span className="sc sc--cool">Said by</span>
        <input value={author} list={`${listId}-a`} disabled={busy}
               autoComplete="off" autoCapitalize="words" spellCheck={false}
               onChange={(e) => setAuthor(e.target.value)}
               placeholder="Nobody credited" />
        {/* Native on purpose: it is one element, it allows a value that is not
            on the list, and on a phone it is the keyboard's own suggestion
            strip rather than a second thing to aim at. */}
        <datalist id={`${listId}-a`}>
          {authors.map((a) => <option key={a} value={a} />)}
        </datalist>
        <NameSuggestions options={authors} value={author} onPick={setAuthor} />
      </label>

      <div className="composer__field">
        <span className="sc sc--cool">
          Where you found it <i>title, or the ISBN off the back</i>
        </span>
        <div className="composer__lookup">
          <input value={source} list={`${listId}-s`} disabled={busy}
                 autoComplete="off" spellCheck={false}
                 onChange={(e) => { setSource(e.target.value); setLookupNote(null) }}
                 placeholder="A book, a talk, a friend"
                 aria-label="Where you found it" />
          <BookButton variant="pamphlet" size="sm" onClick={() => void look()}
                      disabled={busy || looking}>
            {looking ? 'Asking…' : 'Look it up'}
          </BookButton>
        </div>
        <datalist id={`${listId}-s`}>
          {sources.map((s) => <option key={s} value={s} />)}
        </datalist>
        <NameSuggestions options={sources} value={source} onPick={setSource} />
        {lookupNote && <p className="composer__hint" role="status">{lookupNote}</p>}
        {choices && (
          <ul className="composer__choices">
            {choices.map((b, i) => (
              <li key={`${b.title}-${i}`}>
                <button type="button" onClick={() => take(b)}>
                  <b>{b.title}</b>
                  <span>{[b.author, b.year].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="composer__field">
        <span className="sc sc--cool">Your note <i>optional</i></span>
        <input value={note} disabled={busy} onChange={(e) => setNote(e.target.value)}
               placeholder="Why it stuck" />
      </label>

      {err && <p className="alert" role="alert">{err}</p>}
      <div className="composer__foot">
        <BookButton variant="pamphlet" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </BookButton>
        <BookButton variant="primary" openLabel="Keeping it…" onClick={() => void save()}
                    disabled={busy}>Keep it</BookButton>
      </div>
    </div>
  )
}
