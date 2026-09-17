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
 * Decoding is all-or-nothing per file — `decodeAudioData` has no seek — so a
 * ten-hour single-file audiobook would want gigabytes of PCM. Past this we
 * decline rather than crash the tab, and the caller offers typing instead.
 */
const MAX_DECODE_SEC = 75 * 60

export class TranscribeError extends Error {}

/** One decoded file kept around, because quotes arrive in clusters. */
let cache: { key: string; buffer: AudioBuffer } | null = null

function keyFor(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

/**
 * Decode `file` to 16 kHz mono and return the samples between two times.
 * The AudioContext is constructed at the target rate so the browser resamples
 * during decode; decoding at 44.1 kHz and downsampling afterwards would cost
 * roughly three times the memory for the same result.
 */
export async function decodeClip(
  file: File, startSec: number, endSec: number,
): Promise<Float32Array> {
  const key = keyFor(file)
  let buffer = cache?.key === key ? cache.buffer : null

  if (!buffer) {
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx({ sampleRate: TARGET_RATE })
    try {
      const bytes = await file.arrayBuffer()
      buffer = await ctx.decodeAudioData(bytes)
      if (buffer.duration > MAX_DECODE_SEC) {
        throw new TranscribeError(
          `This file is ${Math.round(buffer.duration / 60)} minutes long, which is too much `
          + 'to decode in the browser in one go. Type the quote instead — the timestamp is '
          + 'saved either way.',
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

  // Average the channels rather than taking the left one: dialogue panned even
  // slightly off-centre comes back quieter from a single channel.
  const out = new Float32Array(to - from)
  const channels = buffer.numberOfChannels
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = from; i < to; i++) out[i - from] += data[i] / channels
  }
  return out
}

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
