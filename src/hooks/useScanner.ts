import { useCallback, useState } from 'react'
import type { ScanProgress, ScannedBook } from '@/types'
import { pickBookFolder, scanBookFolder } from '@/lib/scanner'

export interface ScanResult {
  scanned: ScannedBook
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
  /** Edit the scan before saving it (fix a wrong title, drop a chapter, ...). */
  patchResult: (patch: Partial<ScannedBook>) => void
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
      const scanned = await scanBookFolder(handle, setProgress)
      setResult({ scanned, handle })
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

  const patchResult = useCallback((patch: Partial<ScannedBook>) => {
    setResult((prev) => (prev ? { ...prev, scanned: { ...prev.scanned, ...patch } } : prev))
  }, [])

  return { scanning, progress, result, error, scan, reset, patchResult }
}
