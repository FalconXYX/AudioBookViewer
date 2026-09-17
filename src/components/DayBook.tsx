import type { BookWithProgress } from '@/hooks/useLibrary'
import { formatDurationLong } from '@/lib/format'
import { bindingFor, stampDate } from '@/lib/paratext'
import { BookButton } from './BookButton'

interface Props { books: BookWithProgress[]; onOpen: (id: string) => void; onAdd: () => void }
const hrs = (s: number) => Math.round(s / 3600)

export function DayBook({ books, onOpen, onAdd }: Props) {
  const empty = books.length === 0
  const total = books.reduce((n, b) => n + (b.total_duration_sec || 0), 0)
  const heard = books.reduce((n, b) => n + (b.progress?.book_position_sec ?? 0), 0)
  const going = books.filter((b) => b.fractionComplete > 0 && b.fractionComplete < 0.995)
  const cont = [...going].sort((a, b) =>
    (b.progress?.updated_at ?? '').localeCompare(a.progress?.updated_at ?? '')).slice(0, 3)
  const recent = [...books].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)

  return (
    <div className={`daybook${empty ? ' daybook--empty' : ''}`}>
      <div className="daybook__head">
        <span className="folio">{stampDate(new Date().toISOString())}</span>
        <h2>Your shelf</h2>
        <hr className="rule-double" />
        <p className="dropcap">
          {empty
            ? 'Nothing here yet. Point the app at a folder of audio files and it will read the tags and work out the chapters.'
            : `Everything on these shelves is kept where you left it. ${books.length} volumes stand in the case, ${hrs(total)} hours in all, of which ${hrs(heard)} have been heard.`}
        </p>
        {empty && <p style={{ textAlign: 'center' }}>
          <BookButton variant="primary" onClick={onAdd}>Add a book</BookButton></p>}
      </div>

      <div className="ledger">
        <div><span className="sc">Books</span><span className="ledger__v">{books.length}</span></div>
        <div><span className="sc">Total</span><span className="ledger__v">{hrs(total)} h</span></div>
        <div><span className="sc">Listened</span><span className="ledger__v">{hrs(heard)} h</span></div>
        <div><span className="sc">In progress</span><span className="ledger__v">{going.length}</span></div>
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
              <span className="board-cover">
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

