import type { NewChapter, ScanProgress, ScannedBook, ScannedTrack, SourceKind } from '@/types'
import { isAudioFile, readTrackMetadata, stripExtension } from './metadata'
import { naturalCompare } from './naturalSort'

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/** Opens the OS folder picker. Must be called from a user gesture. */
export async function pickBookFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFileSystemAccess()) {
    throw new Error(
      'This browser cannot open folders. Use Chrome or Edge on desktop.',
    )
  }
  try {
    return await window.showDirectoryPicker({ id: 'audiobooks', mode: 'read' })
  } catch (err) {
    // The user dismissing the picker is not an error worth surfacing.
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}

interface FoundFile {
  path: string
  file: File
}

/** Depth-first walk of the picked folder, collecting playable audio files. */
export async function walkAudioFiles(
  root: FileSystemDirectoryHandle,
  onProgress?: (p: ScanProgress) => void,
): Promise<FoundFile[]> {
  const found: FoundFile[] = []

  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const entry of dir.values()) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.kind === 'directory') {
        await walk(entry, path)
      } else if (isAudioFile(entry.name)) {
        found.push({ path, file: await entry.getFile() })
        onProgress?.({
          phase: 'listing',
          filesFound: found.length,
          filesProcessed: 0,
          currentFile: path,
        })
      }
    }
  }

  await walk(root, '')
  return found
}

/** Re-resolve a file from a stored directory handle by its relative path. */
export async function getFileByPath(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<File> {
  const parts = relativePath.split('/').filter(Boolean)
  const fileName = parts.pop()
  if (!fileName) throw new Error(`Invalid path: ${relativePath}`)

  let dir = root
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part)
  }
  const handle = await dir.getFileHandle(fileName)
  return handle.getFile()
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

/**
 * Decide playback order.
 *
 * Filename order is the more trustworthy signal for audiobooks — rips
 * frequently carry absent, duplicated, or per-folder-restarting track numbers.
 * So we group by directory (natural-sorted, which keeps "Part 1" before
 * "Part 10"), and only trust track numbers *within* a directory when every
 * file there has one and they are all distinct.
 */
function orderTracks(tracks: ScannedTrack[]): ScannedTrack[] {
  const byDir = new Map<string, ScannedTrack[]>()
  for (const t of tracks) {
    const d = dirOf(t.fileName)
    const bucket = byDir.get(d)
    if (bucket) bucket.push(t)
    else byDir.set(d, [t])
  }

  const dirs = [...byDir.keys()].sort(naturalCompare)
  const ordered: ScannedTrack[] = []

  for (const d of dirs) {
    const group = byDir.get(d)!
    const nums = group.map((t) => t.trackNo)
    const allNumbered = nums.every((n): n is number => n != null)
    const allDistinct = new Set(nums).size === nums.length

    if (allNumbered && allDistinct) {
      ordered.push(...[...group].sort((a, b) => a.trackNo! - b.trackNo!))
    } else {
      ordered.push(...[...group].sort((a, b) => naturalCompare(a.fileName, b.fileName)))
    }
  }

  return ordered
}

function detectSourceKind(tracks: ScannedTrack[]): SourceKind {
  if (tracks.length > 1) return 'multi_file'
  return tracks[0]?.chapters?.length ? 'single_file_chapters' : 'single_file'
}

/**
 * Flatten ordered tracks into a single chapter list.
 *
 * This is what lets one player handle all three layouts: a file with embedded
 * markers contributes one chapter per marker (all sharing a file_name, each
 * with its own start/end), and a file without them contributes exactly one
 * chapter spanning the whole file. Downstream, playback is always
 * "open file_name, seek to start_sec, stop at end_sec".
 */
function buildChapters(tracks: ScannedTrack[]): NewChapter[] {
  const chapters: NewChapter[] = []
  let idx = 0
  let bookOffset = 0

  for (const track of tracks) {
    if (track.chapters && track.chapters.length > 0) {
      for (let i = 0; i < track.chapters.length; i++) {
        const c = track.chapters[i]
        const next = track.chapters[i + 1]
        // Prefer the declared end; else the next marker; else the file's end.
        const end = c.endSec ?? next?.startSec ?? (track.durationSec || null)
        const duration = end != null ? Math.max(0, end - c.startSec) : 0

        chapters.push({
          idx: idx++,
          title: c.title,
          file_name: track.fileName,
          start_sec: c.startSec,
          end_sec: end,
          duration_sec: duration,
          book_offset_sec: bookOffset,
        })
        bookOffset += duration
      }
    } else {
      chapters.push({
        idx: idx++,
        title: track.title,
        file_name: track.fileName,
        start_sec: 0,
        end_sec: null, // play to end of file
        duration_sec: track.durationSec,
        book_offset_sec: bookOffset,
      })
      bookOffset += track.durationSec
    }
  }

  return chapters
}

