import { useEffect } from 'react'

/**
 * Put the book you are listening to in the browser tab's title.
 *
 * This used to swap the favicon for the cover art as well, on the theory that
 * a pinned tab should show the book. In practice it means the site has no
 * identity in the tab strip the moment you open anything — the logo is
 * replaced by a different picture per book, which reads as a bug rather than
 * a feature. The title alone tells you which book the tab is playing, and the
 * favicon stays the site's own mark.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    return () => { document.title = previous }
  }, [title])
}
