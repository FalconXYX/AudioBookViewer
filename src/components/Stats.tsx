import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { BookWithProgress } from '@/hooks/useLibrary'
import type { SettingsState } from '@/hooks/useSettings'
import { recentDays, streak, useListening } from '@/hooks/useListening'
import type { DeviceSource, ListeningDay } from '@/types'
import { formatDurationLong } from '@/lib/format'
import { stampDate } from '@/lib/paratext'
import { supabase } from '@/lib/supabase'
import { getDeviceId } from '@/lib/device'
import { BookButton } from './BookButton'
import logoUrl from '../assets/logo.png'

type Tab = 'overview' | 'days' | 'books' | 'devices' | 'settings'

interface Props {
  user: User
  books: BookWithProgress[]
  settings: SettingsState
  onClose: () => void
  /** Preview harness only: stands in for the synced history. */
  demoDays?: ListeningDay[]
  demoTab?: Tab
}

const TABS: Array<[Tab, string]> = [
  ['overview', 'Overview'], ['days', 'By day'], ['books', 'By book'],
  ['devices', 'Devices'], ['settings', 'Settings'],
]

const hrs = (s: number) => Math.round(s / 3600)
const hm = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} m`)
const WEEKS = 12
const DAY_LABEL = (k: string) =>
  new Date(`${k}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export function Stats({ user, books, settings, onClose, demoDays, demoTab }: Props) {
  const [tab, setTab] = useState<Tab>(demoTab ?? 'overview')
  const [devices, setDevices] = useState<DeviceSource[]>([])
  const live = useListening(user, !demoDays)
  const days = demoDays ?? live.days
  const loading = demoDays ? false : live.loading

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('device_sources').select('*').eq('user_id', user.id)
      setDevices((data ?? []) as DeviceSource[])
    })()
  }, [user.id])

  const byDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of days) m.set(d.day, (m.get(d.day) ?? 0) + d.seconds_listened)
    return m
  }, [days])

  const byBook = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of days) m.set(d.book_id, (m.get(d.book_id) ?? 0) + d.seconds_listened)
    return m
  }, [days])

  const window = useMemo(() => recentDays(WEEKS * 7), [])
  const series = window.map((k) => ({ key: k, seconds: byDay.get(k) ?? 0 }))
  const peak = Math.max(1, ...series.map((p) => p.seconds))
  const windowTotal = series.reduce((n, p) => n + p.seconds, 0)
  const activeDays = series.filter((p) => p.seconds > 0).length
  const run = streak(byDay)
  const best = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0]

  const shelfTotal = books.reduce((n, b) => n + (b.total_duration_sec || 0), 0)
  const finished = books.filter((b) => b.fractionComplete >= 0.995).length
  const going = books.filter((b) => b.fractionComplete > 0 && b.fractionComplete < 0.995)
  const loggedTotal = days.reduce((n, d) => n + d.seconds_listened, 0)

  const thisDevice = getDeviceId()
  const deviceRows = useMemo(() => {
    const m = new Map<string, { label: string; count: number; last: string }>()
    for (const d of devices) {
      const prev = m.get(d.device_id)
      m.set(d.device_id, {
        label: d.device_label,
        count: (prev?.count ?? 0) + 1,
        last: !prev || d.last_verified_at > prev.last ? d.last_verified_at : prev.last,
      })
    }
    return [...m.entries()]
  }, [devices])

  const ranked = [...books].sort(
    (a, b) => (byBook.get(b.id) ?? 0) - (byBook.get(a.id) ?? 0)
      || b.fractionComplete - a.fractionComplete,
  )

  return (
    <div className="stats-screen">
      <header className="stats-screen__bar">
        <span className="stats-screen__mark">
          <img src={logoUrl} alt="" />
          <b>Statistics</b>
        </span>
        <nav className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" className="tabs__tab"
                    aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <BookButton variant="pamphlet" size="sm" onClick={onClose}>Close</BookButton>
      </header>

      <div className="stats-screen__body">
        {tab === 'overview' && (
          <section className="stats-block">
            <div className="tiles">
              <div className="tile"><span className="tile__k">Books</span>
                <span className="tile__v">{books.length}</span>
                <span className="tile__sub">{finished} finished · {going.length} in progress</span></div>
              <div className="tile"><span className="tile__k">On the shelf</span>
                <span className="tile__v">{hrs(shelfTotal)}<em>h</em></span></div>
              <div className="tile"><span className="tile__k">Listened, all time</span>
                <span className="tile__v">{hrs(loggedTotal)}<em>h</em></span>
                <span className="tile__sub">recorded as you played it</span></div>
              <div className="tile"><span className="tile__k">Current streak</span>
                <span className="tile__v">{run}<em>{run === 1 ? 'day' : 'days'}</em></span>
                <span className="tile__sub">{activeDays} active days in {WEEKS} weeks</span></div>
            </div>

            <h3 className="sc sc--ruled">Highlights</h3>
            <ul className="facts">
              <li><span>Busiest day</span>
                <b>{best ? `${DAY_LABEL(best[0])} — ${hm(best[1])}` : 'Nothing recorded yet'}</b></li>
              <li><span>Last {WEEKS} weeks</span><b>{hm(windowTotal)}</b></li>
              <li><span>Typical active day</span>
                <b>{activeDays ? hm(windowTotal / activeDays) : '—'}</b></li>
              <li><span>Most listened</span>
                <b>{ranked[0] && byBook.get(ranked[0].id)
                  ? `${ranked[0].title} — ${hm(byBook.get(ranked[0].id)!)}` : '—'}</b></li>
            </ul>
          </section>
        )}

        {tab === 'days' && (
          <section className="stats-block">
            <h3 className="sc sc--ruled">Last {WEEKS} weeks</h3>
            {loading && <p className="muted">Reading your history…</p>}
            {!loading && windowTotal === 0 && (
              <p className="muted">
                No listening recorded yet. It starts accruing the first time you play a book.
              </p>
            )}
            {windowTotal > 0 && (
              <>
                {/* One series, so one hue and no legend; the heading names it.
                    Only the peak is labelled — a number on every bar is noise. */}
                <div className="daychart" role="img"
                     aria-label={`Daily listening over the last ${WEEKS} weeks`}>
                  {series.map((p) => (
                    <span key={p.key} className="daychart__col"
                          title={`${DAY_LABEL(p.key)} — ${p.seconds ? hm(p.seconds) : 'nothing'}`}>
                      <i style={{ height: `${(p.seconds / peak) * 100}%` }}
                         data-peak={p.seconds === peak && p.seconds > 0 ? '' : undefined} />
                    </span>
                  ))}
                </div>
                <div className="daychart__axis">
                  <span>{DAY_LABEL(series[0].key)}</span>
                  <span className="daychart__peak">peak {hm(peak)}</span>
                  <span>{DAY_LABEL(series[series.length - 1].key)}</span>
                </div>
              </>
            )}
          </section>
        )}

        {tab === 'books' && (
          <section className="stats-block">
            <h3 className="sc sc--ruled">Every book</h3>
            <ul className="meters">
              {ranked.map((b) => {
                const pct = Math.round(b.fractionComplete * 100)
                const logged = byBook.get(b.id) ?? 0
                return (
                  <li key={b.id} title={`${b.title} — ${pct}%, ${formatDurationLong(b.secondsRemaining)} left`}>
                    <span className="meters__name">{b.title}</span>
                    <span className="meters__track"><i style={{ width: `${Math.max(pct, 1)}%` }} /></span>
                    <span className="meters__val num">{pct}%</span>
                    <span className="meters__left num">{logged ? hm(logged) : '—'}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {tab === 'devices' && (
          <section className="stats-block">
            <h3 className="sc sc--ruled">Devices</h3>
            {deviceRows.length === 0
              ? <p className="muted">No devices have been pointed at a folder yet.</p>
              : (
                <ul className="devices">
                  {deviceRows.map(([id, d]) => (
                    <li key={id}>
                      <b>{d.label}{id === thisDevice && <span className="tag">this one</span>}</b>
                      <span className="muted">
                        {d.count} {d.count === 1 ? 'book' : 'books'} set up
                        {stampDate(d.last) ? ` · last used ${stampDate(d.last)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        )}

        {tab === 'settings' && (
          <section className="stats-block">
            <h3 className="sc sc--ruled">Settings</h3>
            <label className="setting">
              <input type="checkbox" checked={settings.settings.autoplay_next}
                     disabled={!settings.loaded}
                     onChange={(e) => void settings.set('autoplay_next', e.target.checked)} />
              <span>
                <b>Play the next chapter automatically</b>
                <span className="muted">
                  When a chapter ends, roll straight into the next one. With this off,
                  playback stops at the start of the next chapter.
                </span>
              </span>
            </label>
          </section>
        )}
      </div>
    </div>
  )
}
