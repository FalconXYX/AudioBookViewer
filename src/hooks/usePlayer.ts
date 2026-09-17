import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Book, Chapter } from '@/types'

const RATE_STORAGE_KEY = 'abv.playbackRate'
/** Treat "within this many seconds of the boundary" as having reached it. */
const BOUNDARY_EPSILON = 0.25
/** Skip a seek entirely if we are already close enough; avoids an audible glitch. */
const SEEK_EPSILON = 0.5

export interface PlayerOptions {
  book: Book | null
  chapters: Chapter[]
  /** Resolves a chapter's file_name to a File. From useBookSource. */
  getFile: (relativePath: string) => Promise<File>
  /** Whether the folder is connected; the player stays idle until true. */
  enabled: boolean
  /** Applied once, when chapters first load. */
  initialChapterIdx?: number
  initialPositionSec?: number
  skipBackSec?: number
  skipForwardSec?: number
  /** When false, playback stops at the end of a chapter instead of rolling on. */
  autoplayNext?: boolean
}

export interface PlayerState {
  chapterIdx: number
  chapter: Chapter | null
  isPlaying: boolean
  isLoading: boolean
  error: string | null

  /** Seconds into the current chapter. */
  positionInChapter: number
  chapterDuration: number
  chapterRemaining: number

  /** Seconds from the start of the book. */
  bookPosition: number
  bookDuration: number
  bookRemaining: number

  playbackRate: number

  play: () => Promise<void>
  pause: () => void
  togglePlay: () => Promise<void>
  goToChapter: (idx: number, positionSec?: number, autoplay?: boolean) => Promise<void>
  nextChapter: () => Promise<void>
  prevChapter: () => Promise<void>
  seekInChapter: (positionSec: number) => Promise<void>
  seekInBook: (absoluteSec: number) => Promise<void>
  skip: (deltaSec: number) => Promise<void>
  skipBack: () => Promise<void>
  skipForward: () => Promise<void>
  setPlaybackRate: (rate: number) => void
  nudgeRate: (delta: number) => void
}

function readStoredRate(): number {
  const raw = Number(localStorage.getItem(RATE_STORAGE_KEY))
  return Number.isFinite(raw) && raw >= 0.5 && raw <= 4 ? raw : 1
}

/** Effective end of a chapter inside its file. */
function chapterEnd(chapter: Chapter, fileDuration: number): number {
  return chapter.end_sec ?? (fileDuration > 0 ? fileDuration : Infinity)
}

