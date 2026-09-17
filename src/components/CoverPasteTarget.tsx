import { useCallback, useState } from 'react'
import { imageFromClipboard, urlFromClipboard } from '@/lib/covers'

interface Props {
  currentCoverUrl: string | null
  onImage: (blob: Blob) => Promise<void> | void
  onUrl: (url: string) => Promise<void> | void
}

/** Click to focus, then paste an image or a copied image address. Also accepts a drop. */
export function CoverPasteTarget({ currentCoverUrl, onImage, onUrl }: Props) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handle = useCallback(
    async (data: DataTransfer | null) => {
      const blob = imageFromClipboard(data)
      const url = blob ? null : urlFromClipboard(data)
      if (!blob && !url) {
        setMessage('No image found — copy an image, or use “Copy image address”.')
        return
      }
      setBusy(true)
      setMessage(null)
      try {
        if (blob) await onImage(blob)
        else if (url) await onUrl(url)
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    },
    [onImage, onUrl],
  )

  const paste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    void handle(e.clipboardData)
  }
  const drop = (e: React.DragEvent) => {
    e.preventDefault()
    void handle(e.dataTransfer)
  }

  return (
    <div>
      {currentCoverUrl ? (
        <img
          className="cover"
          src={currentCoverUrl}
          alt="Cover art"
          tabIndex={0}
          onPaste={paste}
          onDragOver={(e) => e.preventDefault()}
          onDrop={drop}
        />
      ) : (
        <div
          className="cover cover--empty"
          role="button"
          tabIndex={0}
          aria-label="Add cover art"
          onPaste={paste}
          onDragOver={(e) => e.preventDefault()}
          onDrop={drop}
        >
          {busy ? 'Uploading…' : 'Click, then paste cover'}
        </div>
      )}
      {message && <p className="faint" role="alert" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>{message}</p>}
    </div>
  )
}
