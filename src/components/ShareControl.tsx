import { useMemo, useState } from "react";
import type { NewQuote } from "@/hooks/useQuotes";
import type { Quote, SharedWork } from "@/types";
import { matchWork } from "@/lib/shareMatch";
import { BookButton } from "./BookButton";

interface Props {
  quote: Quote;
  /** Books a moderator has opened a quote base for. */
  works: SharedWork[];
  /** The title this quote is filed under, for matching against those books. */
  sourceTitle: string | null;
  onUpdate: (id: string, patch: Partial<NewQuote>) => Promise<boolean>;
}

/** Shared quotes are capped; the database enforces the same number. */
const MAX_SHARED = 1000;

/**
 * Putting one line on a book's public page, and taking it back.
 *
 * Sharing is per quote and always deliberate — there is no "share everything"
 * and no default. What goes is the words and the attribution. Your note does
 * not, and cannot: the view the public reads has no such column.
 *
 * A quote can only join a book a moderator has opened up, which a foreign key
 * enforces however this control behaves. Where the book is recognised, that is
 * one press. Where it is not, this used to render nothing at all — so while
 * three books had quote bases, every quote in the app looked as though sharing
 * did not exist. Now it offers the list instead, and says plainly what the
 * line is currently filed under so it is not put on the wrong book's page.
 */
export function ShareControl({ quote, works, sourceTitle, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const shared = quote.visibility === "public";

  // The opened book this quote appears to belong to. Forgiving about how the
  // title was typed or what a folder called it — see lib/shareMatch.
  const match = useMemo(
    () => matchWork(sourceTitle, quote.author, works),
    [works, sourceTitle, quote.author],
  );

  const tooLong = quote.text.length > MAX_SHARED;

  const set = async (patch: Partial<NewQuote>, failure: string) => {
    setErr(null);
    setBusy(true);
    const ok = await onUpdate(quote.id, patch);
    setBusy(false);
    if (!ok) setErr(failure);
    return ok;
  };

  const shareTo = async (work: SharedWork) => {
    const ok = await set(
      { visibility: "public", work_key: work.work_key },
      "That would not share. The book may have just been closed.",
    );
    if (ok) setPicking(false);
  };

  if (shared) {
    const where = works.find((w) => w.work_key === quote.work_key);
    return (
      <span className="share share--on">
        <span className="share__state">
          {where ? `Shared to ${where.title}` : "Shared"}
        </span>
        <BookButton
          variant="pamphlet"
          size="sm"
          disabled={busy}
          onClick={() =>
            void set(
              { visibility: "private", work_key: null },
              "Could not withdraw it. Try again.",
            )
          }
        >
          Make private
        </BookButton>
        {err && (
          <span className="share__err" role="alert">
            {err}
          </span>
        )}
      </span>
    );
  }

  // No book anywhere has a page to share to, so there is nothing to offer.
  if (works.length === 0) return null;

  return (
    <span className={picking ? "share share--picking" : "share"}>
      {match ? (
        <BookButton
          variant="pamphlet"
          size="sm"
          disabled={busy || tooLong}
          onClick={() => void shareTo(match)}
        >
          Share to Quote Base
        </BookButton>
      ) : (
        <BookButton
          variant="pamphlet"
          size="sm"
          disabled={busy}
          aria-expanded={picking}
          onClick={() => {
            setErr(null);
            setPicking((v) => !v);
          }}
        >
          {picking ? "Not now" : "Share…"}
        </BookButton>
      )}

      {match && tooLong && (
        <span className="share__note">
          Too long to share — {quote.text.length} of {MAX_SHARED} characters.
        </span>
      )}

      {picking && (
        <span className="share__pick">
          <span className="share__hint">
            {sourceTitle ? (
              <>
                This line is filed under <b>{sourceTitle}</b>, which has no
                quote base of its own. It can still go on the page of a book
                that has one — but it will be read there as a line from that
                book.
              </>
            ) : (
              <>
                This line names no source. A quote base belongs to one book, so
                choose the book these words are from.
              </>
            )}
          </span>
          {tooLong ? (
            <span className="share__note">
              Too long to share — {quote.text.length} of {MAX_SHARED}{" "}
              characters. Shorten it with Amend first.
            </span>
          ) : (
            <span className="share__list">
              {works.map((w) => (
                <button
                  key={w.work_key}
                  type="button"
                  disabled={busy}
                  onClick={() => void shareTo(w)}
                >
                  <b>{w.title}</b>
                  <span>{[w.author, w.year].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </span>
          )}
        </span>
      )}

      {err && (
        <span className="share__err" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
