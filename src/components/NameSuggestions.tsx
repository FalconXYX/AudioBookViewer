import { foldName } from '@/lib/names'

interface Props {
  /** Names already on file, newest first. */
  options: string[]
  /** What is in the field right now, so the current one can be marked. */
  value: string
  onPick: (name: string) => void
  /** How many to show before the rest are folded away. */
  max?: number
  label?: string
}

/**
 * The names you have used before, as things you can actually see and press.
 *
 * This started as a `<datalist>`, which was a mistake twice over: it is
 * invisible until you happen to interact with the field in the one right way,
 * and it filters by substring — so a field the composer has already filled
 * with the book's author offers nothing at all, because nothing else contains
 * that text. The whole point is to be shown what you have used, so it is
 * shown.
 *
 * The datalist is still there underneath for typing; this is the part you
 * look at.
 */
export function NameSuggestions({ options, value, onPick, max = 8, label }: Props) {
  if (options.length === 0) return null
  const current = foldName(value)
  // Anything already matching what is typed goes first: after a transcription
  // the field is prefilled, and the one to confirm should not be buried.
  const shown = options.slice(0, max)

  return (
    <div className="namesug">
      <span className="namesug__lead">{label ?? 'Used before'}</span>
      <ul className="namesug__list">
        {shown.map((name) => {
          const picked = current.length > 0 && foldName(name) === current
          return (
            <li key={name}>
              <button
                type="button"
                className="namesug__chip"
                aria-pressed={picked}
                onClick={() => onPick(name)}
              >
                {name}
              </button>
            </li>
          )
        })}
        {options.length > shown.length && (
          <li className="namesug__more">+{options.length - shown.length} more — start typing</li>
        )}
      </ul>
    </div>
  )
}
