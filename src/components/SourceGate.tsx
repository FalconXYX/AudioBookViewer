import type { BookSourceState } from '@/hooks/useBookSource'
import { getDeviceLabel } from '@/lib/device'
import { BookButton } from './BookButton'

interface Props {
  source: BookSourceState
  folderLabel: string
}

/**
 * The folder half of the app. The shelf lives in the cloud; the audio does
 * not, so each device has to be pointed at the files once.
 */
export function SourceGate({ source, folderLabel }: Props) {
  if (source.status === 'ready') return null

  if (source.status === 'checking') {
    return <p className="faint" style={{ fontSize: '0.85rem' }}>Looking for the folder on this device…</p>
  }

  return (
    <div className="notice" role="status">
      {source.status === 'needs-permission' && (
        <>
          <p>
            This device knows where <strong>{folderLabel}</strong> is, but the browser needs
            you to allow access again.
          </p>
          <BookButton openLabel="Reconnecting…" onClick={() => void source.reconnect()}>
            Reconnect folder
          </BookButton>
        </>
      )}

      {source.status === 'not-on-this-device' && (
        <>
          <p>
            Not set up on {getDeviceLabel()} yet. Point it at the <strong>{folderLabel}</strong>{' '}
            folder — once per device.
          </p>
          <BookButton openLabel="Opening folder…" onClick={() => void source.attachFolder()}>
            Choose folder
          </BookButton>
        </>
      )}

      {source.status === 'error' && (
        <>
          <p role="alert">{source.error}</p>
          <BookButton openLabel="Opening folder…" onClick={() => void source.attachFolder()}>
            Choose folder
          </BookButton>
        </>
      )}

      {source.error && source.status !== 'error' && (
        <p role="alert" style={{ marginTop: '0.5rem' }}>{source.error}</p>
      )}
    </div>
  )
}
