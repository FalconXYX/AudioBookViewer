import { findChild, findPath, readAt, readHeader, type Atom } from './mp4Chapters'

/**
 * Enough of an MP4 demuxer to pull ONE window of audio out of a large file.
 *
 * `decodeAudioData` is all-or-nothing: it has no seek, so transcribing thirty
 * seconds of a ten-hour .m4b meant decoding the whole book — 36,000 s at
 * 16 kHz mono in Float32 is 2.3 GB, which killed the tab outright.
 *
 * The sample tables in `moov` say exactly which bytes hold which seconds, so
 * the fix is to read only those bytes and hand them to WebCodecs. The cost
 * becomes proportional to the clip, not to the book.
 */

export interface AudioTrackInfo {
  /** Ticks per second for this track's sample times. */
  timescale: number
  /** e.g. 'mp4a.40.2', built from the ESDS object type + profile. */
  codec: string
  /** AudioSpecificConfig, required by AudioDecoder for AAC. */
  description: Uint8Array | null
  sampleRate: number
  channels: number
  /** Decode time of each sample, run-length encoded as in `stts`. */
  stts: Array<{ count: number; delta: number }>
  /** Byte offset and size of every sample, already flattened. */
  offsets: number[]
  sizes: number[]
}

const u32 = (v: DataView, o: number) => v.getUint32(o)
const u16 = (v: DataView, o: number) => v.getUint16(o)

async function body(file: Blob, atom: Atom): Promise<DataView> {
  return readAt(file, atom.body, atom.length)
}

/** Walk `trak` boxes and return the first whose handler is 'soun'. */
async function findAudioTrak(file: Blob, moov: Atom): Promise<Atom | null> {
  let at = moov.body
  const end = moov.body + moov.length
  while (at < end) {
    const atom = await readHeader(file, at)
    if (!atom) return null
    if (atom.type === 'trak') {
      const hdlr = await findPathIn(file, atom, ['mdia', 'hdlr'])
      if (hdlr) {
        const v = await body(file, hdlr)
        // handler type sits at payload offset 8, past version/flags + predefined
        if (v.byteLength >= 12) {
          const kind = String.fromCharCode(v.getUint8(8), v.getUint8(9), v.getUint8(10), v.getUint8(11))
          if (kind === 'soun') return atom
        }
      }
    }
    if (atom.next <= at) return null
    at = atom.next
  }
  return null
}

/** findPath, but starting inside a container rather than at the file root. */
async function findPathIn(file: Blob, parent: Atom, path: string[]): Promise<Atom | null> {
  let start = parent.body
  let end = parent.body + parent.length
  let found: Atom | null = null
  for (const want of path) {
    found = await findChild(file, start, end, want)
    if (!found) return null
    start = found.body
    end = found.body + found.length
  }
  return found
}

/**
 * Pull the AudioSpecificConfig out of an `esds` descriptor.
 * The descriptor is a nested TLV format with variable-length sizes, so it is
 * walked rather than indexed at fixed offsets.
 */
function parseEsds(v: DataView): { description: Uint8Array | null; objectType: number } {
  let at = 4 // version + flags
  const readLen = (): number => {
    let len = 0
    for (let i = 0; i < 4; i++) {
      const b = v.getUint8(at++)
      len = (len << 7) | (b & 0x7f)
      if (!(b & 0x80)) break
    }
    return len
  }
  let objectType = 0
  // ES_DescrTag
  if (at < v.byteLength && v.getUint8(at) === 0x03) {
    at++
    readLen()
    at += 2 // ES_ID
    const flags = v.getUint8(at++)
    if (flags & 0x80) at += 2
    if (flags & 0x40) at += 1 + v.getUint8(at)
    if (flags & 0x20) at += 2
  }
  // DecoderConfigDescrTag
  if (at < v.byteLength && v.getUint8(at) === 0x04) {
    at++
    readLen()
    objectType = v.getUint8(at)
    // The descriptor is objectType(1) + streamType(1) + bufferSize(3) +
    // maxBitrate(4) + avgBitrate(4) = 13 bytes before the DecSpecificInfo.
    // Muxers disagree about this in practice, so the tag is searched for
    // within a short window rather than indexed at exactly +13: guessing
    // wrong costs the AudioSpecificConfig, and without it AAC will not
    // decode at all.
    const from = at + 13
    for (let probe = from; probe < Math.min(from + 8, v.byteLength); probe++) {
      if (v.getUint8(probe) !== 0x05) continue
      at = probe + 1
      const len = readLen()
      if (len > 0 && at + len <= v.byteLength) {
        return {
          description: new Uint8Array(v.buffer.slice(v.byteOffset + at, v.byteOffset + at + len)),
          objectType,
        }
      }
    }
  }
  return { description: null, objectType }
}

