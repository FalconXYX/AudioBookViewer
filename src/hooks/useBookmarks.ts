import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Bookmark } from '@/types'
import { supabase } from '@/lib/supabase'

export interface BookmarksState {
  bookmarks: Bookmark[]
  add: (chapterIdx: number, positionSec: number, label?: string) => Promise<void>
  remove: (id: string) => Promise<void>
  reload: () => Promise<void>
}

export function useBookmarks(user: User | null, bookId: string | null): BookmarksState {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])

  const reload = useCallback(async () => {
    if (!user || !bookId) {
      setBookmarks([])
      return
    }
    const { data } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('book_id', bookId)
      .order('chapter_idx', { ascending: true })
      .order('position_sec', { ascending: true })
    setBookmarks((data ?? []) as Bookmark[])
  }, [user, bookId])

  useEffect(() => {
    void reload()
  }, [reload])

  const add = useCallback(
    async (chapterIdx: number, positionSec: number, label?: string) => {
      if (!user || !bookId) return
      await supabase.from('bookmarks').insert({
        book_id: bookId,
        user_id: user.id,
        chapter_idx: chapterIdx,
        position_sec: positionSec,
        label: label ?? null,
      })
      await reload()
    },
    [user, bookId, reload],
  )

  const remove = useCallback(
    async (id: string) => {
      await supabase.from('bookmarks').delete().eq('id', id)
      await reload()
    },
    [reload],
  )

  return { bookmarks, add, remove, reload }
}
