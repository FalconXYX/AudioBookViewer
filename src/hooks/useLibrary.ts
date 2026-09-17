import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Book, Progress, ScannedBook } from '@/types'
import { supabase, COVERS_BUCKET } from '@/lib/supabase'
import { adoptRemoteCover, uploadCover } from '@/lib/covers'
import { getDeviceId, getDeviceLabel } from '@/lib/device'
import { removeBookFolder, saveBookFolder } from '@/lib/idb'

export interface BookWithProgress extends Book {
  progress: Progress | null
  /** 0..1 through the whole book, using the denormalized chapter offsets. */
  fractionComplete: number
  secondsRemaining: number
}

const CHAPTER_INSERT_CHUNK = 500

export interface LibraryState {
  books: BookWithProgress[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createBookFromScan: (
    scanned: ScannedBook,
    handle: FileSystemDirectoryHandle,
  ) => Promise<Book>
  deleteBook: (bookId: string) => Promise<void>
  updateBook: (bookId: string, patch: Partial<Pick<Book, 'title' | 'author'>>) => Promise<void>
  setCoverFromBlob: (bookId: string, blob: Blob) => Promise<void>
  setCoverFromUrl: (bookId: string, url: string) => Promise<void>
}

export function useLibrary(user: User | null): LibraryState {
  const [books, setBooks] = useState<BookWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setBooks([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [booksRes, progressRes] = await Promise.all([
        supabase.from('books').select('*').order('updated_at', { ascending: false }),
        supabase.from('progress').select('*'),
      ])
      if (booksRes.error) throw booksRes.error
      if (progressRes.error) throw progressRes.error

      const progressByBook = new Map<string, Progress>(
        (progressRes.data as Progress[]).map((p) => [p.book_id, p]),
      )

      setBooks(
        (booksRes.data as Book[]).map((book) => {
          const progress = progressByBook.get(book.id) ?? null
          const total = book.total_duration_sec || 0
          const done = Math.min(progress?.book_position_sec ?? 0, total)
          return {
            ...book,
            progress,
            fractionComplete: total > 0 ? done / total : 0,
            secondsRemaining: Math.max(0, total - done),
          }
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createBookFromScan = useCallback(
    async (scanned: ScannedBook, handle: FileSystemDirectoryHandle): Promise<Book> => {
      if (!user) throw new Error('Not signed in')

      const { data: bookRow, error: bookErr } = await supabase
        .from('books')
        .insert({
          user_id: user.id,
          title: scanned.title,
          author: scanned.author,
          source_kind: scanned.sourceKind,
          folder_label: scanned.folderLabel,
          total_duration_sec: scanned.totalDurationSec,
        })
        .select()
        .single()
      if (bookErr) throw bookErr
      const book = bookRow as Book

      const rows = scanned.chapters.map((c) => ({
        ...c,
        book_id: book.id,
        user_id: user.id,
      }))
      for (let i = 0; i < rows.length; i += CHAPTER_INSERT_CHUNK) {
        const { error } = await supabase
          .from('chapters')
          .insert(rows.slice(i, i + CHAPTER_INSERT_CHUNK))
        if (error) throw error
      }

      if (scanned.coverBlob) {
        try {
          const coverUrl = await uploadCover(user.id, book.id, scanned.coverBlob)
          await supabase.from('books').update({ cover_url: coverUrl }).eq('id', book.id)
          book.cover_url = coverUrl
        } catch {
          // Embedded art is a nicety; a failed upload must not lose the book.
        }
      }

      // Bind the folder to this device, and record that binding for the others.
      await saveBookFolder(book.id, handle)
      await supabase.from('device_sources').upsert(
        {
          user_id: user.id,
          device_id: getDeviceId(),
          device_label: getDeviceLabel(),
          book_id: book.id,
          folder_label: scanned.folderLabel,
          last_verified_at: new Date().toISOString(),
        },
        { onConflict: 'device_id,book_id' },
      )

      await refresh()
      return book
    },
    [user, refresh],
  )

  const deleteBook = useCallback(
    async (bookId: string) => {
      if (!user) throw new Error('Not signed in')
      // Storage has no cascade, so clear the cover before the row disappears.
      const existing = books.find((b) => b.id === bookId)
      if (existing?.cover_url?.includes(`/${COVERS_BUCKET}/`)) {
        const path = existing.cover_url.split(`/${COVERS_BUCKET}/`)[1]?.split('?')[0]
        if (path) await supabase.storage.from(COVERS_BUCKET).remove([path])
      }
      const { error } = await supabase.from('books').delete().eq('id', bookId)
      if (error) throw error
      await removeBookFolder(bookId)
      await refresh()
    },
    [user, books, refresh],
  )

  const updateBook = useCallback(
    async (bookId: string, patch: Partial<Pick<Book, 'title' | 'author'>>) => {
      const { error } = await supabase.from('books').update(patch).eq('id', bookId)
      if (error) throw error
      await refresh()
    },
    [refresh],
  )

  const setCoverFromBlob = useCallback(
    async (bookId: string, blob: Blob) => {
      if (!user) throw new Error('Not signed in')
      const url = await uploadCover(user.id, bookId, blob)
      const { error } = await supabase.from('books').update({ cover_url: url }).eq('id', bookId)
      if (error) throw error
      await refresh()
    },
    [user, refresh],
  )

  const setCoverFromUrl = useCallback(
    async (bookId: string, remoteUrl: string) => {
      if (!user) throw new Error('Not signed in')
      const url = await adoptRemoteCover(user.id, bookId, remoteUrl)
      const { error } = await supabase.from('books').update({ cover_url: url }).eq('id', bookId)
      if (error) throw error
      await refresh()
    },
    [user, refresh],
  )

  return {
    books,
    loading,
    error,
    refresh,
    createBookFromScan,
    deleteBook,
    updateBook,
    setCoverFromBlob,
    setCoverFromUrl,
  }
}
