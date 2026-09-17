/**
 * "Chapter 2.mp3" must sort before "Chapter 10.mp3". Plain string comparison
 * gets this wrong; a numeric collator gets it right.
 */
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b)
}

export function naturalSortBy<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => naturalCompare(key(a), key(b)))
}