/** Read the sample tables for the file's audio track. */
export async function readAudioTrack(file: Blob): Promise<AudioTrackInfo | null> {
  const moov = await findPath(file, ['moov'])
  if (!moov) return null
  const trak = await findAudioTrak(file, moov)
  if (!trak) return null

  const mdhd = await findPathIn(file, trak, ['mdia', 'mdhd'])
  if (!mdhd) return null
  const mv = await body(file, mdhd)
  const version = mv.getUint8(0)
  const timescale = version === 1 ? u32(mv, 20) : u32(mv, 12)
  if (!timescale) return null

  const stbl = await findPathIn(file, trak, ['mdia', 'minf', 'stbl'])
  if (!stbl) return null

  // --- stsd: codec and decoder config
  const stsd = await findChild(file, stbl.body, stbl.body + stbl.length, 'stsd')
  if (!stsd) return null
  const sv = await body(file, stsd)
  // entry starts after version/flags(4) + entryCount(4), then an 8-byte box header
  let sampleRate = 0
  let channels = 1
  let codec = 'mp4a.40.2'
  let description: Uint8Array | null = null
  if (sv.byteLength >= 8 + 8 + 28) {
    const entryStart = 8
    const fmt = String.fromCharCode(
      sv.getUint8(entryStart + 4), sv.getUint8(entryStart + 5),
      sv.getUint8(entryStart + 6), sv.getUint8(entryStart + 7),
    )
    channels = u16(sv, entryStart + 8 + 16) || 1
    sampleRate = u32(sv, entryStart + 8 + 22) >>> 16 // 16.16 fixed point
    // the esds box follows the 28-byte sound sample description
    const esdsRel = entryStart + 8 + 28
    if (fmt === 'mp4a' && esdsRel + 8 <= sv.byteLength) {
      const esdsSize = u32(sv, esdsRel)
      const esdsType = String.fromCharCode(
        sv.getUint8(esdsRel + 4), sv.getUint8(esdsRel + 5),
        sv.getUint8(esdsRel + 6), sv.getUint8(esdsRel + 7),
      )
      if (esdsType === 'esds' && esdsSize >= 12) {
        const payload = new DataView(
          sv.buffer, sv.byteOffset + esdsRel + 8,
          Math.min(esdsSize - 8, sv.byteLength - esdsRel - 8),
        )
        const parsed = parseEsds(payload)
        description = parsed.description
        if (description && description.length > 0) {
          const profile = description[0] >> 3
          if (profile > 0) codec = `mp4a.40.${profile}`
        }
      }
    }
  }

  // --- stts: decode durations, run-length encoded
  const sttsAtom = await findChild(file, stbl.body, stbl.body + stbl.length, 'stts')
  if (!sttsAtom) return null
  const tv = await body(file, sttsAtom)
  const sttsCount = u32(tv, 4)
  const stts: Array<{ count: number; delta: number }> = []
  for (let i = 0; i < sttsCount && 8 + i * 8 + 8 <= tv.byteLength; i++) {
    stts.push({ count: u32(tv, 8 + i * 8), delta: u32(tv, 8 + i * 8 + 4) })
  }

  // --- stsz: sample sizes
  const stszAtom = await findChild(file, stbl.body, stbl.body + stbl.length, 'stsz')
  if (!stszAtom) return null
  const zv = await body(file, stszAtom)
  const uniform = u32(zv, 4)
  const sampleCount = u32(zv, 8)
  const sizes: number[] = new Array(sampleCount)
  if (uniform > 0) {
    sizes.fill(uniform)
  } else {
    for (let i = 0; i < sampleCount && 12 + i * 4 + 4 <= zv.byteLength; i++) {
      sizes[i] = u32(zv, 12 + i * 4)
    }
  }

  // --- stco / co64: chunk offsets
  let chunkOffsets: number[] = []
  const stco = await findChild(file, stbl.body, stbl.body + stbl.length, 'stco')
  if (stco) {
    const cv = await body(file, stco)
    const n = u32(cv, 4)
    for (let i = 0; i < n && 8 + i * 4 + 4 <= cv.byteLength; i++) chunkOffsets.push(u32(cv, 8 + i * 4))
  } else {
    const co64 = await findChild(file, stbl.body, stbl.body + stbl.length, 'co64')
    if (!co64) return null
    const cv = await body(file, co64)
    const n = u32(cv, 4)
    for (let i = 0; i < n && 8 + i * 8 + 8 <= cv.byteLength; i++) {
      chunkOffsets.push(u32(cv, 8 + i * 8) * 2 ** 32 + u32(cv, 8 + i * 8 + 4))
    }
  }

  // --- stsc: how many samples per chunk, run-length encoded
  const stscAtom = await findChild(file, stbl.body, stbl.body + stbl.length, 'stsc')
  if (!stscAtom) return null
  const cv2 = await body(file, stscAtom)
  const stscCount = u32(cv2, 4)
  const stsc: Array<{ first: number; perChunk: number }> = []
  for (let i = 0; i < stscCount && 8 + i * 12 + 12 <= cv2.byteLength; i++) {
    stsc.push({ first: u32(cv2, 8 + i * 12), perChunk: u32(cv2, 8 + i * 12 + 4) })
  }

  // --- flatten: a byte offset for every sample
  const offsets: number[] = new Array(sampleCount)
  let sample = 0
  for (let c = 0; c < chunkOffsets.length && sample < sampleCount; c++) {
    // the last stsc entry whose first-chunk is <= this chunk (1-based) wins
    let perChunk = stsc.length ? stsc[0].perChunk : 1
    for (const e of stsc) if (e.first <= c + 1) perChunk = e.perChunk
    let at = chunkOffsets[c]
    for (let k = 0; k < perChunk && sample < sampleCount; k++) {
      offsets[sample] = at
      at += sizes[sample]
      sample++
    }
  }
  if (sample < sampleCount) offsets.length = sample

  return { timescale, codec, description, sampleRate: sampleRate || 44100, channels, stts, sizes, offsets }
}

