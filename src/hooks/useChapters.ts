import { useCallback, useEffect, useState } from 'react'
import type { Chapter } from '@/types'
import { supabase } from '@/lib/supabase'

export interface ChaptersState {
  chapters: Chapter[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useChapters(bookId: string | null): ChaptersState {
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!bookId) {
      setChapters([])
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('chapters')
      .select('*')
      .eq('book_id', bookId)
      .order('idx', { ascending: true })

    if (err) setError(err.message)
    else setChapters((data ?? []) as Chapter[])
    setLoading(false)
  }, [bookId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { chapters, loading, error, reload }
}
