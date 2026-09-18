import { isMp4Family } from './mp4Chapters'
import { readAudioTrack, sampleRangeFor } from './mp4Samples'

/**
 * Local speech-to-text for quote capture.
 *
 * Nothing leaves the machine: the model is fetched once from the CDN and
 * cached by the browser, and the audio is decoded from the file the user
 * already picked. That is the whole reason for doing it in WASM rather than
 * calling a speech API — the app's standing rule is that the audio files are
 * never uploaded.
 */

/** Whisper is trained on 16 kHz mono and resamples anything else anyway. */
const TARGET_RATE = 16000

/**
 * Ceiling on decoded PCM for the whole-file path, in samples.
 * 16 kHz mono Float32 is 64 KB per second, so 200 MB is a little under an
 * hour — comfortably more than any single chapter and far less than a tab
 * can be asked to allocate in one go.
 */
const MAX_PCM_SAMPLES = 200e6 / 4

export class TranscribeError extends Error {}

/** One decoded file kept around, because quotes arrive in clusters. */
let cache: { key: string; buffer: AudioBuffer } | null = null

function keyFor(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

/** Mix to mono and resample by linear interpolation. Good enough for speech. */
function toMono16k(planes: Float32Array[], fromRate: number): Float32Array {
  const channels = planes.length
  const ratio = fromRate / TARGET_RATE
  const outLen = Math.max(0, Math.floor(planes[0].length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const at = i * ratio
    const i0 = Math.floor(at)
    const i1 = Math.min(i0 + 1, planes[0].length - 1)
    const t = at - i0
    let sum = 0
    for (let c = 0; c < channels; c++) sum += planes[c][i0] * (1 - t) + planes[c][i1] * t
    out[i] = sum / channels
  }
  return out
}

/**
 * Decode ONLY the requested window out of an MP4 / M4A / M4B.
 *
 * The sample tables say which bytes hold which seconds, so the clip's samples
 * are read and handed to WebCodecs directly. Everything else in the file is
 * never touched — which is the whole point, because decoding a ten-hour m4b in
 * one go wants 2.3 GB and takes the tab with it.
 */
async function decodeMp4Window(
  file: File, startSec: number, endSec: number,
): Promise<Float32Array | null> {
  if (typeof AudioDecoder === 'undefined') return null
  const track = await readAudioTrack(file)
  if (!track || !track.offsets.length) return null

  const range = sampleRangeFor(track, startSec, endSec)
  if (!range) return null

  const support = await AudioDecoder.isConfigSupported({
    codec: track.codec,
    sampleRate: track.sampleRate,
    numberOfChannels: track.channels,
    description: track.description ?? undefined,
  }).catch(() => null)
  if (!support?.supported) return null

  const bytes = new Uint8Array(
    await file.slice(range.byteStart, range.byteEnd).arrayBuffer(),
  )

  const planes: Float32Array[][] = []
  let outRate = track.sampleRate
  let failed: Error | null = null

  const decoder = new AudioDecoder({
    output: (data) => {
      outRate = data.sampleRate
      const frame: Float32Array[] = []
      for (let c = 0; c < data.numberOfChannels; c++) {
        const buf = new Float32Array(data.numberOfFrames)
        data.copyTo(buf, { planeIndex: c, format: 'f32-planar' })
        frame.push(buf)
      }
      planes.push(frame)
      data.close()
    },
    error: (e) => { failed = e instanceof Error ? e : new Error(String(e)) },
  })
  decoder.configure({
    codec: track.codec,
    sampleRate: track.sampleRate,
    numberOfChannels: track.channels,
    description: track.description ?? undefined,
  })

  // Timestamps only need to be monotonic within a single decode run.
  let ts = 0
  for (let i = range.first; i <= range.last; i++) {
    const at = track.offsets[i] - range.byteStart
    const size = track.sizes[i]
    if (at < 0 || at + size > bytes.length) continue
    decoder.decode(new EncodedAudioChunk({
      type: 'key',                       // every AAC frame is independently decodable
      timestamp: ts,
      data: bytes.subarray(at, at + size),
    }))
    ts += Math.round((1e6 * 1024) / track.sampleRate)
  }
  await decoder.flush()
  decoder.close()
  if (failed) throw failed
  if (!planes.length) return null

  const channels = planes[0].length
  const total = planes.reduce((n, f) => n + f[0].length, 0)
  const joined: Float32Array[] = []
  for (let c = 0; c < channels; c++) {
    const merged = new Float32Array(total)
    let at = 0
    for (const frame of planes) { merged.set(frame[c] ?? frame[0], at); at += frame[0].length }
    joined.push(merged)
  }

  const mono = toMono16k(joined, outRate)
  // Trim the lead-in: decoding starts at a frame boundary before the window.
  const lead = Math.max(0, Math.floor((startSec - range.startSec) * TARGET_RATE))
  const want = Math.max(0, Math.floor((endSec - startSec) * TARGET_RATE))
  return mono.subarray(lead, Math.min(mono.length, lead + want))
}

/**
 * Decode `file` to 16 kHz mono and return the samples between two times.
 *
 * MP4-family files take the windowed path above. Anything else is decoded
 * whole, which is fine for the one-file-per-chapter layout but is refused
 * outright past the memory ceiling — the check now happens BEFORE the
 * allocation rather than after it, which is why a long book used to take the
 * whole tab down instead of showing a message.
 */
export async function decodeClip(
  file: File, startSec: number, endSec: number,
): Promise<Float32Array> {
  if (endSec <= startSec) throw new TranscribeError('That clip is empty.')

  if (isMp4Family(file.name)) {
    try {
      const windowed = await decodeMp4Window(file, startSec, endSec)
      if (windowed && windowed.length > 0) return windowed
    } catch {
      // fall through to the whole-file path, which may still be within budget
    }
  }

  const key = keyFor(file)
  let buffer = cache?.key === key ? cache.buffer : null

  if (!buffer) {
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx({ sampleRate: TARGET_RATE })
    try {
      const bytes = await file.arrayBuffer()
      buffer = await ctx.decodeAudioData(bytes)
      if (buffer.length > MAX_PCM_SAMPLES) {
        cache = null
        throw new TranscribeError(
          `This file is ${Math.round(buffer.duration / 60)} minutes long, which is more than `
          + 'can be decoded in one go. Type the quote instead — the timestamp is saved either way.',
        )
      }
      cache = { key, buffer }
    } catch (e) {
      if (e instanceof TranscribeError) throw e
      throw new TranscribeError(
        'This file could not be decoded for transcription. Type the quote instead.',
      )
    } finally {
      void ctx.close()
    }
  }

  const rate = buffer.sampleRate
  const from = Math.max(0, Math.floor(startSec * rate))
  const to = Math.min(buffer.length, Math.ceil(endSec * rate))
  if (to <= from) throw new TranscribeError('That clip is empty.')

  const out = new Float32Array(to - from)
  const channels = buffer.numberOfChannels
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = from; i < to; i++) out[i - from] += data[i] / channels
  }
  return out
}

