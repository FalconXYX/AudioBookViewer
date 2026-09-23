/**
 * Names, and deciding when two spellings of one are the same name.
 *
 * The reader types an author into a free field, so the same person arrives
 * spelled four ways over a year. These functions exist so the picker offers
 * one entry instead of four. They never rewrite what was typed — the stored
 * string stays exactly as the reader wrote it, and only the key used to
 * compare them is normalised.
 */

/**
 * "J. R. R. Tolkien", "J.R.R. Tolkien", "JRR Tolkien" and "Tolkien, J.R.R."
 * all fold to "jrr tolkien". "Christopher Tolkien" does not.
 */
export function foldName(raw: string): string {
  let s = raw.trim().toLowerCase()
  // "Tolkien, J.R.R." is the same person as "J.R.R. Tolkien", and the inverted
  // form is the one readers meet on a library catalogue page. Only a single
  // comma is treated this way; two means a list, not an inversion.
  const comma = s.indexOf(',')
  if (comma > 0 && s.indexOf(',', comma + 1) === -1) {
    s = `${s.slice(comma + 1).trim()} ${s.slice(0, comma).trim()}`
  }
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '')  // "Émile" -> "Emile"
  s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  // Join runs of initials: "j r r tolkien" -> "jrr tolkien".
  return s.replace(/\b(?:[a-z] )+[a-z]\b/g, (run) => run.replace(/ /g, ''))
}

/**
 * The same job for a TITLE, which is not a name.
 *
 * `foldName` reads a single comma as "Surname, Forename" and swaps the two —
 * right for a person, wrong for a book. It turned "Hollywood, Ending" into
 * "ending hollywood", so it no longer matched "hollywood ending" and the same
 * book was filed under two separate headings.
 */
export function foldTitle(raw: string): string {
  return raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * The distinct values a reader has already used, newest first, for offering
 * back to them. Input order is preserved, so passing a newest-first list of
 * quotes means the most recent spelling of a name is the one offered.
 */
export function distinctByName(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>()
  for (const value of values) {
    const v = value?.trim()
    if (!v) continue
    const key = foldName(v)
    if (key && !seen.has(key)) seen.set(key, v)
  }
  return [...seen.values()]
}

/**
 * The spelling already on file for a name, if there is one.
 *
 * Offering a list of names the reader has used is only half the job: they
 * will still type one out by hand, and "john green" typed in a hurry is a
 * different string from the "John Green" on every earlier quote. Every
 * grouping, count and filter then sees two people.
 *
 * So a typed name that folds to one already in use is stored in the spelling
 * already in use. A name that folds to nothing known is kept exactly as
 * typed — this corrects duplicates, it does not correct the reader.
 */
export function canonicalName(
  typed: string | null | undefined,
  known: string[],
): string | null {
  const v = typed?.trim()
  if (!v) return null
  const key = foldName(v)
  if (!key) return v
  const match = known.find((k) => foldName(k) === key)
  return match ?? v
}
