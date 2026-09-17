export interface OAuthError {
  error: string
  code: string | null
  description: string | null
}

function parse(params: URLSearchParams): OAuthError | null {
  const error = params.get('error')
  if (!error) return null
  return {
    error,
    code: params.get('error_code'),
    description: params.get('error_description'),
  }
}

/**
 * When an OAuth round trip fails, Supabase redirects back with the reason in
 * the URL — in the query string *and*, double-encoded, in the hash fragment.
 *
 * This is captured synchronously at module load because supabase-js is
 * configured with `detectSessionInUrl`, and it strips the hash as soon as it
 * has inspected it. Reading this any later is a race we would usually lose,
 * which is exactly how a failed sign-in ends up looking like nothing happened.
 */
export const initialOAuthError: OAuthError | null = (() => {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '')
  // Prefer the query string: the hash copy is double-encoded.
  return parse(new URLSearchParams(window.location.search)) ?? parse(new URLSearchParams(hash))
})()

/** Drop the error from the address bar so a refresh does not resurrect it. */
export function clearOAuthErrorFromUrl(): void {
  if (typeof window === 'undefined') return
  if (!window.location.search && !window.location.hash) return
  window.history.replaceState({}, '', window.location.pathname)
}

/** Human-readable summary, with the likely cause where we can infer one. */
export function describeOAuthError(err: OAuthError): string {
  const detail = err.description ?? err.error
  if (/unable to exchange external code/i.test(detail)) {
    return (
      `${detail}\n\n` +
      'Google issued an authorization code, but Supabase could not trade it for ' +
      'tokens. That exchange only uses the client ID and client secret, so the ' +
      'credentials stored in Supabase do not match the ones in Google Cloud ' +
      'Console — most often a stale, mistyped, or whitespace-padded client secret.'
    )
  }
  return detail
}
