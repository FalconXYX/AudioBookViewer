import type { BookWithProgress } from '@/hooks/useLibrary'
import { formatDurationLong } from '@/lib/format'
import { bindingFor, stampDate } from '@/lib/paratext'
import { BookButton } from './BookButton'

interface Props { books: BookWithProgress[]; onOpen: (id: string) => void; onAdd: () => void }

export function DayBook({ books, onOpen, onAdd }: Props) {
  const empty = books.length === 0
  const going = books.filter((b) => b.fractionComplete > 0 && b.fractionComplete < 0.995)
  const cont = [...going].sort((a, b) =>
    (b.progress?.updated_at ?? '').localeCompare(a.progress?.updated_at ?? '')).slice(0, 3)

  // Ask the one question the screen exists to answer.
  const last = cont[0]
  const greeting = empty
    ? 'Nothing here yet. Point the app at a folder of audio files and it will read the tags and work out the chapters.'
    : last
      ? `Ready to pick up ${last.title} where you left it, or would you rather start something new?`
      : 'Nothing open at the moment. Take something down off the shelf, or add a book to it.'
  const recent = [...books].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)

  return (
    <div className={`daybook${empty ? ' daybook--empty' : ''}`}>
      <div className="daybook__head">
        <span className="folio">{stampDate(new Date().toISOString())}</span>
        <h2>Your shelf</h2>
        <hr className="rule-double" />
        <p className="dropcap">{greeting}</p>
        {empty && <p style={{ textAlign: 'center' }}>
          <BookButton variant="primary" openLabel="Opening folder…" onClick={onAdd}>Add a book</BookButton></p>}
      </div>

      {cont.length > 0 && (<>
        <h3 className="sc sc--ruled">Continue</h3>
        <div className="continue">
          {cont.map((b) => (
            <button key={b.id} type="button" className="pulled" onClick={() => onOpen(b.id)}
                    style={{ ['--spine-tint' as string]: bindingFor(b.id) }}>
              {b.cover_url ? <img src={b.cover_url} alt="" /> : <span aria-hidden="true" />}
              <span>
                <span className="pulled__title">{b.title}</span>
                <span className="pulled__where">{Math.round(b.fractionComplete * 100)}% · {formatDurationLong(b.secondsRemaining)} left</span>
              </span>
              <span className="pulled__when">{stampDate(b.progress?.updated_at) ?? ''}</span>
            </button>
          ))}
        </div>
      </>)}

      {recent.length > 0 && (<>
        <h3 className="sc sc--ruled">Recently added</h3>
        <div className="accessions">
          {recent.map((b) => (
            <button key={b.id} type="button" className="accession" onClick={() => onOpen(b.id)}>
              <span className="board-cover"
                    style={{ ['--spine-tint' as string]: bindingFor(b.id) }}>
                {b.cover_url ? <img src={b.cover_url} alt="" />
                             : <span className="cover--empty" aria-hidden="true" />}
              </span>
              <b>{b.title}</b>
              
            </button>
          ))}
        </div>
      </>)}
    </div>
  )
}

