import { parseBlob, type IAudioMetadata, type IChapter } from 'music-metadata'
import type { EmbeddedChapter, ScannedTrack } from '@/types'
import { isMp4Family, readNeroChapters } from './mp4Chapters'

export const AUDIO_EXTENSIONS = [
  '.mp3', '.m4a', '.m4b', '.mp4', '.aac',
  '.ogg', '.oga', '.opus', '.wav', '.flac', '.webm',
] as const

export function isAudioFile(name: string): boolean {
  const lower = name.toLowerCase()
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function stripExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

/**
 * music-metadata reports chapter offsets in two different units depending on
 * the container, and gets this wrong if you assume either one:
 *
 *   - MP4 / M4B  : `start` and `end` are in `timeScale` units per second.
 *   - MP3 (CHAP) : already converted to seconds, and `timeScale` is undefined.
 *
 * Dividing by `timeScale ?? 1` normalizes both to seconds.
 */
function normalizeChapters(raw: readonly IChapter[] | undefined): EmbeddedChapter[] | null {
  if (!raw || raw.length === 0) return null

  const normalized = raw
    .map((c): EmbeddedChapter => {
      const scale = c.timeScale && c.timeScale > 0 ? c.timeScale : 1
      return {
        title: c.title?.trim() || 'Untitled chapter',
        startSec: c.start / scale,
        endSec: c.end != null ? c.end / scale : null,
      }
    })
    .filter((c) => Number.isFinite(c.startSec) && c.startSec >= 0)
    .sort((a, b) => a.startSec - b.startSec)

  return normalized.length > 0 ? normalized : null
}

/**
 * Fallback duration probe for files whose container has no duration header
 * (notably VBR MP3s with no Xing/VBRI frame). Asking music-metadata to compute
 * it means reading the entire file, which on a 10-hour audiobook is slow; the
 * browser's own decoder answers in milliseconds.
 *
 * The `currentTime = huge` trick forces Chrome to resolve a duration it
 * initially reports as Infinity.
 */
export function probeDurationViaAudio(file: Blob, timeoutMs = 15_000): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    let settled = false

    const finish = (value: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(value) && value > 0 ? value : 0)
    }

    const timer = setTimeout(() => finish(0), timeoutMs)

    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration === Infinity || Number.isNaN(audio.duration)) {
        // Force the decoder to seek to the end so it reports a real duration.
        audio.currentTime = 1e101
      } else {
        finish(audio.duration)
      }
    })
    audio.addEventListener('durationchange', () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) finish(audio.duration)
    })
    audio.addEventListener('error', () => finish(0))

    audio.preload = 'metadata'
    audio.src = url
  })
}

function pickCover(meta: IAudioMetadata): Blob | null {
  const pic = meta.common.picture?.[0]
  if (!pic) return null
  // `data` is a Uint8Array; copy into a fresh buffer so the Blob owns it.
  return new Blob([new Uint8Array(pic.data)], { type: pic.format || 'image/jpeg' })
}

/**
 * Read tags for one audio file. Never throws — a book with one unreadable
 * file should still scan, with that file falling back to filename-derived
 * metadata.
 */
export async function readTrackMetadata(
  file: File,
  relativePath: string,
): Promise<ScannedTrack> {
  const fallback: ScannedTrack = {
    fileName: relativePath,
    title: stripExtension(file.name),
    trackNo: null,
    diskNo: null,
    durationSec: 0,
    album: null,
    artist: null,
    chapters: null,
    coverBlob: null,
    sizeBytes: file.size,
  }

  let meta: IAudioMetadata
  try {
    meta = await parseBlob(file, {
      includeChapters: true, // required for MP4/M4B; ID3 CHAP is always parsed
      skipPostHeaders: true,
      duration: false, // avoid a full-file read; probeDurationViaAudio covers gaps
    })
  } catch {
    fallback.durationSec = await probeDurationViaAudio(file)
    // A file music-metadata cannot parse at all may still carry a readable
    // chapter list, and for an m4b that is the difference between a book and
    // one ten-hour track.
    if (isMp4Family(file.name)) fallback.chapters = await readNeroChapters(file)
    return fallback
  }

  const durationSec =
    meta.format.duration && meta.format.duration > 0
      ? meta.format.duration
      : await probeDurationViaAudio(file)

  // music-metadata reads only Apple-style chapter tracks. The Nero `chpl`
  // atom, which a large share of m4b files use instead, is not implemented
  // there at all — so when it finds nothing, look for that before concluding
  // the book has no chapters.
  let chapters = normalizeChapters(meta.format.chapters)
  if (!chapters && isMp4Family(file.name)) {
    chapters = await readNeroChapters(file)
  }

  return {
    fileName: relativePath,
    title: meta.common.title?.trim() || stripExtension(file.name),
    trackNo: meta.common.track?.no ?? null,
    diskNo: meta.common.disk?.no ?? null,
    durationSec,
    album: meta.common.album?.trim() || null,
    artist: meta.common.artist?.trim() || meta.common.albumartist?.trim() || null,
    chapters,
    coverBlob: pickCover(meta),
    sizeBytes: file.size,
  }
}
