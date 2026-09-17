import { useCallback, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  clearOAuthErrorFromUrl,
  describeOAuthError,
  initialOAuthError,
} from '@/lib/oauthError'

export interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  /** A failed sign-in, whether it threw locally or came back in the URL. */
  error: string | null
  clearError: () => void
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  // Seeded from the redirect URL, so a provider-side failure is visible on the
  // very first render instead of silently dropping the user back to sign-in.
  const [error, setError] = useState<string | null>(
    initialOAuthError ? describeOAuthError(initialOAuthError) : null,
  )

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setError(null)
    clearOAuthErrorFromUrl()
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    // Callers invoke this from a click handler, so throwing here would become
    // an unhandled rejection and the button would look inert.
    if (err) setError(err.message)
  }, [])

  const signOut = useCallback(async () => {
    const { error: err } = await supabase.auth.signOut()
    if (err) setError(err.message)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
    clearOAuthErrorFromUrl()
  }, [])

  return {
    session,
    user: session?.user ?? null,
    loading,
    error,
    clearError,
    signInWithGoogle,
    signOut,
  }
}
