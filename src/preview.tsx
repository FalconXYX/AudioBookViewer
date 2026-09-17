/* TEMPORARY design preview — mock data, no Supabase. Delete with preview.html. */
import { createRoot } from 'react-dom/client'
import type { Book, Chapter } from '@/types'
import type { BookWithProgress } from '@/hooks/useLibrary'
import type { PlayerState } from '@/hooks/usePlayer'
import { Apparatus } from '@/components/Apparatus'
import { BookButton } from '@/components/BookButton'
import { ChapterList } from '@/components/ChapterList'
import { DayBook } from '@/components/DayBook'
import { Head } from '@/components/Head'
import { NowPlaying } from '@/components/NowPlaying'
import { Footer } from '@/components/Footer'
import { Shelf } from '@/components/Shelf'
import { Stats } from '@/components/Stats'
import type { ListeningDay } from '@/types'
import { Transport } from '@/components/Transport'
import { formatDurationLong } from '@/lib/format'
import { stampDate, SOURCE_LABEL } from '@/lib/paratext'
import './styles/theme.css'
import './styles/base.css'
import './styles/app.css'

const mk = (
  id: string, title: string, author: string | null, hrs: number, frac: number, created: string,
): BookWithProgress => ({
  id, user_id: 'u', title, author, cover_url: null,
  source_kind: 'multi_file', folder_label: title,
  total_duration_sec: hrs * 3600, created_at: created, updated_at: created,
  progress: {
    book_id: id, user_id: 'u', chapter_idx: 2,
    position_sec: 742, book_position_sec: hrs * 3600 * frac,
    updated_at: '2026-09-16T21:04:00.000Z',
  },
  fractionComplete: frac,
  secondsRemaining: hrs * 3600 * (1 - frac),
})

/* Real uuids: the binding is chosen by hashing the id, and short fake ids
   collide onto one slot and make the case look monochrome. */
const books = [
  mk('7c9e6679-7425-40de-944b-e07fc1f90ae7', 'The Name of the Wind', 'Patrick Rothfuss', 27.5, 0.42, '2026-09-01T10:00:00Z'),
  mk('16fd2706-8baf-433b-82eb-8c7fada847da', 'Piranesi', 'Susanna Clarke', 6.7, 0.88, '2026-09-03T10:00:00Z'),
  mk('3f333df6-90a4-4fda-8dd3-9485d27cee36', 'Project Hail Mary', 'Andy Weir', 16.1, 0, '2026-09-05T10:00:00Z'),
  mk('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'The Left Hand of Darkness', 'Ursula K. Le Guin', 9.9, 0.15, '2026-09-07T10:00:00Z'),
  mk('9c5b94b1-35ad-49bb-b118-8e8fc24abf80', 'Gödel, Escher, Bach', 'Douglas Hofstadter', 31.2, 0.06, '2026-09-09T10:00:00Z'),
  mk('d9428888-122b-11e1-b85c-61cd3cbb3210', 'The Dispossessed', 'Ursula K. Le Guin', 12.4, 1, '2026-09-11T10:00:00Z'),
  mk('c106a26a-21bb-5538-8bf2-57095d1976c1', 'Never Let Me Go', 'Kazuo Ishiguro', 9.2, 0.33, '2026-09-13T10:00:00Z'),
  mk('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Ancillary Justice', 'Ann Leckie', 11.8, 0, '2026-09-14T10:00:00Z'),
]
const book = books[0]

const chapters: Chapter[] = [
  'A Place for Demons', 'A Beautiful Day', 'Wood and Word', 'Halfway to Newarre',
  'Notes', 'The Price of Remembering', 'Of Beginnings and the Names of Things',
  'The Broken Road', 'Interlude — Flesh and Blood',
].map((title, i) => ({
  id: `c${i}`, book_id: book.id, user_id: 'u', idx: i, title,
  file_name: `${String(i + 1).padStart(2, '0')}.mp3`,
  start_sec: 0, end_sec: null, duration_sec: 1200 + i * 320, book_offset_sec: i * 1500,
}))

const player = {
  chapterIdx: 2, chapter: chapters[2], isPlaying: true, isLoading: false, error: null,
  positionInChapter: 742, chapterDuration: 1840, chapterRemaining: 1098,
  bookPosition: 41_700, bookDuration: 99_000, bookRemaining: 57_300, playbackRate: 1.5,
  play: async () => {}, pause: () => {}, togglePlay: async () => {},
  goToChapter: async () => {}, nextChapter: async () => {}, prevChapter: async () => {},
  seekInChapter: async () => {}, seekInBook: async () => {}, skip: async () => {},
  skipBack: async () => {}, skipForward: async () => {},
  setPlaybackRate: () => {}, nudgeRate: () => {},
} satisfies PlayerState

const noop = () => {}
const params = new URLSearchParams(location.search)
const view = params.get('view') ?? 'daybook'
const tab = (params.get('tab') ?? 'overview') as never

/* A plausible 12 weeks of listening, so the chart can actually be looked at.
   Deterministic — no Math.random, or every screenshot would differ. */
const demoDays: ListeningDay[] = (() => {
  const out: ListeningDay[] = []
  const today = new Date()
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const dow = d.getDay()
    const wave = Math.sin(i / 6) * 0.5 + 0.5
    const weekend = dow === 0 || dow === 6 ? 1.7 : 1
    const seconds = Math.round(wave * 2600 * weekend * ((i * 37) % 11 > 2 ? 1 : 0))
    if (seconds > 0) {
      out.push({
        user_id: 'u', book_id: books[i % books.length].id,
        day: d.toLocaleDateString('en-CA'),
        seconds_listened: seconds, updated_at: d.toISOString(),
      })
    }
  }
  return out
})()

