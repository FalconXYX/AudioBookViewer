import { BookButton } from './BookButton'

interface Props {
  query: string
  onQuery: (q: string) => void
  email: string | undefined
  onSignOut: () => void
  onStats?: () => void
  statsActive?: boolean
  onQuotes?: () => void
  quotesActive?: boolean
  simple?: boolean
  onSimple?: () => void
  /** True in the phone drawer, where these stack instead of sitting in a row. */
  stacked?: boolean
}

/**
 * Search, the two screens, the mode switch and the account.
 *
 * One component, two homes: on a desk these sit in the head bar, and on a
 * phone they move into the shelf drawer, where there is room for them. They
 * are written once so the two never drift apart — and so nothing is quietly
 * dropped from the phone, which is what hiding the head did.
 */
export function NavActions({
  query, onQuery, email, onSignOut, onStats, statsActive,
  onQuotes, quotesActive, simple, onSimple, stacked,
}: Props) {
  return (
    <>
      <label className="head__find">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" />
        </svg>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Find a title or author"
          aria-label="Find on the shelf"
        />
      </label>
      {/* BookView portals its mini transport in here, so playback is reachable
          from the shelf and the add-book flow, not only from BookView. In the
          drawer this stays empty; the phone head keeps its own slot. */}
      {!stacked && <div className="head__pill" id="head-transport" />}
      {onQuotes && (
        <BookButton variant="quotes" size="sm" onClick={onQuotes}
                    openLabel="Opening…" aria-pressed={quotesActive}>Quotes</BookButton>
      )}
      {onStats && (
        <BookButton variant="stats" size="sm" onClick={onStats}
                    openLabel="Opening…" aria-pressed={statsActive}>Statistics</BookButton>
      )}
      {/* role="switch" rather than a pressed button: this turns a mode on and
          off, and a screen reader should say "on"/"off", not "pressed". The
          label is a real element so it is both visible and the accessible
          name, and the state is announced separately in App rather than baked
          into the name — a name that changes as you operate the control is
          disorienting. */}
      {onSimple && (
        <button
          type="button"
          className="simple-switch"
          role="switch"
          aria-checked={!!simple}
          aria-keyshortcuts="l"
          id="simple-mode-switch"
          onClick={onSimple}
        >
          <span className="simple-switch__track" aria-hidden="true">
            <span className="simple-switch__knob" />
          </span>
          <span className="simple-switch__label">Simple mode</span>
        </button>
      )}
      <div className="head__acct">
        <span title={email}>{email}</span>
        <BookButton variant="pamphlet" size="sm" onClick={onSignOut}>
          Sign out
        </BookButton>
      </div>
    </>
  )
}