export function usePlayer(options: PlayerOptions): PlayerState {
  const {
    book,
    chapters,
    getFile,
    enabled,
    initialChapterIdx = 0,
    initialPositionSec = 0,
    skipBackSec = 10,
    skipForwardSec = 10,
    autoplayNext = true,
  } = options

  const audioRef = useRef<HTMLAudioElement | null>(null)
  if (audioRef.current === null && typeof Audio !== 'undefined') {
    const el = new Audio()
    el.preload = 'metadata'
    // Keep voices sounding human at 1.5x+ rather than chipmunked.
    el.preservesPitch = true
    audioRef.current = el
  }

  /** file_name currently attached to the audio element, if any. */
  const loadedFileRef = useRef<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const chapterIdxRef = useRef(0)
  const appliedInitialRef = useRef(false)
  /**
   * Guards the async chapter advance. timeupdate fires roughly every 250ms, so
   * without this a second tick arrives before goToChapter has moved
   * chapterIdxRef and advances again — silently skipping a chapter.
   */
  const advancingRef = useRef(false)

  const [chapterIdx, setChapterIdx] = useState(0)
  const [positionInChapter, setPositionInChapter] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playbackRate, setRateState] = useState<number>(readStoredRate)

  // Keep a ref in sync so event handlers registered once still see the truth.
  chapterIdxRef.current = chapterIdx
  const chaptersRef = useRef(chapters)
  chaptersRef.current = chapters
  const autoplayNextRef = useRef(autoplayNext)
  autoplayNextRef.current = autoplayNext

  const chapter = chapters[chapterIdx] ?? null
  const bookDuration = book?.total_duration_sec ?? 0

  const chapterDuration = useMemo(() => {
    if (!chapter) return 0
    if (chapter.duration_sec > 0) return chapter.duration_sec
    const audio = audioRef.current
    if (audio && Number.isFinite(audio.duration)) {
      return Math.max(0, chapterEnd(chapter, audio.duration) - chapter.start_sec)
    }
    return 0
  }, [chapter, isLoading])

  const bookPosition = (chapter?.book_offset_sec ?? 0) + positionInChapter

  // -------------------------------------------------------------------------
  // Loading and seeking
  // -------------------------------------------------------------------------

  /** Attach a chapter's file to the element, reusing it when already loaded. */
  const ensureFileLoaded = useCallback(
    async (target: Chapter): Promise<HTMLAudioElement> => {
      const audio = audioRef.current
      if (!audio) throw new Error('Audio is not available in this environment.')

      if (loadedFileRef.current === target.file_name) return audio

      const file = await getFile(target.file_name)
      const url = URL.createObjectURL(file)

      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = url
      loadedFileRef.current = target.file_name
      audio.src = url

      await new Promise<void>((resolve, reject) => {
        const onReady = () => {
          cleanup()
          resolve()
        }
        const onError = () => {
          cleanup()
          reject(new Error(`Could not decode "${target.file_name}".`))
        }
        const cleanup = () => {
          audio.removeEventListener('loadedmetadata', onReady)
          audio.removeEventListener('error', onError)
        }
        audio.addEventListener('loadedmetadata', onReady)
        audio.addEventListener('error', onError)
        audio.load()
      })

      audio.playbackRate = playbackRate
      return audio
    },
    [getFile, playbackRate],
  )

  const goToChapter = useCallback(
    async (idx: number, positionSec = 0, autoplay?: boolean) => {
      const list = chaptersRef.current
      const clampedIdx = Math.max(0, Math.min(idx, list.length - 1))
      const target = list[clampedIdx]
      if (!target) return

      const shouldPlay = autoplay ?? !audioRef.current?.paused
      setIsLoading(true)
      setError(null)
      try {
        const audio = await ensureFileLoaded(target)
        const seekTo = target.start_sec + Math.max(0, positionSec)

        // For a single file with embedded chapters, crossing a boundary lands
        // us almost exactly on target already — seeking would glitch the audio.
        if (Math.abs(audio.currentTime - seekTo) > SEEK_EPSILON) {
          audio.currentTime = seekTo
        }

        setChapterIdx(clampedIdx)
        chapterIdxRef.current = clampedIdx
        setPositionInChapter(Math.max(0, positionSec))

        if (shouldPlay) await audio.play()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setIsPlaying(false)
      } finally {
        setIsLoading(false)
      }
    },
    [ensureFileLoaded],
  )

  const advanceChapter = useCallback(async () => {
    if (advancingRef.current) return
    advancingRef.current = true
    try {
      const list = chaptersRef.current
      const next = chapterIdxRef.current + 1
      if (next < list.length && autoplayNextRef.current) {
        await goToChapter(next, 0, true)
      } else if (next < list.length) {
        // Autoplay off: park at the head of the next chapter, paused.
        await goToChapter(next, 0, false)
        audioRef.current?.pause()
        setIsPlaying(false)
      } else {
        audioRef.current?.pause()
        setIsPlaying(false)
      }
    } finally {
      advancingRef.current = false
    }
  }, [goToChapter])

  // -------------------------------------------------------------------------
  // Element events
  // -------------------------------------------------------------------------
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      const list = chaptersRef.current
      const current = list[chapterIdxRef.current]
      if (!current) return

      const end = chapterEnd(current, audio.duration)
      // A chapter that ends inside a longer file needs its boundary policed
      // here; the element's own "ended" only fires at end of file.
      if (Number.isFinite(end) && audio.currentTime >= end - BOUNDARY_EPSILON) {
        void advanceChapter()
        return
      }
      setPositionInChapter(Math.max(0, audio.currentTime - current.start_sec))
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => void advanceChapter()
    const onWaiting = () => setIsLoading(true)
    const onPlaying = () => setIsLoading(false)

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('playing', onPlaying)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('playing', onPlaying)
    }
  }, [advanceChapter])

  // Tear down when the book changes, and on unmount, so a switched book never
  // keeps the previous file attached or leaks its object URL.
  useEffect(() => {
    appliedInitialRef.current = false
    advancingRef.current = false
    loadedFileRef.current = null
    setChapterIdx(0)
    setPositionInChapter(0)
    setIsPlaying(false)
    setError(null)

    const audio = audioRef.current
    return () => {
      audio?.pause()
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      audio?.removeAttribute('src')
      audio?.load()
      loadedFileRef.current = null
    }
  }, [book?.id])

  // Apply saved progress once, as soon as the folder is connected and the
  // chapter list has arrived.
  useEffect(() => {
    if (appliedInitialRef.current) return
    if (!enabled || chapters.length === 0) return
    appliedInitialRef.current = true
    void goToChapter(initialChapterIdx, initialPositionSec, false)
  }, [enabled, chapters.length, initialChapterIdx, initialPositionSec, goToChapter])

  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------

  const play = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    try {
      if (!loadedFileRef.current) {
        await goToChapter(chapterIdxRef.current, positionInChapter, true)
        return
      }
      await audio.play()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [goToChapter, positionInChapter])

  const pause = useCallback(() => {
    audioRef.current?.pause()
  }, [])

  const togglePlay = useCallback(async () => {
    if (audioRef.current?.paused === false) pause()
    else await play()
  }, [play, pause])

  const seekInChapter = useCallback(
    async (positionSec: number) => {
      const current = chaptersRef.current[chapterIdxRef.current]
      if (!current) return
      const audio = audioRef.current
      if (!audio || loadedFileRef.current !== current.file_name) {
        await goToChapter(chapterIdxRef.current, positionSec)
        return
      }
      const max = chapterDuration > 0 ? chapterDuration : Infinity
      const clamped = Math.max(0, Math.min(positionSec, max))
      audio.currentTime = current.start_sec + clamped
      setPositionInChapter(clamped)
    },
    [goToChapter, chapterDuration],
  )

  /**
   * Seek by absolute book position. Everything that can cross a chapter
   * boundary routes through here, so boundary handling lives in one place.
   */
  const seekInBook = useCallback(
    async (absoluteSec: number) => {
      const list = chaptersRef.current
      if (list.length === 0) return

      const target = Math.max(0, Math.min(absoluteSec, bookDuration || Infinity))
      let idx = list.findIndex(
        (c) => target >= c.book_offset_sec && target < c.book_offset_sec + c.duration_sec,
      )
      if (idx === -1) idx = target <= 0 ? 0 : list.length - 1

      await goToChapter(idx, target - list[idx].book_offset_sec)
    },
    [bookDuration, goToChapter],
  )

  const skip = useCallback(
    async (deltaSec: number) => {
      const list = chaptersRef.current
      const current = list[chapterIdxRef.current]
      if (!current) return
      const audio = audioRef.current
      const pos = audio ? audio.currentTime - current.start_sec : positionInChapter
      await seekInBook(current.book_offset_sec + pos + deltaSec)
    },
    [seekInBook, positionInChapter],
  )

  const skipBack = useCallback(() => skip(-skipBackSec), [skip, skipBackSec])
  const skipForward = useCallback(() => skip(skipForwardSec), [skip, skipForwardSec])
  const nextChapter = useCallback(() => goToChapter(chapterIdxRef.current + 1, 0), [goToChapter])
  const prevChapter = useCallback(() => goToChapter(chapterIdxRef.current - 1, 0), [goToChapter])

  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.max(0.5, Math.min(4, Number(rate.toFixed(2))))
    setRateState(clamped)
    localStorage.setItem(RATE_STORAGE_KEY, String(clamped))
    if (audioRef.current) audioRef.current.playbackRate = clamped
  }, [])

  const nudgeRate = useCallback(
    (delta: number) => setPlaybackRate(playbackRate + delta),
    [playbackRate, setPlaybackRate],
  )

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate
  }, [playbackRate])

  // -------------------------------------------------------------------------
  // OS media keys / lock screen controls
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!('mediaSession' in navigator) || !book || !chapter) return
    const ms = navigator.mediaSession

    ms.metadata = new MediaMetadata({
      title: chapter.title,
      artist: book.author ?? '',
      album: book.title,
      artwork: book.cover_url ? [{ src: book.cover_url }] : [],
    })
    ms.playbackState = isPlaying ? 'playing' : 'paused'

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => void play()],
      ['pause', () => pause()],
      ['seekbackward', () => void skipBack()],
      ['seekforward', () => void skipForward()],
      ['previoustrack', () => void prevChapter()],
      ['nexttrack', () => void nextChapter()],
    ]
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler)
      } catch {
        // Not every action is supported in every browser; ignore the rest.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null)
        } catch {
          /* ignore */
        }
      }
    }
  }, [book, chapter, isPlaying, play, pause, skipBack, skipForward, prevChapter, nextChapter])

  return {
    chapterIdx,
    chapter,
    isPlaying,
    isLoading,
    error,
    positionInChapter,
    chapterDuration,
    chapterRemaining: Math.max(0, chapterDuration - positionInChapter),
    bookPosition,
    bookDuration,
    bookRemaining: Math.max(0, bookDuration - bookPosition),
    playbackRate,
    play,
    pause,
    togglePlay,
    goToChapter,
    nextChapter,
    prevChapter,
    seekInChapter,
    seekInBook,
    skip,
    skipBack,
    skipForward,
    setPlaybackRate,
    nudgeRate,
  }
}
