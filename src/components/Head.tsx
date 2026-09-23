import type { BookWithProgress } from "@/hooks/useLibrary";
import { BookButton } from "./BookButton";
import { NavActions } from "./NavActions";
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
  onQuotes?: () => void;
  quotesActive?: boolean;
  onBase?: () => void;
  baseActive?: boolean;
  simple?: boolean;
  onSimple?: () => void;
  onHome?: () => void;
  /** On a phone the controls move into the shelf drawer; see NavActions. */
  phone?: boolean;
  drawerOpen?: boolean;
  onMenu?: () => void;
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
  onQuotes,
  quotesActive,
  onBase,
  baseActive,
  simple,
  onSimple,
  onHome,
  phone,
  drawerOpen,
  onMenu,
}: Props) {
  const total = books.reduce((n, b) => n + (b.total_duration_sec || 0), 0);
  const heard = books.reduce(
    (n, b) => n + (b.progress?.book_position_sec ?? 0),
    0,
  );
  return (
    <header className="head">
      {/* The shelf is off-canvas on a phone, so it needs a handle. Rendered
          only there: on a desk the case is always visible and a button that
          opened it would be a control with nothing to do. */}
      {phone && (
        <button
          type="button"
          className="head__menu"
          aria-expanded={!!drawerOpen}
          aria-controls="shelf-case"
          onClick={onMenu}
        >
          <span className="head__menu-bars" aria-hidden="true" />
          <span className="sr-only">
            {drawerOpen ? "Close the shelf" : "Open the shelf"}
          </span>
        </button>
      )}
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
        {phone
          ? (
            <>
              {/* Playback and the commonplace book both stay in the head.
                  Everything else moves into the drawer — but burying Quotes
                  behind a hamburger made the one thing a phone is actually
                  for look as though it had been taken away. */}
              <div className="head__pill" id="head-transport" />
              {onQuotes && (
                <BookButton variant="quotes" size="sm" onClick={onQuotes}
                            openLabel="Opening…" aria-pressed={quotesActive}>
                  Quotes
                </BookButton>
              )}
            </>
          )
          : (
            <NavActions
              query={query} onQuery={onQuery} email={email} onSignOut={onSignOut}
              onStats={onStats} statsActive={statsActive}
              onQuotes={onQuotes} quotesActive={quotesActive}
              onBase={onBase} baseActive={baseActive}
              simple={simple} onSimple={onSimple}
            />
          )}
      </div>
    </header>
  );
}
