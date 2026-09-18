import type { BookWithProgress } from '@/hooks/useLibrary'

/**
 * THE RULE, stated once: if the datum is missing, omit the row. Never fill it
 * with plausible-looking text. Paratext that is invented is costume — there is
 * no fake Dewey number for a book with no author and no EX LIBRIS with nobody's
 * name in it. Every value below is derived from a field the database holds.
 */
export type Run = 'reading' | 'unopened' | 'finished'

export function runOf(b: BookWithProgress): Run {
  if (b.fractionComplete >= 0.995) return 'finished'
  return b.fractionComplete > 0 ? 'reading' : 'unopened'
}
export const RUN_LABEL: Record<Run, string> = {
  reading: 'Currently reading', unopened: 'Unopened', finished: 'Finished',
}

/** Must equal --binding-count in src/styles/theme.css. */
export const BINDING_COUNT = 9

function hash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13
  return h >>> 0
}
export const bindingFor = (id: string) => `var(--binding-${(hash(id) % BINDING_COUNT) + 1})`
/**
 * Extra board thickness, 0-6px, deterministic per book.
 *
 * This used to be a 32-50px min-height. A spine holds a title and an author
 * and nothing else, so a book that hashed high got up to 20px of dead air
 * under its text while its neighbour sat tight — read as broken spacing
 * rather than as a thicker book. The height now comes from the content, and
 * the thickness is a few pixels of padding on top: enough to give the shelf a
 * rhythm, not enough to look like a mistake.
 */
export const thicknessFor = (id: string) => `${(hash(id) >>> 7) % 7}px`

/** "A 04 / TOL" — a shelfmark, not a classification. It claims nothing it
 *  cannot keep: run letter, position in run, author's surname. */
export function shelfmark(b: BookWithProgress, run: Run, posInRun: number): string {
  const letter = { reading: 'A', unopened: 'B', finished: 'C' }[run]
  const name = b.author ?? b.title
  const surname = name.trim().split(/\s+/).pop() ?? name
  const key = surname.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || '—'
  return `${letter} ${String(posInRun + 1).padStart(2, '0')} / ${key}`
}

/** Position in the library by created_at ascending. Real. */
export function accessionNo(books: BookWithProgress[], id: string): string | null {
  const order = [...books].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const i = order.findIndex((b) => b.id === id)
  return i < 0 ? null : `No. ${String(i + 1).padStart(4, '0')}`
}

/** "14 SEP 2026", or null for a missing or unparseable timestamp. */
export function stampDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  return `${String(d.getDate()).padStart(2, '0')} ${M[d.getMonth()]} ${d.getFullYear()}`
}

export const SOURCE_LABEL: Record<string, string> = {
  multi_file: 'One file per chapter',
  single_file_chapters: 'One file, embedded markers',
  single_file: 'One file, unmarked',
}