function Chrome({ children, openBook, shelf = books }:
  { children: React.ReactNode; openBook?: BookWithProgress; shelf?: BookWithProgress[] }) {
  return (
    <div className="shell">
      <Head
        books={shelf} openBook={openBook} where={openBook ? 'Chapter 3 of 9' : null}
        query="" onQuery={noop} email="parth@plato.so" onSignOut={noop}
        onStats={noop}
      />
      <Shelf books={shelf} loading={false} selectedId={openBook?.id ?? null} query=""
             onSelect={noop} onAdd={noop} />
      <main className="desk">
        {children}
        <Footer />
      </main>
    </div>
  )
}

function Page() {
  const added = stampDate(book.created_at)
  const pct = book.fractionComplete * 100
  return (
    <section className="page">
      <div className="endpaper m-marble" aria-hidden="true" />
      <div className="page__inner">
        <div className="title-board">
          <div className="board-cover"><span className="cover--empty" /></div>
          <div className="title-board__body">
            <h2>{book.title}</h2>
            <hr className="rule-double rule-double--gilt" />
            <p className="title-board__by">{book.author}</p>
            <div className="plate">
              <div className="plate__accession">
                {added && <span>Added <b>{added}</b></span>}
                <span>{chapters.length} files</span>
                <span>{SOURCE_LABEL[book.source_kind]}</span>
                <span>{book.folder_label}</span>
              </div>
            </div>
            <div className="gauge" style={{ ['--pct' as string]: `${pct}%` }} aria-hidden="true">
              <span className="gauge__gilt" />
              {chapters.map((c) => (
                <span key={c.id}
                  className={`gauge__tick${c.idx === player.chapterIdx ? ' gauge__tick--now' : ''}`}
                  style={{ left: `${(c.book_offset_sec / book.total_duration_sec) * 100}%` }} />
              ))}
            </div>
            <div className="gauge__legend">
              <span>Chapter <b className="num">3</b> of <b className="num">{chapters.length}</b></span>
              <i className="leader" aria-hidden="true" />
              <span className="num">{Math.round(pct)}% · {formatDurationLong(book.secondsRemaining)} left</span>
            </div>
            <BookButton variant="primary">Resume listening</BookButton>
          </div>
        </div>
        <div className="spread">
          <ChapterList chapters={chapters} currentIdx={2} bookTitle={book.title}
            fraction={book.fractionComplete} markedIdx={new Set([4])}
            onSelect={noop} onToggleMark={noop} disabled={false} />
          <Apparatus book={book} chapters={chapters}
            accession={null} chapterIdx={2} />
        </div>
        <p className="colophon">
          {chapters.length} files · {formatDurationLong(book.total_duration_sec)} · {book.folder_label}<br />
          <BookButton variant="pamphlet" size="sm">Remove from shelf</BookButton>
        </p>
      </div>
    </section>
  )
}

function Buttons() {
  const states = [
    ['closed (idle)', undefined],
    ['riffling', 'riffling'],
    ['open', 'open'],
  ] as const
  return (
    <div style={{ padding: '3rem', display: 'grid', gap: '2rem', justifyItems: 'start' }}>
      {states.map(([label, ph]) => (
        <div key={label} style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <span className="faint" style={{ width: '8rem', fontSize: '.75rem' }}>{label}</span>
          <BookButton phaseOverride={ph}>Add a book</BookButton>
          <BookButton variant="primary" phaseOverride={ph}>Resume listening</BookButton>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
        <span className="faint" style={{ width: '8rem', fontSize: '.75rem' }}>other</span>
        <BookButton variant="pamphlet" size="sm">Sign out</BookButton>
        <BookButton size="sm">Small</BookButton>
        <BookButton disabled>Unavailable</BookButton>
      </div>
      <Transport player={player} disabled={false} onRibbon={noop} />
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(
  view === 'immersive'
    ? <NowPlaying book={book as Book} player={player} chapterCount={chapters.length}
        onExit={noop} onRibbon={noop} />
  : view === 'stats' ? <Chrome><Stats
        user={{ id: 'u' } as never}
        books={books}
        settings={{ settings: { autoplay_next: true }, loaded: true, set: async () => {} }}
        onClose={noop} demoDays={demoDays} demoTab={tab}
      /></Chrome>
  : view === 'empty' ? <Chrome shelf={[]}><DayBook books={[]} onOpen={noop} onAdd={noop} /></Chrome>
  : view === 'btn'  ? <Chrome><Buttons /></Chrome>
  : view === 'book' ? <Chrome openBook={book}><Page /></Chrome>
  : <Chrome><DayBook books={books} onOpen={noop} onAdd={noop} /></Chrome>,
)
