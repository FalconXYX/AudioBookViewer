import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Quote } from '@/types'
import { supabase } from '@/lib/supabase'
import { canonicalName, distinctByName, foldName } from '@/lib/names'

/** Everything a quote needs at capture time. The row fills in the rest. */
export interface NewQuote {
  book_id?: string | null
  text: string
  note?: string | null
  author?: string | null
  quoted_author?: string | null
  chapter_idx?: number | null
  position_sec?: number | null
  clip_start_sec?: number | null
  clip_end_sec?: number | null
  transcribed?: boolean
}

export interface QuotesState {
  quotes: Quote[]
  loading: boolean
  error: string | null
  /** The row on success, null on failure. Callers must not close on null. */
  add: (q: NewQuote) => Promise<Quote | null>
  update: (id: string, patch: Partial<NewQuote>) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  reload: () => Promise<void>
}

/**
 * Supabase hands back machine-facing strings ("duplicate key value violates…").
 * The one thing the reader has to know is whether their words are safe, so say
 * that first and keep the detail for the second sentence.
 */
function saveFailure(detail: string): string {
  return `${plainly(detail)} Your words are still here; try again.`
}

/**
 * Supabase's auth failures arrive as things like "JWT issued at future time"
 * — accurate, and no use at all to somebody who only wants to know why their
 * commonplace book has gone blank. A rejected token always means the same
 * thing in practice and always has the same remedy, so say that instead.
 */
function plainly(detail: string): string {
  if (/\bjwt\b|token|expired|not yet valid|issued at|invalid claim/i.test(detail)) {
    return 'Your sign-in is no longer being accepted, so nothing can be read or'
      + ' saved right now. Signing out and back in clears it — nothing has been'
      + ' lost in the meantime.'
  }
  return `That did not work — ${detail}.`
}

/**
 * Fold a quote's two names onto the spellings already on file.
 *
 * The picker offers what has been used before, but nothing stops a name
 * being typed out by hand, and "john green" is not the string "John Green".
 * Left alone the two never meet again — not in the picker, not in a count,
 * not in anything that groups by author. Doing it here rather than in each
 * form means every way into the table gets it: the audiobook composer, the
 * loose form, and an amendment made months later.
 */
function withCanonicalNames<T extends Partial<NewQuote>>(patch: T, known: Quote[]): T {
  const authors = distinctByName(known.map((q) => q.author))
  const others = distinctByName(known.map((q) => q.quoted_author))
  const out = { ...patch }
  if (patch.author !== undefined) out.author = canonicalName(patch.author, authors)
  if (patch.quoted_author !== undefined) {
    out.quoted_author = canonicalName(patch.quoted_author, others)
  }
  return out
}

/**
 * Every quote the user owns, newest first. Scoping by book is done in memory
 * rather than with a second query: a commonplace book is small, and the quotes
 * tab needs the whole set anyway to search across it.
 */
