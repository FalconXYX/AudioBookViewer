import type { EmbeddedChapter } from '@/types'

/**
 * Nero-style chapter lists in MP4 / M4A / M4B files.
 *
 * music-metadata reads only APPLE-style chapters — a separate text track that
 * the audio track points at with a `chap` reference — and it finds them by
 * tokenizing through `mdat`, the atom holding the entire audiobook. The other
 * convention, and the one a great many m4b files in the wild actually use, is
 * a `chpl` atom tucked inside `moov.udta`. The word "chpl" does not appear
 * anywhere in music-metadata, so those books arrive with no chapters at all
 * and end up as one unbroken ten-hour track.
 *
 * This reads that atom directly. It walks the box tree by seeking rather than
 * reading: every step slices just the sixteen bytes of an atom header and then
 * jumps the atom's length, so finding chapters in a 700 MB file costs a few
 * kilobytes and never pulls `mdat` into memory.
 */

/** chpl timestamps are in 100-nanosecond units. */
const CHPL_TICKS_PER_SEC = 10_000_000

/** A malformed count should not turn into a hundred-thousand-element loop. */
const MAX_CHAPTERS = 5000

const FOURCC = (b: Uint8Array) => String.fromCharCode(b[0], b[1], b[2], b[3])

export interface Atom {
  type: string
  /** Offset of the atom's payload (past its header). */
  body: number
  /** Length of the payload. */
  length: number
  /** Offset of the next sibling. */
  next: number
}

export async function readAt(file: Blob, offset: number, length: number): Promise<DataView> {
  const slice = file.slice(offset, Math.min(offset + length, file.size))
  return new DataView(await slice.arrayBuffer())
}

/** Read one atom header at `offset`, or null past the end / on nonsense. */
export async function readHeader(file: Blob, offset: number): Promise<Atom | null> {
  if (offset + 8 > file.size) return null
  const head = await readAt(file, offset, 16)
  if (head.byteLength < 8) return null

  let size = head.getUint32(0)
  const type = FOURCC(new Uint8Array(head.buffer, head.byteOffset + 4, 4))
  let headerLen = 8

  if (size === 1) {
    // 64-bit size. JS numbers hold this exactly well past any real file.
    if (head.byteLength < 16) return null
    const hi = head.getUint32(8)
    const lo = head.getUint32(12)
    size = hi * 2 ** 32 + lo
    headerLen = 16
  } else if (size === 0) {
    size = file.size - offset // runs to end of file
  }

  if (size < headerLen || offset + size > file.size + 1) return null
  return { type, body: offset + headerLen, length: size - headerLen, next: offset + size }
}

/**
 * Find a direct child of the container spanning [start, end).
 *
 * The child's length is clamped to the parent's end. A truncated file can
 * declare an atom longer than the box actually containing it, and reading on
 * trust walks straight out of the atom and into whatever follows — in testing,
 * an `mdat` header turned up spliced onto the end of a chapter title.
 */
export async function findChild(
  file: Blob, start: number, end: number, want: string,
): Promise<Atom | null> {
  let at = start
  while (at < end) {
    const atom = await readHeader(file, at)
    if (!atom) return null
    if (atom.type === want) {
      return { ...atom, length: Math.max(0, Math.min(atom.length, end - atom.body)) }
    }
    if (atom.next <= at) return null // zero-length: would spin forever
    at = atom.next
  }
  return null
}

/** Walk a path of nested atom types from the top level, e.g. moov → udta → chpl. */
export async function findPath(file: Blob, path: string[]): Promise<Atom | null> {
  let start = 0
  let end = file.size
  let found: Atom | null = null
  for (const want of path) {
    found = await findChild(file, start, end, want)
    if (!found) return null
    start = found.body
    end = found.body + found.length
  }
  return found
}

function decodeTitle(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim()
  } catch {
    return ''
  }
}

/**
 * Parse a `chpl` payload.
 *
 * Layout, following ffmpeg's reader, which is the de-facto spec because the
 * atom was never standardised:
 *   version : 1 byte
 *   flags   : 3 bytes
 *   [4 bytes reserved, present only when version >= 1]
 *   count   : 1 byte
 *   per entry: start (8 bytes, 100ns units), title length (1 byte), title
 */