export interface SampleRange {
  first: number
  last: number
  /** Decode time of the first sample, in seconds. */
  startSec: number
  byteStart: number
  byteEnd: number
}

/** Which samples cover [startSec, endSec], and where their bytes live. */
export function sampleRangeFor(
  track: AudioTrackInfo, startSec: number, endSec: number,
): SampleRange | null {
  const n = Math.min(track.offsets.length, track.sizes.length)
  if (n === 0) return null

  let first = -1
  let last = -1
  let firstTime = 0
  let index = 0
  let ticks = 0
  const startTicks = startSec * track.timescale
  const endTicks = endSec * track.timescale

  for (const run of track.stts) {
    for (let i = 0; i < run.count && index < n; i++) {
      const sampleStart = ticks
      const sampleEnd = ticks + run.delta
      if (first === -1 && sampleEnd > startTicks) {
        first = index
        firstTime = sampleStart / track.timescale
      }
      if (sampleStart < endTicks) last = index
      ticks = sampleEnd
      index++
      if (sampleStart >= endTicks) break
    }
    if (last !== -1 && ticks / track.timescale >= endSec) break
  }
  if (first === -1 || last < first) return null

  let byteStart = Infinity
  let byteEnd = 0
  for (let i = first; i <= last && i < n; i++) {
    byteStart = Math.min(byteStart, track.offsets[i])
    byteEnd = Math.max(byteEnd, track.offsets[i] + track.sizes[i])
  }
  return { first, last, startSec: firstTime, byteStart, byteEnd }
}
