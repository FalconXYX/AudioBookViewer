import { useCallback, useState } from 'react'
import type { ScanProgress, ScannedBook } from '@/types'
import { pickBookFolder, scanBooksInFolder } from '@/lib/scanner'

export interface ScanResult {
  /** One entry per book found. A folder of .m4b files yields several. */
  books: ScannedBook[]
  handle: FileSystemDirectoryHandle
}

export interface ScannerState {
  scanning: boolean
  progress: ScanProgress | null
  result: ScanResult | null
  error: string | null
  /** Opens the folder picker and scans. Call from a click handler. */
  scan: () => Promise<void>
  reset: () => void
  /** Edit one of the found books before saving (fix a wrong title, ...). */
  patchBook: (index: number, patch: Partial<ScannedBook>) => void
  /** Drop a book from the set before saving — a folder can turn up strays. */
  dropBook: (index: number) => void
}

export function useScanner(): ScannerState {
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scan = useCallback(async () => {
    setError(null)
    setResult(null)
    try {
      const handle = await pickBookFolder()
      if (!handle) return // picker dismissed

      setScanning(true)
      setProgress(null)
      const books = await scanBooksInFolder(handle, setProgress)
      setResult({ books, handle })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setScanning(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setProgress(null)
    setError(null)
  }, [])

  const patchBook = useCallback((index: number, patch: Partial<ScannedBook>) => {
    setResult((prev) => prev
      ? { ...prev, books: prev.books.map((b, i) => (i === index ? { ...b, ...patch } : b)) }
      : prev)
  }, [])

  const dropBook = useCallback((index: number) => {
    setResult((prev) => prev
      ? { ...prev, books: prev.books.filter((_, i) => i !== index) }
      : prev)
  }, [])

  return { scanning, progress, result, error, scan, reset, patchBook, dropBook }
}