/** Drop the cached PCM — a decoded chapter can be a hundred megabytes. */
export function releaseDecodeCache() { cache = null }

type Pipe = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text: string }>
let pipe: Promise<Pipe> | null = null

export interface LoadProgress {
  /** 0–1 across the model download, or null before the size is known. */
  ratio: number | null
  file: string
}

/**
 * Load the recogniser once and keep it. The import is dynamic so the ~1 MB of
 * WASM glue is not in the main bundle for the many sessions that never
 * transcribe anything.
 */
async function recogniser(onProgress?: (p: LoadProgress) => void): Promise<Pipe> {
  if (!pipe) {
    pipe = (async () => {
      const tf = await import('@xenova/transformers')
      // The models come from the CDN; there is no local model directory to try
      // first, and letting it try produces a 404 on every load.
      tf.env.allowLocalModels = false
      return (await tf.pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en', {
        progress_callback: (p: { status: string; progress?: number; file?: string }) => {
          if (p.status === 'progress') {
            onProgress?.({ ratio: typeof p.progress === 'number' ? p.progress / 100 : null, file: p.file ?? '' })
          }
        },
      })) as unknown as Pipe
    })()
    // A failed load must not be cached, or every later attempt returns the
    // same rejected promise and the button appears permanently broken.
    pipe.catch(() => { pipe = null })
  }
  return pipe
}

/** True once the model is in memory, so the UI can stop warning about a download. */
export const modelReady = () => pipe !== null

export async function transcribe(
  samples: Float32Array, onProgress?: (p: LoadProgress) => void,
): Promise<string> {
  const run = await recogniser(onProgress)
  const out = await run(samples, { chunk_length_s: 30, stride_length_s: 5 })
  return (out.text ?? '').trim()
}
