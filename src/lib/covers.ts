import { COVERS_BUCKET, supabase } from './supabase'

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

/** Pull an image out of a paste event, if the clipboard held one. */
export function imageFromClipboard(data: DataTransfer | null): Blob | null {
  if (!data) return null
  for (const item of data.items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}

/** Pull an http(s) URL out of a paste event — covers "copy image address". */
export function urlFromClipboard(data: DataTransfer | null): string | null {
  const text = data?.getData('text/plain')?.trim()
  if (!text) return null
  return /^https?:\/\/\S+$/i.test(text) ? text : null
}

/**
 * Re-encode to JPEG and cap the long edge. Embedded audiobook art is
 * occasionally 3000px square, which is wasteful for a grid of thumbnails.
 */
export async function normalizeCover(blob: Blob, maxEdge = 800): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))

  if (scale === 1 && blob.type === 'image/jpeg') {
    bitmap.close()
    return blob
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return blob
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const out = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.88),
  )
  return out ?? blob
}

/** Upload cover art and return its public URL. Path: <user_id>/<book_id>.<ext> */
export async function uploadCover(
  userId: string,
  bookId: string,
  blob: Blob,
): Promise<string> {
  const normalized = await normalizeCover(blob)
  const ext = EXT_BY_MIME[normalized.type] ?? 'jpg'
  const path = `${userId}/${bookId}.${ext}`

  const { error } = await supabase.storage
    .from(COVERS_BUCKET)
    .upload(path, normalized, { upsert: true, contentType: normalized.type })

  if (error) throw error

  const { data } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(path)
  // Cache-bust so a replaced cover shows immediately.
  return `${data.publicUrl}?v=${Date.now()}`
}

/**
 * Take a pasted remote URL and store it as our own cover. Falls back to
 * referencing the remote URL directly when the host blocks cross-origin reads.
 */
export async function adoptRemoteCover(
  userId: string,
  bookId: string,
  url: string,
): Promise<string> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) throw new Error('Not an image')
    return await uploadCover(userId, bookId, blob)
  } catch {
    return url
  }
}
