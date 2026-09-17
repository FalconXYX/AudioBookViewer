import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

/**
 * A FileSystemDirectoryHandle cannot be serialized to JSON or stored in
 * Postgres, but it CAN be structured-cloned into IndexedDB and survive a
 * browser restart. That is the mechanism behind "set the folder up once per
 * device": we keep the handle here and only need the user to re-grant read
 * permission (one click) on later visits.
 */
export interface FolderRecord {
  bookId: string
  handle: FileSystemDirectoryHandle
  folderLabel: string
  savedAt: number
}

interface AbvDB extends DBSchema {
  folders: { key: string; value: FolderRecord }
}

let dbPromise: Promise<IDBPDatabase<AbvDB>> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB<AbvDB>('audiobookviewer', 1, {
      upgrade(database) {
        database.createObjectStore('folders', { keyPath: 'bookId' })
      },
    })
  }
  return dbPromise
}

export async function saveBookFolder(
  bookId: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const conn = await db()
  await conn.put('folders', {
    bookId,
    handle,
    folderLabel: handle.name,
    savedAt: Date.now(),
  })
}

export async function getBookFolder(bookId: string): Promise<FolderRecord | undefined> {
  const conn = await db()
  return conn.get('folders', bookId)
}

export async function removeBookFolder(bookId: string): Promise<void> {
  const conn = await db()
  await conn.delete('folders', bookId)
}

export async function listBookFolders(): Promise<FolderRecord[]> {
  const conn = await db()
  return conn.getAll('folders')
}

export type PermissionOutcome = 'granted' | 'denied' | 'prompt-required'

/**
 * Check (and optionally re-request) read permission on a stored handle.
 *
 * `interactive: true` MUST be called from inside a user gesture — a click
 * handler — or Chrome rejects it outright. That is why the UI needs an
 * explicit "Reconnect folder" button rather than reconnecting on page load.
 */
export async function ensureReadPermission(
  handle: FileSystemDirectoryHandle,
  interactive: boolean,
): Promise<PermissionOutcome> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'read' }
  if ((await handle.queryPermission(opts)) === 'granted') return 'granted'
  if (!interactive) return 'prompt-required'
  return (await handle.requestPermission(opts)) === 'granted' ? 'granted' : 'denied'
}