function parseChpl(view: DataView): EmbeddedChapter[] | null {
  if (view.byteLength < 5) return null
  const version = view.getUint8(0)
  let at = 4 // past version + flags
  if (version >= 1) {
    if (view.byteLength < at + 4) return null
    at += 4
  }
  if (view.byteLength < at + 1) return null
  const count = view.getUint8(at)
  at += 1
  if (count === 0 || count > MAX_CHAPTERS) return null

  const out: EmbeddedChapter[] = []
  for (let i = 0; i < count; i++) {
    if (at + 9 > view.byteLength) break
    const hi = view.getUint32(at)
    const lo = view.getUint32(at + 4)
    const startSec = (hi * 2 ** 32 + lo) / CHPL_TICKS_PER_SEC
    at += 8
    const titleLen = view.getUint8(at)
    at += 1
    // A title running past the payload means the atom is truncated; stop
    // rather than decode bytes belonging to the next box.
    if (at + titleLen > view.byteLength) break
    const title = decodeTitle(new Uint8Array(view.buffer, view.byteOffset + at, titleLen))
    at += titleLen
    if (!Number.isFinite(startSec) || startSec < 0) continue
    out.push({ title: title || `Chapter ${out.length + 1}`, startSec, endSec: null })
  }

  if (out.length === 0) return null
  // Markers occasionally arrive unsorted; playback assumes ascending order.
  out.sort((a, b) => a.startSec - b.startSec)
  return out
}

/**
 * Chapters from an MP4-family file's `chpl` atom, or null when it has none.
 * `moov` sits at the end of the file about as often as the start, so both are
 * reached the same way — by walking the top level rather than assuming.
 */
export async function readNeroChapters(file: Blob): Promise<EmbeddedChapter[] | null> {
  try {
    const chpl = await findPath(file, ['moov', 'udta', 'chpl'])
    if (!chpl || chpl.length < 5 || chpl.length > 1 << 20) return null
    const view = await readAt(file, chpl.body, chpl.length)
    return parseChpl(view)
  } catch {
    // A malformed box is a book without chapters, not a failed import.
    return null
  }
}

/* ===========================================================================
   APPLE CHAPTER TRACKS
   The other convention, and the one most iTunes- and Audible-derived .m4b
   files use: a separate TEXT track holding one sample per chapter, which the
   audio track points at through a `tref/chap` reference.

   music-metadata does implement this, but it reads the samples inside its
   `mdat` handler — and the app parses with `skipPostHeaders` and without a
   duration pass, so on a file whose `moov` trails the media (the usual layout
   for a large m4b) it never gets there. The result is a ten-hour book with
   exactly one chapter, which is what prompted writing this.
   =========================================================================== */

/** Track IDs referenced as chapter tracks by this trak, via tref/chap. */
async function chapterTrackIds(file: Blob, trak: Atom): Promise<number[]> {
  const tref = await findChild(file, trak.body, trak.body + trak.length, 'tref')
  if (!tref) return []
  const chap = await findChild(file, tref.body, tref.body + tref.length, 'chap')
  if (!chap) return []
  const v = await readAt(file, chap.body, chap.length)
  const ids: number[] = []
  for (let at = 0; at + 4 <= v.byteLength; at += 4) ids.push(v.getUint32(at))
  return ids
}

/** This trak's own ID, from tkhd. */
async function trackId(file: Blob, trak: Atom): Promise<number | null> {
  const tkhd = await findChild(file, trak.body, trak.body + trak.length, 'tkhd')
  if (!tkhd) return null
  const v = await readAt(file, tkhd.body, Math.min(tkhd.length, 32))
  if (v.byteLength < 20) return null
  // version 1 widens creation/modification times from 32 to 64 bits
  return v.getUint8(0) === 1 ? v.getUint32(20) : v.getUint32(12)
}

interface TrakTables {
  timescale: number
  times: number[]   // start time of each sample, in seconds
  offsets: number[]
  sizes: number[]
}

