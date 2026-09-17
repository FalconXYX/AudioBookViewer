import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Quote } from '@/types'
import { supabase } from '@/lib/supabase'

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
  add: (q: NewQuote) => Promise<Quote | null>
  update: (id: string, patch: Partial<NewQuote>) => Promise<void>
  remove: (id: string) => Promise<void>
  reload: () => Promise<void>
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
    if (err) setError(err.message)
    else {
      setError(null)
      setQuotes((data ?? []) as Quote[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => { void reload() }, [reload])

  const add = useCallback(async (q: NewQuote) => {
    if (!user) return null
    const { data, error: err } = await supabase
      .from('quotes')
      .insert({ ...q, user_id: user.id })
      .select()
      .single()
    if (err) { setError(err.message); return null }
    const row = data as Quote
    // Prepend rather than refetch: the list is ordered newest-first anyway and
    // a round trip here is felt, because it happens mid-listen.
    setQuotes((prev) => [row, ...prev])
    return row
  }, [user])

  const update = useCallback(async (id: string, patch: Partial<NewQuote>) => {
    const { error: err } = await supabase.from('quotes').update(patch).eq('id', id)
    if (err) { setError(err.message); return }
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } as Quote : q)))
  }, [])

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('quotes').delete().eq('id', id)
    if (err) { setError(err.message); return }
    setQuotes((prev) => prev.filter((q) => q.id !== id))
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

/** Case-insensitive match across the words, both authors, and the user's note. */
export function searchQuotes(quotes: Quote[], query: string, titleOf: (id: string) => string) {
  const q = query.trim().toLowerCase()
  if (!q) return quotes
  return quotes.filter((x) =>
    x.text.toLowerCase().includes(q)
    || (x.author ?? '').toLowerCase().includes(q)
    || (x.quoted_author ?? '').toLowerCase().includes(q)
    || (x.note ?? '').toLowerCase().includes(q)
    || (x.book_id ? titleOf(x.book_id).toLowerCase().includes(q) : false))
}