/** Most common non-null value — used to pick an album/artist across tracks. */
function modeOf(values: Array<string | null>): string | null {
  const counts = new Map<string, number>()
  for (const v of values) {
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

/**
 * Split the files found under one picked folder into separate books.
 *
 * An .m4b IS a complete audiobook — that is what the container means — so each
 * one is its own book rather than a chapter of a larger one. Without this rule
 * a folder holding a trilogy as three .m4b files imports as a single book with
 * three enormous "chapters", and the only way out is to put every volume in
 * its own folder and pick them one at a time.
 *
 * Everything else keeps the old behaviour and groups by the folder it sits in,
 * because loose .mp3 files in a directory really are the chapters of one book.
 * Grouping by the immediate parent rather than by the root also means a folder
 * of per-book subfolders imports as one book each.
 */
export function groupIntoBooks(tracks: ScannedTrack[]): ScannedTrack[][] {
  const solo: ScannedTrack[][] = []
  const byDir = new Map<string, ScannedTrack[]>()

  for (const t of tracks) {
    if (/\.m4b$/i.test(t.fileName)) {
      solo.push([t])
      continue
    }
    const d = dirOf(t.fileName)
    const bucket = byDir.get(d)
    if (bucket) bucket.push(t)
    else byDir.set(d, [t])
  }

  const grouped = [...byDir.keys()]
    .sort(naturalCompare)
    .map((d) => byDir.get(d)!)

  return [...grouped, ...solo].filter((g) => g.length > 0)
}

/** The last path segment, used to name a book after the folder holding it. */
function lastSegment(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function titleFor(group: ScannedTrack[], rootName: string): string {
  const album = modeOf(group.map((t) => t.album))
  if (album) return album
  // A lone file names itself; a directory of files is named by the directory.
  if (group.length === 1) {
    const t = group[0]
    return t.title?.trim() || stripExtension(lastSegment(t.fileName))
  }
  const dir = dirOf(group[0].fileName)
  return dir ? lastSegment(dir) : rootName
}

function assemble(group: ScannedTrack[], root: FileSystemDirectoryHandle): ScannedBook {
  const ordered = orderTracks(group)
  const chapters = buildChapters(ordered)
  return {
    title: titleFor(ordered, root.name),
    author: modeOf(ordered.map((t) => t.artist)),
    sourceKind: detectSourceKind(ordered),
    folderLabel: root.name,
    totalDurationSec: chapters.reduce((sum, c) => sum + c.duration_sec, 0),
    coverBlob: ordered.find((t) => t.coverBlob)?.coverBlob ?? null,
    chapters,
  }
}

/**
 * Scan a picked folder into one or more complete, unsaved books.
 * Ordered largest first, so the main title of a set leads the confirmation.
 */
export async function scanBooksInFolder(
  root: FileSystemDirectoryHandle,
  onProgress?: (p: ScanProgress) => void,
): Promise<ScannedBook[]> {
  const files = await walkAudioFiles(root, onProgress)
  if (files.length === 0) {
    throw new Error(`No audio files found in "${root.name}".`)
  }

  files.sort((a, b) => naturalCompare(a.path, b.path))

  const tracks: ScannedTrack[] = []
  for (let i = 0; i < files.length; i++) {
    onProgress?.({
      phase: 'reading-tags',
      filesFound: files.length,
      filesProcessed: i,
      currentFile: files[i].path,
    })
    tracks.push(await readTrackMetadata(files[i].file, files[i].path))
  }

  onProgress?.({
    phase: 'done',
    filesFound: files.length,
    filesProcessed: files.length,
    currentFile: null,
  })

  return groupIntoBooks(tracks)
    .map((g) => assemble(g, root))
    .filter((b) => b.chapters.length > 0)
    .sort((a, b) => b.totalDurationSec - a.totalDurationSec)
}