/** Sample offsets, sizes and start times for any track. */
async function readTables(file: Blob, trak: Atom): Promise<TrakTables | null> {
  const mdia = await findChild(file, trak.body, trak.body + trak.length, 'mdia')
  if (!mdia) return null
  const mdhd = await findChild(file, mdia.body, mdia.body + mdia.length, 'mdhd')
  if (!mdhd) return null
  const mv = await readAt(file, mdhd.body, Math.min(mdhd.length, 32))
  const timescale = mv.getUint8(0) === 1 ? mv.getUint32(20) : mv.getUint32(12)
  if (!timescale) return null

  const minf = await findChild(file, mdia.body, mdia.body + mdia.length, 'minf')
  if (!minf) return null
  const stbl = await findChild(file, minf.body, minf.body + minf.length, 'stbl')
  if (!stbl) return null
  const kid = (t: string) => findChild(file, stbl.body, stbl.body + stbl.length, t)

  const sttsA = await kid('stts'); const stszA = await kid('stsz'); const stscA = await kid('stsc')
  if (!sttsA || !stszA || !stscA) return null

  const tv = await readAt(file, sttsA.body, sttsA.length)
  const runs: Array<{ count: number; delta: number }> = []
  const runCount = tv.getUint32(4)
  for (let i = 0; i < runCount && 8 + i * 8 + 8 <= tv.byteLength; i++) {
    runs.push({ count: tv.getUint32(8 + i * 8), delta: tv.getUint32(8 + i * 8 + 4) })
  }

  const zv = await readAt(file, stszA.body, stszA.length)
  const uniform = zv.getUint32(4)
  const count = zv.getUint32(8)
  if (count === 0 || count > MAX_CHAPTERS) return null
  const sizes: number[] = new Array(count)
  if (uniform > 0) sizes.fill(uniform)
  else for (let i = 0; i < count && 12 + i * 4 + 4 <= zv.byteLength; i++) sizes[i] = zv.getUint32(12 + i * 4)

  let chunks: number[] = []
  const stcoA = await kid('stco')
  if (stcoA) {
    const cv = await readAt(file, stcoA.body, stcoA.length)
    const n = cv.getUint32(4)
    for (let i = 0; i < n && 8 + i * 4 + 4 <= cv.byteLength; i++) chunks.push(cv.getUint32(8 + i * 4))
  } else {
    const co64 = await kid('co64')
    if (!co64) return null
    const cv = await readAt(file, co64.body, co64.length)
    const n = cv.getUint32(4)
    for (let i = 0; i < n && 8 + i * 8 + 8 <= cv.byteLength; i++) {
      chunks.push(cv.getUint32(8 + i * 8) * 2 ** 32 + cv.getUint32(8 + i * 8 + 4))
    }
  }

  const sv = await readAt(file, stscA.body, stscA.length)
  const entries: Array<{ first: number; perChunk: number }> = []
  const en = sv.getUint32(4)
  for (let i = 0; i < en && 8 + i * 12 + 12 <= sv.byteLength; i++) {
    entries.push({ first: sv.getUint32(8 + i * 12), perChunk: sv.getUint32(8 + i * 12 + 4) })
  }

  const offsets: number[] = new Array(count)
  let s = 0
  for (let c = 0; c < chunks.length && s < count; c++) {
    let per = entries.length ? entries[0].perChunk : 1
    for (const e of entries) if (e.first <= c + 1) per = e.perChunk
    let at = chunks[c]
    for (let k = 0; k < per && s < count; k++) { offsets[s] = at; at += sizes[s]; s++ }
  }
  if (s < count) { offsets.length = s; sizes.length = s }

  const times: number[] = []
  let ticks = 0
  let i = 0
  for (const run of runs) {
    for (let k = 0; k < run.count && i < offsets.length; k++) {
      times.push(ticks / timescale)
      ticks += run.delta
      i++
    }
  }
  while (times.length < offsets.length) times.push(ticks / timescale)

  return { timescale, times, offsets, sizes }
}

/** Chapters from an Apple text chapter track, or null when there is none. */
export async function readAppleChapters(file: Blob): Promise<EmbeddedChapter[] | null> {
  try {
    const moov = await findPath(file, ['moov'])
    if (!moov) return null

    // collect every trak once: we need the audio one's tref and the text one's id
    const traks: Atom[] = []
    let at = moov.body
    const end = moov.body + moov.length
    while (at < end) {
      const atom = await readHeader(file, at)
      if (!atom) break
      if (atom.type === 'trak') traks.push(atom)
      if (atom.next <= at) break
      at = atom.next
    }
    if (!traks.length) return null

    let wanted: number[] = []
    for (const trak of traks) {
      const ids = await chapterTrackIds(file, trak)
      if (ids.length) { wanted = ids; break }
    }
    if (!wanted.length) return null

    let chapterTrak: Atom | null = null
    for (const trak of traks) {
      const id = await trackId(file, trak)
      if (id !== null && wanted.includes(id)) { chapterTrak = trak; break }
    }
    if (!chapterTrak) return null

    const tables = await readTables(file, chapterTrak)
    if (!tables || !tables.offsets.length) return null

    const out: EmbeddedChapter[] = []
    for (let i = 0; i < tables.offsets.length; i++) {
      const size = tables.sizes[i]
      if (!size || size > 4096) continue
      const v = await readAt(file, tables.offsets[i], size)
      if (v.byteLength < 2) continue
      // a text sample is a uint16 length followed by the string; trailing
      // encoding atoms after it are ignored
      const len = Math.min(v.getUint16(0), v.byteLength - 2)
      const title = decodeTitle(new Uint8Array(v.buffer, v.byteOffset + 2, len))
      out.push({
        title: title || `Chapter ${out.length + 1}`,
        startSec: tables.times[i] ?? 0,
        endSec: null,
      })
    }
    if (!out.length) return null
    out.sort((a, b) => a.startSec - b.startSec)
    return out
  } catch {
    return null
  }
}

const MP4_EXT = /\.(m4b|m4a|mp4|m4p|m4v)$/i
export const isMp4Family = (name: string) => MP4_EXT.test(name)
