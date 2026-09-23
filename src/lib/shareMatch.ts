import type { SharedWork } from '@/types'
import { foldName, foldTitle } from './names'

/**
 * Deciding which opened book a quote belongs to.
 *
 * A quote base is keyed by an Open Library work, whose title is the tidy
 * catalogue one: "Hollywood, Ending". The title a quote is filed under is
 * whatever the reader typed, or whatever a folder on their disk was called —
 * "Hollywood Ending", "John Green - Hollywood Ending (Unabridged)". Demanding
 * that those be the same string meant the Share control silently never
 * appeared, which looks exactly like the feature not existing.
 *
 * So the comparison is forgiving in the directions that are safe and strict in
 * the one that is not: a filed title may carry extra words around the work's
 * title, because folder names always do — but a filed title that is merely a
 * fragment of a work's title is only accepted when it is long enough to mean
 * something. Nothing here shares anything; it only decides what to offer.
 */

/** Words an edition or a folder picks up that the work itself has not. */
const EDITION = /\b(?:un)?abridged\b|\baudio ?book\b|\ba novel\b|\bmp3\b|\bm4b\b/g

function tidy(raw: string): string {
  return foldTitle(raw).replace(EDITION, ' ').replace(/\s+/g, ' ').trim()
}

/** Whole words only: "ending" is inside "hollywood ending", "end" is not. */
function holds(hay: string, needle: string): boolean {
  return needle.length > 0 && ` ${hay} `.includes(` ${needle} `)
}

/**
 * How strongly a filed title claims to be this work, or 0 for not at all.
 * Higher wins; the author, when both are known and agree, breaks ties.
 */
function claim(filed: string, work: string): number {
  if (!filed || !work) return 0
  if (filed === work) return 3
  // The usual case: "john green hollywood ending" carries "hollywood ending".
  if (holds(filed, work)) return 2
  // The other way round — a shelf title shortened from the catalogue one.
  // Only when the fragment is substantial, or "Ending" would claim the book.
  const words = filed.split(' ').length
  if (holds(work, filed) && (words >= 2 || filed.length >= 8)) return 1
  return 0
}

/**
 * The opened book a quote appears to be from, or null.
 *
 * `author` is the quote's own author, used only to choose between two works
 * that claim the line equally well. It never creates a match on its own — two
 * books by one writer are still two books.
 */
export function matchWork(
  sourceTitle: string | null | undefined,
  author: string | null | undefined,
  works: readonly SharedWork[],
): SharedWork | null {
  const filed = sourceTitle ? tidy(sourceTitle) : ''
  if (!filed) return null
  const who = author ? foldName(author) : ''

  let best: SharedWork | null = null
  let bestScore = 0
  for (const work of works) {
    const score = claim(filed, tidy(work.title))
    if (score === 0) continue
    const total = score + (who && work.author && foldName(work.author) === who ? 0.5 : 0)
    // A strictly better claim wins; equal claims go to the longer title, which
    // is the more specific of the two.
    if (total > bestScore
      || (total === bestScore && best !== null && work.title.length > best.title.length)) {
      best = work
      bestScore = total
    }
  }
  return best
}