export function useQuotes(user: User | null): QuotesState {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!user) {
      setQuotes([])
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false })
    // A rejected token is the usual reason this comes back empty; without
    // saying so the reader sees a commonplace book that looks wiped.
    if (err) setError(plainly(err.message))
    else {
      setError(null)
      setQuotes((data ?? []) as Quote[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => { void reload() }, [reload])

  const add = useCallback(async (q: NewQuote) => {
    if (!user) { setError(saveFailure('you are signed out')); return null }
    // A capture is usually the end of a thought, so a failure here costs the
    // user something they cannot get back by pressing the button again. The
    // network itself can throw before Supabase ever answers, which is the
    // ordinary case on a phone, so the call is wrapped rather than trusted.
    let data: unknown = null
    let err: { message: string } | null = null
    try {
      const res = await supabase
        .from('quotes')
        .insert({ ...withCanonicalNames(q, quotes), user_id: user.id })
        .select()
        .single()
      data = res.data
      err = res.error
    } catch (e) {
      err = { message: e instanceof Error ? e.message : 'the connection dropped' }
    }
    if (err || !data) {
      setError(saveFailure(err?.message ?? 'the server sent nothing back'))
      return null
    }
    setError(null)
    const row = data as Quote
    // Prepend rather than refetch: the list is ordered newest-first anyway and
    // a round trip here is felt, because it happens mid-listen.
    setQuotes((prev) => [row, ...prev])
    return row
  }, [user, quotes])

  const update = useCallback(async (id: string, patch: Partial<NewQuote>) => {
    let err: { message: string } | null = null
    try {
      const clean = withCanonicalNames(patch, quotes)
      err = (await supabase.from('quotes').update(clean).eq('id', id)).error
      if (!err) patch = clean
    } catch (e) {
      err = { message: e instanceof Error ? e.message : 'the connection dropped' }
    }
    if (err) { setError(saveFailure(err.message)); return false }
    setError(null)
    // Patch in place rather than refetch: an amendment is a small edit to a row
    // already on screen, and a round trip would make the list jump under the
    // reader's hands.
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } as Quote : q)))
    return true
  }, [quotes])

  const remove = useCallback(async (id: string) => {
    let err: { message: string } | null = null
    try {
      err = (await supabase.from('quotes').delete().eq('id', id)).error
    } catch (e) {
      err = { message: e instanceof Error ? e.message : 'the connection dropped' }
    }
    if (err) { setError(plainly(err.message)); return false }
    setError(null)
    setQuotes((prev) => prev.filter((q) => q.id !== id))
    return true
  }, [])

  return { quotes, loading, error, add, update, remove, reload }
}

/** The quotes belonging to one book, in the order they are said. */
export function useBookQuotes(all: Quote[], bookId: string | null): Quote[] {
  return useMemo(() => {
    if (!bookId) return []
    return all
      .filter((q) => q.book_id === bookId)
      .sort((a, b) =>
        (a.chapter_idx ?? 0) - (b.chapter_idx ?? 0)
        || (a.position_sec ?? 0) - (b.position_sec ?? 0))
  }, [all, bookId])
}

/**
 * What the reader has already written into an author field, and into a "where
 * you found it" field, newest first. Every quote is in memory already
 * (`reload` fetches the lot), so the picker costs one pass over an array and
 * no query — which is what lets it appear the instant a field is focused.
 */
export function useQuoteSuggestions(quotes: Quote[], books: { author: string | null }[] = []) {
  // Callers pass an array literal (`[book]`), which is a new reference on
  // every render, so the memo is keyed on the contents rather than on the
  // array itself.
  // A key over the contents, used only as the memo's dependency. The list
  // itself is rebuilt from `books`, so no name is ever split back apart on
  // a separator — joining and re-splitting is one typo away from turning
  // "John Green" into two authors.
  const shelfKey = JSON.stringify(books.map((b) => b.author))
  return useMemo(() => ({
    // A book on the shelf is an author the reader plainly knows, so the
    // audiobook authors seed the list before a single quote has been kept.
    authors: distinctByName([...quotes.map((q) => q.author), ...books.map((b) => b.author)]),
    // Until a physical book is a row of its own, "where you found it" lives in
    // `quoted_author` on the quotes that have no book. See QuoteList for the
    // matching read side.
    sources: distinctByName(quotes.filter((q) => !q.book_id).map((q) => q.quoted_author)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [quotes, shelfKey])
}

/**
 * Case-insensitive match across the words, both names, the note and the book.
 *
 * Names are matched a second time on their folded form, so searching
 * "jrr tolkien" finds a quote filed under "J. R. R. Tolkien" and vice versa.
 * Typing punctuation you did not use when you saved it should not hide your
 * own quotes from you.
 */
export function searchQuotes(quotes: Quote[], query: string, titleOf: (id: string) => string) {
  const q = query.trim().toLowerCase()
  if (!q) return quotes
  const folded = foldName(query)
  const nameHit = (value: string | null) => {
    if (!value) return false
    if (value.toLowerCase().includes(q)) return true
    return folded.length > 0 && foldName(value).includes(folded)
  }
  return quotes.filter((x) =>
    x.text.toLowerCase().includes(q)
    || nameHit(x.author)
    || nameHit(x.quoted_author)
    || (x.note ?? '').toLowerCase().includes(q)
    || (x.book_id ? titleOf(x.book_id).toLowerCase().includes(q) : false))
}
