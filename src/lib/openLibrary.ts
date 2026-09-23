/**
 * Looking a book up by the number on the back of it.
 *
 * This is the one place in the app that talks to a service that is not
 * Supabase, so the rules are tighter than usual:
 *
 *   - It is never called on its own. Every request is a button press, so the
 *     reader decides what leaves the machine and when. Nothing here runs while
 *     you type.
 *   - What leaves is an ISBN or a title, and nothing else. No account, no
 *     address, no identifier of any kind. Open Library gets a number; it does
 *     not get a reader.
 *   - A failure is never fatal. Every path returns null and the quote saves
 *     without it, because the lookup is a convenience and the words are not.
 *
 * Open Library's `search.json` is the endpoint used because it is the only one
 * that actually works from a page with no server behind it: it answers with
 * `access-control-allow-origin: *` and needs no key. Its two older siblings do
 * not — `/api/books?bibkeys=` returns 404 and `/isbn/{n}.json` answers with a
 * redirect.
 */

/** Only the fields we use, so the reply stays small on a phone connection. */
const FIELDS = 'key,title,author_name,first_publish_year,number_of_pages_median,cover_i,edition_count'

const ENDPOINT = 'https://openlibrary.org/search.json'

/** Long enough for a slow train, short enough to not look frozen. */
const TIMEOUT_MS = 8000

export interface FoundBook {
  /**
   * Open Library's work key, e.g. "/works/OL45345712W" — stable across
   * editions and across people, and therefore the thing a shared quote base
   * is keyed on. Two readers holding the same paperback arrive here
   * independently; two readers typing its title do not.
   */
  workKey: string | null
  title: string
  author: string | null
  year: number | null
  pages: number | null
  /** Open Library's cover id; the image URL is built from it where it is shown. */
  coverId: number | null
}

/** Digits only, so "978-0-261-10325-2" and "978 0261103252" both work. */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, '').toUpperCase()
}

/**
 * A mistyped ISBN that still looks like one is worse than no ISBN at all: it
 * silently points at a different book. Both check digits are cheap, so both
 * are verified rather than matching on shape.
 */
export function isValidIsbn(raw: string): boolean {
  const s = normalizeIsbn(raw)
  if (s.length === 10) {
    let sum = 0
    for (let i = 0; i < 9; i++) {
      const d = s.charCodeAt(i) - 48
      if (d < 0 || d > 9) return false
      sum += (10 - i) * d
    }
    const last = s[9] === 'X' ? 10 : s.charCodeAt(9) - 48
    if (last < 0 || last > 10) return false
    return (sum + last) % 11 === 0
  }
  if (s.length === 13) {
    if (!/^\d{13}$/.test(s)) return false
    let sum = 0
    for (let i = 0; i < 12; i++) sum += (s.charCodeAt(i) - 48) * (i % 2 ? 3 : 1)
    return (10 - (sum % 10)) % 10 === s.charCodeAt(12) - 48
  }
  return false
}

/** True for something the reader plainly meant as a number, not a title. */
export function looksLikeIsbn(raw: string): boolean {
  const s = normalizeIsbn(raw)
  return (s.length === 10 || s.length === 13) && /^[0-9]+[0-9X]$/.test(s)
}

interface SearchDoc {
  key?: string
  title?: string
  author_name?: string[]
  first_publish_year?: number
  number_of_pages_median?: number
  cover_i?: number
  edition_count?: number
}

function toFound(doc: SearchDoc): FoundBook | null {
  if (!doc.title) return null
  return {
    workKey: doc.key ?? null,
    title: doc.title,
    author: doc.author_name?.[0] ?? null,
    year: doc.first_publish_year ?? null,
    pages: doc.number_of_pages_median ?? null,
    coverId: doc.cover_i ?? null,
  }
}

async function search(query: string, limit: number): Promise<SearchDoc[]> {
  const url = `${ENDPOINT}?q=${encodeURIComponent(query)}&limit=${limit}&fields=${FIELDS}`
  // AbortSignal.timeout is not in Safari before 16, and this is the one file
  // that will be run on a phone, so the controller is wired by hand.
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: stop.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return []
    const body = (await res.json()) as { docs?: SearchDoc[] }
    return body.docs ?? []
  } catch {
    // Offline, blocked, timed out, or answering with something that is not
    // JSON. None of them are worth distinguishing to a reader holding a book.
    return []
  } finally {
    clearTimeout(timer)
  }
}

/** One book, by its number. Null when the number is wrong or unknown there. */
export async function lookupIsbn(raw: string): Promise<FoundBook | null> {
  const isbn = normalizeIsbn(raw)
  if (!isValidIsbn(isbn)) return null
  const docs = await search(`isbn:${isbn}`, 1)
  return docs[0] ? toFound(docs[0]) : null
}

