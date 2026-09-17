import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { UserSettings } from '@/types'
import { supabase } from '@/lib/supabase'

const DEFAULTS: Omit<UserSettings, 'user_id' | 'updated_at'> = {
  autoplay_next: true,
}

export interface SettingsState {
  settings: typeof DEFAULTS
  loaded: boolean
  set: <K extends keyof typeof DEFAULTS>(key: K, value: (typeof DEFAULTS)[K]) => Promise<void>
}

/**
 * Preferences live in Postgres rather than localStorage so they follow you
 * between machines, which is the whole premise of the app.
 */
export function useSettings(user: User | null): SettingsState {
  const [settings, setSettings] = useState(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    if (!user) { setSettings(DEFAULTS); setLoaded(true); return }

    void (async () => {
      const { data } = await supabase
        .from('user_settings').select('*').eq('user_id', user.id).maybeSingle()
      if (!active) return
      const row = data as UserSettings | null
      if (row) setSettings({ autoplay_next: row.autoplay_next })
      setLoaded(true)
    })()

    return () => { active = false }
  }, [user])

  const set = useCallback(
    async <K extends keyof typeof DEFAULTS>(key: K, value: (typeof DEFAULTS)[K]) => {
      if (!user) return
      // Optimistic: a toggle that lags behind the pointer feels broken.
      setSettings((prev) => ({ ...prev, [key]: value }))
      const next = { ...settings, [key]: value }
      const { error } = await supabase.from('user_settings').upsert(
        { user_id: user.id, ...next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      if (error) setSettings((prev) => ({ ...prev, [key]: !value as never }))
    },
    [user, settings],
  )

  return { settings, loaded, set }
}
