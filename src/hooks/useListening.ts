import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { ListeningDay } from '@/types'
import { supabase } from '@/lib/supabase'

export interface ListeningState {
  days: ListeningDay[]
  loading: boolean
}

export function useListening(user: User | null, enabled: boolean): ListeningState {
  const [days, setDays] = useState<ListeningDay[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user || !enabled) return
    let active = true
    setLoading(true)
    void (async () => {
      const { data } = await supabase
        .from('listening_days').select('*').eq('user_id', user.id).order('day')
      if (!active) return
      setDays((data ?? []) as ListeningDay[])
      setLoading(false)
    })()
    return () => { active = false }
  }, [user, enabled])

  return { days, loading }
}

/** YYYY-MM-DD for a Date, in local time. */
export const dayKey = (d: Date) => d.toLocaleDateString('en-CA')

/** The last `n` days, oldest first, as local day keys. */
export function recentDays(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d)
    x.setDate(d.getDate() - i)
    out.push(dayKey(x))
  }
  return out
}

/** Consecutive days ending today (or yesterday) with any listening at all. */
export function streak(byDay: Map<string, number>): number {
  let n = 0
  const d = new Date()
  if (!byDay.get(dayKey(d))) d.setDate(d.getDate() - 1) // today may not have started
  for (;;) {
    if (!byDay.get(dayKey(d))) return n
    n++
    d.setDate(d.getDate() - 1)
  }
}
