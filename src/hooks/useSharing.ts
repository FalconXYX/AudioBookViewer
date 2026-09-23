import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { SharedQuote, SharedWork } from '@/types'
import type { FoundBook } from '@/lib/openLibrary'
import { supabase } from '@/lib/supabase'

/**
 * The shared half of the commonplace book.
 *
 * Everything here is a request the database is free to refuse, and most of
 * the rules live there rather than in this file — a moderator check written
 * in TypeScript protects nothing, because the person you are protecting
 * against can edit the TypeScript. What these functions do is ask politely
 * and report what came back. See migration 20260923120000_shared_quotes.
 */

/**
 * Whether the signed-in reader may moderate.
 *
 * Read from `profiles`, which has a read-your-own-row policy and no write
 * policy at all: this flag is set by hand in the Supabase dashboard and
 * cannot be granted through the API by anybody, including its owner. So a
 * `true` here is worth trusting for deciding what to SHOW; it is never what
 * makes a moderation action succeed.
 */
export function useModerator(user: User | null): boolean {
  const [isModerator, setIsModerator] = useState(false)

  useEffect(() => {
    let alive = true
    if (!user) { setIsModerator(false); return }
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('is_moderator')
        .eq('user_id', user.id)
        .maybeSingle()
      if (alive) setIsModerator(Boolean(data?.is_moderator))
    })()
    return () => { alive = false }
  }, [user])

  return isModerator
}

export interface SharedWorksState {
  works: SharedWork[]
  loading: boolean
  error: string | null
  /** Moderator only. The database refuses this for everyone else. */
  approve: (book: FoundBook, userId: string) => Promise<boolean>
  /** Moderator only. Closing a book un-shares its quotes; it deletes nothing. */
  close: (workKey: string) => Promise<boolean>
  reload: () => Promise<void>
}

/** Every book with a quote base. Readable signed out, writable by moderators. */
export function useSharedWorks(): SharedWorksState {
  const [works, setWorks] = useState<SharedWork[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('shared_works')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else { setError(null); setWorks((data ?? []) as SharedWork[]) }
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const approve = useCallback(async (book: FoundBook, userId: string) => {
    if (!book.workKey) {
      setError('That result has no Open Library work key, so it cannot be opened up.')
      return false
    }
    const { error: err } = await supabase.from('shared_works').insert({
      work_key: book.workKey,
      title: book.title,
      author: book.author,
      year: book.year,
      cover_id: book.coverId,
      approved_by: userId,
    })
    if (err) { setError(err.message); return false }
    setError(null)
    await reload()
    return true
  }, [reload])

  const close = useCallback(async (workKey: string) => {
    const { error: err } = await supabase
      .from('shared_works').delete().eq('work_key', workKey)
    if (err) { setError(err.message); return false }
    setError(null)
    await reload()
    return true
  }, [reload])

  return { works, loading, error, approve, close, reload }
}

/**
 * The quote base for one book.
 *
 * Reads the `shared_quotes` view, not the table. The view has no `note` and
 * no `user_id` column, so what cannot be shown here also cannot be fetched —
 * the guarantee is in the shape of the thing rather than in this query
 * remembering to leave something out.
 */
export function useQuoteBase(workKey: string | null) {
  const [quotes, setQuotes] = useState<SharedQuote[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!workKey) { setQuotes([]); return }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('shared_quotes')
      .select('*')
      .eq('work_key', workKey)
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else { setError(null); setQuotes((data ?? []) as SharedQuote[]) }
    setLoading(false)
  }, [workKey])

  useEffect(() => { void reload() }, [reload])

  /**
   * Take a quote out of the shared base. Moderator only, enforced inside the
   * function on the server; it un-shares rather than deletes, so the reader
   * who wrote it keeps their own copy.
   */
  const withdraw = useCallback(async (quoteId: string, reason?: string) => {
    const { data, error: err } = await supabase.rpc('moderate_unshare', {
      quote_id: quoteId,
      reason: reason ?? null,
    })
    if (err) { setError(err.message); return false }
    if (data !== true) { setError('That quote was already withdrawn.'); return false }
    setError(null)
    setQuotes((prev) => prev.filter((q) => q.id !== quoteId))
    return true
  }, [])

  return { quotes, loading, error, reload, withdraw }
}
