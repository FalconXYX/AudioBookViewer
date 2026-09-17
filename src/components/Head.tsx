import type { BookWithProgress } from "@/hooks/useLibrary";
import { BookButton } from "./BookButton";
import logoUrl from "../assets/logo.png";

interface Props {
  books: BookWithProgress[];
  openBook: BookWithProgress | undefined;
  where: string | null; // e.g. 'Chapter 7 of 38'
  query: string;
  onQuery: (q: string) => void;
  email: string | undefined;
  onSignOut: () => void;
  onStats?: () => void;
  statsActive?: boolean;
  onHome?: () => void;
}
const hours = (sec: number) => Math.round(sec / 3600);

export function Head({
  books,
  openBook,
  where,
  query,
  onQuery,
  email,
  onSignOut,
  onStats,
  statsActive,
  onHome,
}: Props) {
  const total = books.reduce((n, b) => n + (b.total_duration_sec || 0), 0);
  const heard = books.reduce(
    (n, b) => n + (b.progress?.book_position_sec ?? 0),
    0,
  );
  return (
    <header className="head">
      <div className="head__mark">
        <img src={logoUrl} alt="" className="head__logo" />
        <b>Audiobook Viewer</b>
      </div>
      {/* the running head: the strongest 'you are inside a book' signal there
          is, and the app has never once told you where you are */}
      <div className="head__run">
        {openBook ? (
          <>
            <button type="button" className="head__crumb" onClick={onHome}>Shelf</button>
            <b>{openBook.title}</b>
            {where && <i>{where}</i>}
          </>
        ) : (
          <>
            <span>The Shelf</span>
            <i className="num">
              {books.length} {books.length === 1 ? "book" : "books"} ·{" "}
              {hours(total)} h · {hours(heard)} h heard
            </i>
          </>
        )}
      </div>
      <div className="head__right">
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
            from the shelf and the add-book flow, not only from BookView. */}
        <div className="head__pill" id="head-transport" />
        {onStats && (
          <BookButton variant="pamphlet" size="sm" onClick={onStats}
                      aria-pressed={statsActive}>Statistics</BookButton>
        )}
        <div className="head__acct">
          <span title={email}>{email}</span>
          <BookButton variant="pamphlet" size="sm" onClick={onSignOut}>
            Sign out
          </BookButton>
        </div>
      </div>
    </header>
  );
}