/** Open Library's query syntax treats these as operators. */
function escapeQuery(raw: string): string {
  return raw.replace(/[:"()[\]{}^~*?\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Lowercase, unpunctuated, single-spaced — for comparing two titles. */
function fold(raw: string): string {
  return raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * How well a result answers what was actually typed.
 *
 * Open Library ranks by how well known a book is, not by how well it matches,
 * which is why a new release loses to every older book sharing its title.
 * "hollywood ending" put John Green's 2026 novel SIXTH, behind a 1999 Nora
 * Roberts book that does not have those words in its title at all. So the
 * order the API returns is treated as a suggestion and the list is re-sorted
 * on the two things the reader can see: does the title match, and is it by
 * the author they named.
 */
function score(doc: SearchDoc, title: string, author: string): number {
  const t = fold(doc.title ?? '')
  const q = fold(title)
  let n = 0
  if (t === q) n += 100
  else if (t.startsWith(q)) n += 60
  else if (t.includes(q)) n += 40
  else if (q.split(' ').every((w) => t.includes(w))) n += 20

  if (author) {
    const a = fold(author)
    const names = (doc.author_name ?? []).map(fold)
    if (names.some((x) => x === a)) n += 40
    else if (names.some((x) => x.includes(a) || a.includes(x))) n += 25
  }

  // Nothing else belongs in here. Completeness and recency are tiebreaks and
  // live in the comparator: folding them into the score let a "+1 because it
  // has a cover image" outrank being twenty years more recent, which is how a
  // 2023 book beat the 2026 one the reader was actually holding.
  return n
}

/**
 * One row per book, not one per edition.
 *
 * The same novel exists in Open Library many times over — different printings,
 * different ISBNs, sometimes duplicate work records — and a picker offering
 * "Hollywood, Ending" four times is worse than useless. Records are collapsed
 * on title-and-author, and the fullest one survives.
 */
function dedupe(docs: SearchDoc[]): SearchDoc[] {
  const best = new Map<string, SearchDoc>()
  for (const d of docs) {
    if (!d.title) continue
    const key = `${fold(d.title)}|${fold((d.author_name ?? [])[0] ?? '')}`
    const prev = best.get(key)
    if (!prev) { best.set(key, d); continue }
    // Keep whichever record says more. An edition count breaks a genuine tie:
    // the record with more printings behind it is the canonical one.
    const rank = (x: SearchDoc) =>
      (x.first_publish_year ? 4 : 0) + (x.cover_i ? 2 : 0)
      + (x.number_of_pages_median ? 1 : 0)
    const r = rank(d) - rank(prev)
    if (r > 0 || (r === 0 && (d.edition_count ?? 0) > (prev.edition_count ?? 0))) {
      best.set(key, d)
    }
  }
  return [...best.values()]
}

/**
 * Candidates by title, narrowed by an author when one is known.
 *
 * Deliberately over-fetches and then sorts locally: see `score`. The reader
 * sees a handful, but the handful is chosen here rather than by whatever the
 * API felt was most famous.
 */
export async function lookupTitle(
  title: string,
  author?: string | null,
  limit = 6,
): Promise<FoundBook[]> {
  const t = escapeQuery(title)
  if (t.length < 3) return []
  const a = escapeQuery(author ?? '')

  // A wide net, because the right answer was coming back sixth.
  const WIDE = 40
  const queries = a
    ? [`title:(${t}) author:(${a})`, `title:(${t})`]
    : [`title:(${t})`, t]

  const seen: SearchDoc[] = []
  for (const q of queries) {
    seen.push(...(await search(q, WIDE)))
    // Enough distinct books to choose from; no need for the second request.
    if (dedupe(seen).length >= limit) break
  }

  return dedupe(seen)
    .map((d) => ({ d, n: score(d, t, a) }))
    .filter((x) => x.n > 0)
    // Relevance first, then the newest. Six different books are called
    // exactly "Hollywood Ending" and they all match a typed title equally
    // well, so relevance alone leaves the order to chance — and a book
    // published this year, the one you are most likely to be holding, lands
    // wherever the API happened to put it. Year only ever breaks a tie, so
    // it can never outrank actually being the right book.
    .sort((x, y) =>
      // Relevance, then the newest, then the fullest record, then the most
      // reprinted. Strictly ordered, so a later key can never overturn an
      // earlier one.
      y.n - x.n
      || (y.d.first_publish_year ?? 0) - (x.d.first_publish_year ?? 0)
      || (y.d.cover_i ? 1 : 0) - (x.d.cover_i ? 1 : 0)
      || (y.d.edition_count ?? 0) - (x.d.edition_count ?? 0))
    .slice(0, limit)
    .map((x) => toFound(x.d))
    .filter((b): b is FoundBook => b !== null)
}

/** Open Library's cover image, at the size the composer shows. */
export function coverUrl(coverId: number, size: 'S' | 'M' | 'L' = 'M'): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`
}
