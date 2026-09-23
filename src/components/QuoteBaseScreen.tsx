import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useQuoteBase, useSharedWorks } from '@/hooks/useSharing'
import { type FoundBook, coverUrl, looksLikeIsbn, lookupIsbn, lookupTitle } from '@/lib/openLibrary'
import type { SharedWork } from '@/types'
import { BookButton } from './BookButton'
import logoUrl from '../assets/logo.png'

interface Props {
  user: User | null
  isModerator: boolean
  onClose: () => void
  /** Preview harness only: stands in for what the server would return. */
  demoWorks?: SharedWork[]
  demoModerating?: boolean
}

/**
 * What everyone has kept from a book.
 *
 * Readable signed out — it is a public page — and it shows only what the
 * `shared_quotes` view carries: the words, who said them, when they were
 * kept. Not who kept them, and never their note.
 *
 * A moderator sees two extra things, both behind a switch they have to throw
 * on purpose: opening a book up, and withdrawing a line from one. The switch
 * is a guard against slips, not a permission — every one of those actions is
 * checked again on the server, where a forged client cannot reach.
 */
export function QuoteBaseScreen({
  user, isModerator, onClose, demoWorks, demoModerating,
}: Props) {
  const live = useSharedWorks()
  const works = demoWorks ?? live.works
  const { loading, error, approve, close } = live
  const [open, setOpen] = useState<SharedWork | null>(null)
  const [moderating, setModerating] = useState(demoModerating ?? false)

  return (
    <div className="stats-screen">
      <header className="stats-screen__bar">
        <span className="stats-screen__mark">
          <img src={logoUrl} alt="" />
          <b>Quote base</b>
        </span>
        <span className="quotebase__spacer" />
        {isModerator && (
          <button
            type="button"
            className="simple-switch"
            role="switch"
            aria-checked={moderating}
            onClick={() => setModerating((v) => !v)}
          >
            <span className="simple-switch__track" aria-hidden="true">
              <span className="simple-switch__knob" />
            </span>
            <span className="simple-switch__label">Moderating</span>
          </button>
        )}
        <BookButton variant="pamphlet" size="sm" onClick={onClose}>Close</BookButton>
      </header>

      <div className="stats-screen__body">
        <section className="stats-block">
          {error && <p className="alert" role="alert">{error}</p>}

          {open
            ? (
              <OneBook
                work={open}
                moderating={moderating && isModerator}
                onBack={() => setOpen(null)}
                onClose={async () => { if (await close(open.work_key)) setOpen(null) }}
              />
            )
            : (
              <>
                {moderating && isModerator && user && (
                  <ApprovePanel onApprove={(b) => approve(b, user.id)} />
                )}

                <h3 className="sc sc--ruled">
                  Books with a quote base<i className="num">{works.length}</i>
                </h3>

                {loading && !demoWorks && <p className="quotes__empty">Looking…</p>}
                {!loading && works.length === 0 && (
                  <p className="quotes__empty">
                    No book has one yet.
                    {isModerator
                      ? ' Turn on Moderating to open the first.'
                      : ' They are opened one at a time, on purpose.'}
                  </p>
                )}

                <ul className="worklist">
                  {works.map((w) => (
                    <li key={w.work_key}>
                      <button type="button" className="worklist__item" onClick={() => setOpen(w)}>
                        {w.cover_id
                          ? <img src={coverUrl(w.cover_id, 'S')} alt="" loading="lazy" />
                          : <span className="worklist__blank" aria-hidden="true" />}
                        <span className="worklist__body">
                          <b>{w.title}</b>
                          <span>{[w.author, w.year].filter(Boolean).join(' · ')}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
        </section>
      </div>
    </div>
  )
}

function OneBook({ work, moderating, onBack, onClose }: {
  work: SharedWork
  moderating: boolean
  onBack: () => void
  onClose: () => void
}) {
  const { quotes, loading, error, withdraw } = useQuoteBase(work.work_key)

  return (
    <>
      <div className="quotes__head">
        <BookButton variant="pamphlet" size="sm" onClick={onBack}>All books</BookButton>
        {moderating && (
          <BookButton
            variant="pamphlet" size="sm"
            onClick={() => {
              if (confirm(
                `Close the quote base for “${work.title}”?\n\n`
                + 'Every shared quote under it becomes private again. Nobody loses '
                + 'their own copy — the words stay in their commonplace book.',
              )) void onClose()
            }}
          >
            Close this book
          </BookButton>
        )}
      </div>

      <h3 className="sc sc--ruled">
        {work.title}<i className="num">{quotes.length}</i>
      </h3>
      {work.author && <p className="quotebase__by">{work.author}</p>}

      {error && <p className="alert" role="alert">{error}</p>}
      {loading && <p className="quotes__empty">Reading…</p>}
      {!loading && quotes.length === 0 && (
        <p className="quotes__empty">Nothing shared from this one yet.</p>
      )}

      <ul className="quotes__list">
        {quotes.map((q) => (
          <li key={q.id} className="quote">
            <blockquote className="quote__text">{q.text}</blockquote>
            <div className="quote__by">
              {q.author && <cite>{q.author}</cite>}
              {q.quoted_author && (
                <span className="quote__via">as quoted by {q.quoted_author}</span>
              )}
            </div>
            {moderating && (
              <div className="quote__foot">
                <span className="quote__spacer" />
                <BookButton
                  variant="pamphlet" size="sm"
                  onClick={() => {
                    const why = prompt(
                      'Withdraw this line from the shared page?\n\n'
                      + 'It stays in its writer’s own commonplace book; only the '
                      + 'public copy goes. A reason is recorded.',
                      '',
                    )
                    // Cancel returns null; an empty reason is still a choice.
                    if (why !== null) void withdraw(q.id, why || undefined)
                  }}
                >
                  Withdraw
                </BookButton>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

/** Moderator only: find a book on Open Library and open a quote base for it. */
function ApprovePanel({ onApprove }: { onApprove: (b: FoundBook) => Promise<boolean> }) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [looking, setLooking] = useState(false)
  const [found, setFound] = useState<FoundBook[] | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const look = async () => {
    const q = title.trim()
    if (!q) { setNote('A title or an ISBN first.'); return }
    setLooking(true); setNote(null); setFound(null)
    const list = looksLikeIsbn(q)
      ? [await lookupIsbn(q)].filter((b): b is FoundBook => b !== null)
      : await lookupTitle(q, author)
    setLooking(false)
    if (list.length === 0) setNote('Open Library has nothing under that.')
    else setFound(list)
  }

  return (
    <div className="composer composer--inline">
      <p className="composer__title">Open a book up</p>
      <p className="composer__hint">
        A quote base can only be kept for a book chosen here, which is what
        stops it becoming a heap of misspelled titles. The work is identified
        by its Open Library key, so everyone lands on the same book.
      </p>
      <div className="composer__pair">
        <label className="composer__field">
          <span className="sc sc--cool">Title or ISBN</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
                 placeholder="Hollywood, Ending" />
        </label>
        <label className="composer__field">
          <span className="sc sc--cool">Author <i>narrows it a great deal</i></span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)}
                 placeholder="John Green" />
        </label>
      </div>
      <BookButton variant="pamphlet" size="sm" disabled={looking}
                  onClick={() => void look()}>
        {looking ? 'Asking…' : 'Look it up'}
      </BookButton>
      {note && <p className="composer__hint" role="status">{note}</p>}

      {found && (
        <ul className="composer__choices">
          {found.map((b, i) => (
            <li key={`${b.workKey ?? b.title}-${i}`}>
              <button
                type="button"
                disabled={!b.workKey}
                onClick={async () => {
                  if (await onApprove(b)) { setFound(null); setTitle(''); setNote(null) }
                }}
              >
                <b>{b.title}</b>
                <span>
                  {[b.author, b.year].filter(Boolean).join(' · ')}
                  {!b.workKey && ' — no work key, cannot be opened'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
