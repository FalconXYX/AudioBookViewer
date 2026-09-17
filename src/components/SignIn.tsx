import { BookButton } from './BookButton'
import logoUrl from '../assets/logo.png'

interface Props {
  onSignIn: () => void
  loading: boolean
  error: string | null
  onDismissError: () => void
}

export function SignIn({ onSignIn, loading, error, onDismissError }: Props) {
  return (
    <div className="scrim">
      <div className="borrower" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <img src={logoUrl} alt="" className="borrower__logo" />
        <h1 id="signin-title">Audiobook Viewer</h1>
        <p>
          Your shelf and your place in every book, on any machine you sign in from.
        </p>

        {error && (
          <div className="alert" role="alert">
            <strong>Sign-in failed</strong>
            <p>{error}</p>
            <BookButton variant="pamphlet" size="sm" onClick={onDismissError}>Dismiss</BookButton>
          </div>
        )}

        <BookButton variant="primary" openLabel="Signing in…" onClick={onSignIn} disabled={loading}>
          {loading ? 'Loading…' : 'Sign in with Google'}
        </BookButton>

      </div>
    </div>
  )
}
