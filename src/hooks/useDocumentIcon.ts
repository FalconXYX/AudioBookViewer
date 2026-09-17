import { useEffect } from 'react'

/**
 * Swap the browser tab's favicon and title to the book you are listening to,
 * so a pinned tab shows the cover art.
 */
export function useDocumentIcon(iconUrl: string | null, title: string | null): void {
  useEffect(() => {
    const previousTitle = document.title
    if (title) document.title = title

    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    const previousHref = link?.href ?? null
    const created = !link

    if (iconUrl) {
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = iconUrl
    }

    return () => {
      document.title = previousTitle
      if (!link) return
      if (created) link.remove()
      else if (previousHref) link.href = previousHref
    }
  }, [iconUrl, title])
}
