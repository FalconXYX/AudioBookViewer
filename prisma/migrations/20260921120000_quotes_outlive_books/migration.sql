-- Quotes outlive the books they came from.
--
-- `quotes_book_id_fkey` was ON DELETE CASCADE, so removing a book from the
-- shelf silently deleted every line kept from it. The audio is on disk and can
-- be re-added in a minute; the quotes exist nowhere else. The confirmation
-- dialog said "Your audio files are untouched", which was true and was read as
-- a reassurance about the wrong thing.
--
-- Two changes, which only make sense together:
--   1. The foreign key becomes ON DELETE SET NULL, so the quote survives.
--   2. A trigger stamps the book's title onto the quote first, so a surviving
--      quote still says where it came from instead of becoming anonymous.
--
-- Nothing here deletes or rewrites an existing row.

-- 1. The quote keeps its provenance.
--
-- `quoted_author` is the column a quote with no book already uses for "where
-- you found it" (see LooseQuoteForm and QuoteList, which read it that way when
-- book_id is null). Writing the title there means an orphaned quote files
-- itself under the book's name among the other loose ones, rather than
-- appearing to have come from nowhere.
--
-- Only filled where it is empty: a quote that already records who relayed it
-- must not have that overwritten by a title.
CREATE OR REPLACE FUNCTION public.remember_book_on_quotes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.quotes
     SET quoted_author = OLD.title
   WHERE book_id = OLD.id
     AND quoted_author IS NULL;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS books_remember_on_quotes ON public.books;
CREATE TRIGGER books_remember_on_quotes BEFORE DELETE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.remember_book_on_quotes();

-- 2. The quote is no longer deleted with the book.
ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "quotes_book_id_fkey";
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_book_id_fkey"
  FOREIGN KEY ("book_id") REFERENCES "books"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
