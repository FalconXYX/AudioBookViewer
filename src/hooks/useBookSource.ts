import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Book, Chapter } from '@/types'
import { ensureReadPermission, getBookFolder, saveBookFolder } from '@/lib/idb'
import { getFileByPath, pickBookFolder } from '@/lib/scanner'
import { getDeviceId, getDeviceLabel } from '@/lib/device'
import { supabase } from '@/lib/supabase'

export type SourceStatus =
  /** Looking up this device's stored handle. */
  | 'checking'
  /** Handle present and readable — playback can start. */
  | 'ready'
  /** Handle present but Chrome needs a click to re-grant read access. */
  | 'needs-permission'
  /** This device has never been pointed at this book's folder. */
  | 'not-on-this-device'
  | 'error'

export interface BookSourceState {
  status: SourceStatus
  error: string | null
  /** Re-grant permission on the stored handle. Call from a click handler. */
  reconnect: () => Promise<void>
  /** Point this device at a folder for this book. Call from a click handler. */
  attachFolder: () => Promise<void>
  /** Resolve a chapter's file. Throws if the source is not ready. */
  getFile: (relativePath: string) => Promise<File>
}

/**
 * How many of the book's files must be present for a folder to be accepted as
 * the right one. Guards against pointing at a sibling book by mistake, while
 * tolerating a rename or a missing stray file.
 */
const VERIFY_SAMPLE = 3

async function folderMatchesBook(
  handle: FileSystemDirectoryHandle,
  chapters: Chapter[],
): Promise<boolean> {
  const paths = [...new Set(chapters.map((c) => c.file_name))].slice(0, VERIFY_SAMPLE)
  if (paths.length === 0) return true
  for (const path of paths) {
    try {
      await getFileByPath(handle, path)
    } catch {
      return false
    }
  }
  return true
}

export function useBookSource(
  user: User | null,
  book: Book | null,
  chapters: Chapter[],
): BookSourceState {
  const [status, setStatus] = useState<SourceStatus>('checking')
  const [error, setError] = useState<string | null>(null)
  const handleRef = useRef<FileSystemDirectoryHandle | null>(null)

  useEffect(() => {
    let active = true
    handleRef.current = null

    if (!book) {
      setStatus('checking')
      return
    }

    void (async () => {
      setStatus('checking')
      setError(null)
      try {
        const record = await getBookFolder(book.id)
        if (!active) return

        if (!record) {
          setStatus('not-on-this-device')
          return
        }

        handleRef.current = record.handle
        // Non-interactive: a page load is not a user gesture, so we can only
        // observe the permission, never request it.
        const outcome = await ensureReadPermission(record.handle, false)
        if (!active) return
        setStatus(outcome === 'granted' ? 'ready' : 'needs-permission')
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    })()

    return () => {
      active = false
    }
  }, [book])

  const recordDeviceSource = useCallback(
    async (bookId: string, folderLabel: string) => {
      if (!user) return
      await supabase.from('device_sources').upsert(
        {
          user_id: user.id,
          device_id: getDeviceId(),
          device_label: getDeviceLabel(),
          book_id: bookId,
          folder_label: folderLabel,
          last_verified_at: new Date().toISOString(),
        },
        { onConflict: 'device_id,book_id' },
      )
    },
    [user],
  )

  const reconnect = useCallback(async () => {
    const handle = handleRef.current
    if (!book || !handle) return
    setError(null)
    try {
      const outcome = await ensureReadPermission(handle, true)
      if (outcome === 'granted') {
        setStatus('ready')
        await recordDeviceSource(book.id, handle.name)
      } else {
        setStatus('needs-permission')
        setError('Read access was denied for that folder.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [book, recordDeviceSource])

  const attachFolder = useCallback(async () => {
    if (!book) return
    setError(null)
    try {
      const picked = await pickBookFolder()
      if (!picked) return // user dismissed the picker

      if (!(await folderMatchesBook(picked, chapters))) {
        setError(
          `"${picked.name}" does not contain this book's files. ` +
            `Expected to find ${chapters[0]?.file_name ?? 'the book audio'} inside it.`,
        )
        return
      }

      handleRef.current = picked
      await saveBookFolder(book.id, picked)
      await recordDeviceSource(book.id, picked.name)
      setStatus('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [book, chapters, recordDeviceSource])

  const getFile = useCallback(async (relativePath: string): Promise<File> => {
    const handle = handleRef.current
    if (!handle) throw new Error('No folder is connected for this book on this device.')
    return getFileByPath(handle, relativePath)
  }, [])

  return { status, error, reconnect, attachFolder, getFile }
}
