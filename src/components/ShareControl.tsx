import { useMemo, useState } from 'react'
import type { NewQuote } from '@/hooks/useQuotes'
import type { Quote, SharedWork } from '@/types'
import { foldTitle } from '@/lib/names'
import { BookButton } from './BookButton'

interface Props {
  quote: Quote
  /** Books a moderator has opened a quote base for. */
  works: SharedWork[]
  /** The title this quote is filed under, for matching against those books. */
  sourceTitle: string | null
  onUpdate: (id: string, patch: Partial<NewQuote>) => Promise<boolean>
}

/** Shared quotes are capped; the database enforces the same number. */
const MAX_SHARED = 1000

/**
 * Putting one line on a book's public page, and taking it back.
 *
 * Sharing is per quote and always deliberate — there is no "share everything"
 * and no default. What goes is the words and the attribution. Your note does
 * not, and cannot: the view the public reads has no such column.
 *
 * A quote can only join a book a moderator has opened up. That is not a
 * politeness enforced here — a share against anything else is refused by a
 * foreign key — but saying so before the press is kinder than a failure
 * afterwards.
 */
export function ShareControl({ quote, works, sourceTitle, onUpdate }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const shared = quote.visibility === 'public'

  // The opened book this quote appears to belong to, matched on the folded
  // title — the same comparison that groups the quote list, so what looks
  // like one book on screen behaves like one book here.
  const match = useMemo(() => {
    if (!sourceTitle) return null
    const key = foldTitle(sourceTitle)
    return works.find((w) => foldTitle(w.title) === key) ?? null
  }, [works, sourceTitle])

  const tooLong = quote.text.length > MAX_SHARED

  const set = async (patch: Partial<NewQuote>, failure: string) => {
    setErr(null)
    setBusy(true)
    const ok = await onUpdate(quote.id, patch)
    setBusy(false)
    if (!ok) setErr(failure)
  }

  if (shared) {
    return (
      <span className="share share--on">
        <span className="share__state">Shared</span>
        <BookButton variant="pamphlet" size="sm" disabled={busy}
                    onClick={() => void set(
                      { visibility: 'private', work_key: null },
                      'Could not withdraw it. Try again.',
                    )}>
          Make private
        </BookButton>
        {err && <span className="share__err" role="alert">{err}</span>}
      </span>
    )
  }

  // Nothing to join. Said plainly rather than shown as a dead control.
  if (!match) return null

  if (tooLong) {
    return (
      <span className="share">
        <span className="share__note">
          Too long to share — {quote.text.length} of {MAX_SHARED} characters.
        </span>
      </span>
    )
  }

  return (
    <span className="share">
      <BookButton variant="pamphlet" size="sm" disabled={busy}
                  onClick={() => void set(
                    { visibility: 'public', work_key: match.work_key },
                    'That would not share. The book may have just been closed.',
                  )}>
        Share to {match.title}
      </BookButton>
      {err && <span className="share__err" role="alert">{err}</span>}
    </span>
  )
}
