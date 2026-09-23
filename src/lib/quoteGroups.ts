import type { Quote } from '@/types'
import { foldName, foldTitle } from './names'

/**
 * Where a quote came from, and how the commonplace book is arranged.
 *
 * A quote has a source whether or not the shelf knows about it. Two lines
 * kept from the same paperback belong together under that book's name, the
 * same as two kept from an audiobook — the shelf is how you play something,
 * not what makes it a book. Filing them under "From elsewhere" because no
 * audio folder happens to exist put the same book in two different places
 * depending on how it was read.
 *
 * So "From elsewhere" now means only what it says: a line with no source at
 * all — overheard, remembered, unattributed.
 */

/** A source that quotes are grouped under. */
export interface QuoteSource {
  /** Stable identity: a book id, or a folded title for anything off-shelf. */
  key: string
  title: string
  /** Set when this is a book on the shelf, so it can be opened. */
  bookId: string | null
  quotes: Quote[]
}

export interface Grouped {
  sources: QuoteSource[]
  /** Quotes with no source named at all. */
  loose: Quote[]
}

export type SortOrder = 'newest' | 'oldest' | 'title' | 'author' | 'longest'

/**
 * The title a quote is filed under, or null when it names no source.
 *
 * Off-shelf quotes keep their source in `quoted_author`; see LooseQuoteForm
 * and QuoteList, which read the same column the same way.
 */
export function sourceTitleOf(q: Quote, titleOf: (id: string) => string): string | null {
  if (q.book_id) return titleOf(q.book_id)
  const s = q.quoted_author?.trim()
  return s || null
}

/** Group by source, shelf and paper alike, in the given order. */
export function groupQuotes(
  quotes: Quote[],
  titleOf: (id: string) => string,
  order: SortOrder = 'newest',
): Grouped {
  const byKey = new Map<string, QuoteSource>()
  const loose: Quote[] = []

  for (const q of quotes) {
    const title = sourceTitleOf(q, titleOf)
    if (!title) { loose.push(q); continue }
    // A shelf book keys on its id so two books may share a title; anything
    // else keys on the folded title, which is what makes "hollywood ending"
    // and "Hollywood, Ending" one shelf instead of two. foldTitle, not
    // foldName — the latter reads that comma as "Surname, Forename".
    const key = q.book_id ?? `t:${foldTitle(title)}`
    const found = byKey.get(key)
    if (found) found.quotes.push(q)
    else byKey.set(key, { key, title, bookId: q.book_id, quotes: [q] })
  }

  const sources = [...byKey.values()]
  for (const s of sources) s.quotes = sortQuotes(s.quotes, order)
  sortSources(sources, order)
  return { sources, loose: sortQuotes(loose, order) }
}

function timeOf(q: Quote): number {
  const t = Date.parse(String(q.created_at))
  return Number.isNaN(t) ? 0 : t
}

/** Newest-first by default; within one book, in the order they are said. */
export function sortQuotes(quotes: Quote[], order: SortOrder): Quote[] {
  const out = [...quotes]
  switch (order) {
    case 'oldest': return out.sort((a, b) => timeOf(a) - timeOf(b))
    case 'longest': return out.sort((a, b) => b.text.length - a.text.length)
    case 'author':
      return out.sort((a, b) =>
        foldName(a.author ?? '').localeCompare(foldName(b.author ?? ''))
        || timeOf(b) - timeOf(a))
    case 'title':
      // Inside a book, reading order beats anything else.
      return out.sort((a, b) =>
        (a.chapter_idx ?? 0) - (b.chapter_idx ?? 0)
        || (a.position_sec ?? 0) - (b.position_sec ?? 0)
        || timeOf(b) - timeOf(a))
    case 'newest':
    default: return out.sort((a, b) => timeOf(b) - timeOf(a))
  }
}

function sortSources(sources: QuoteSource[], order: SortOrder): void {
  if (order === 'title') {
    sources.sort((a, b) => a.title.localeCompare(b.title))
    return
  }
  if (order === 'oldest') {
    sources.sort((a, b) =>
      Math.min(...a.quotes.map(timeOf)) - Math.min(...b.quotes.map(timeOf)))
    return
  }
  // Everything else: the book you kept something from most recently, first.
  sources.sort((a, b) =>
    Math.max(...b.quotes.map(timeOf)) - Math.max(...a.quotes.map(timeOf)))
}

export interface Facet {
  key: string
  label: string
  count: number
}

/**
 * The books and the authors actually present, with counts, for browsing by.
 *
 * Built from the quotes themselves rather than from the shelf, so a paperback
 * you have never added appears beside the audiobooks you have.
 */
export function facetsOf(quotes: Quote[], titleOf: (id: string) => string) {
  const books = new Map<string, Facet>()
  const authors = new Map<string, Facet>()

  for (const q of quotes) {
    const title = sourceTitleOf(q, titleOf)
    if (title) {
      const key = q.book_id ?? `t:${foldTitle(title)}`
      const f = books.get(key)
      if (f) f.count++
      else books.set(key, { key, label: title, count: 1 })
    }
    const a = q.author?.trim()
    if (a) {
      const key = foldName(a)
      const f = authors.get(key)
      if (f) f.count++
      else authors.set(key, { key, label: a, count: 1 })
    }
  }

  const byCount = (x: Facet, y: Facet) => y.count - x.count || x.label.localeCompare(y.label)
  return {
    books: [...books.values()].sort(byCount),
    authors: [...authors.values()].sort(byCount),
  }
}

/** Narrow to one book and/or one author. Empty selections mean everything. */
export function applyFacets(
  quotes: Quote[],
  titleOf: (id: string) => string,
  bookKey: string | null,
  authorKey: string | null,
): Quote[] {
  return quotes.filter((q) => {
    if (bookKey) {
      const title = sourceTitleOf(q, titleOf)
      const key = q.book_id ?? (title ? `t:${foldTitle(title)}` : null)
      if (key !== bookKey) return false
    }
    if (authorKey && foldName(q.author ?? '') !== authorKey) return false
    return true
  })
}
