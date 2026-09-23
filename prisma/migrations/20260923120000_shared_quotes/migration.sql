-- A shared quote base, per book.
--
-- Three rules shape everything below, and all three are enforced by the
-- database rather than by the app, because the app is a file anybody can edit
-- in their own browser:
--
--   1. Nothing is shared unless the reader says so. `visibility` defaults to
--      'private' and no code path flips it without an explicit action.
--   2. A quote can only be shared against a book a MODERATOR has approved.
--      Without that the quote base becomes a heap of misspelled titles.
--   3. Moderator is set by hand in the Supabase dashboard and nowhere else.
--      There is deliberately no policy that lets anyone write that column,
--      including themselves. The toggle in the app only shows tools; it
--      grants nothing.
--
-- And one privacy rule: your note is never shared. It is not "not selected" —
-- it is structurally unreachable, because the view the public reads does not
-- contain the column. See `shared_quotes` at the bottom.

-- =============================================================================
-- 1. WHO IS A MODERATOR
-- =============================================================================

CREATE TABLE IF NOT EXISTS "profiles" (
    "user_id"      UUID NOT NULL,
    -- Flip this in the Supabase table editor. That is the whole mechanism.
    "is_moderator" BOOLEAN NOT NULL DEFAULT false,
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_user_id_fkey";
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;

-- Everyone who already has an account gets a row, moderator false.
INSERT INTO public.profiles (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- And everyone who signs up from now on.
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_ensure_profile ON auth.users;
CREATE TRIGGER users_ensure_profile AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.ensure_profile();

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;

-- You may read your own row, so the app can tell whether to show the tools.
DROP POLICY IF EXISTS profiles_read_own ON public.profiles;
CREATE POLICY profiles_read_own ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

-- There is no INSERT, UPDATE or DELETE policy, on purpose. With RLS enabled
-- and no policy for a command, that command is denied to every ordinary
-- client — so `is_moderator` cannot be written through the API at all, by
-- anybody, including its owner. The dashboard uses the service role, which
-- bypasses RLS, which is exactly the "go into Supabase and flip it" path.

/**
 * True when the caller is a moderator.
 *
 * SECURITY DEFINER so it can read `profiles` past that table's own policy,
 * and STABLE so the planner may call it once per statement rather than once
 * per row.
 */
CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_moderator FROM public.profiles p WHERE p.user_id = auth.uid()),
    false
  );
$$;

-- =============================================================================
-- 2. WHICH BOOKS MAY BE SHARED TO
-- =============================================================================
--
-- An allowlist, so the quote base is a set of books rather than a set of
-- typos. Keyed on the Open Library work key ("/works/OL45345712W"), which is
-- stable across people and editions — the one identifier two readers holding
-- the same paperback will independently arrive at.

CREATE TABLE IF NOT EXISTS "shared_works" (
    "work_key"    TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "author"      TEXT,
    "year"        INTEGER,
    "cover_id"    INTEGER,
    "approved_by" UUID NOT NULL,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shared_works_pkey" PRIMARY KEY ("work_key")
);

ALTER TABLE "shared_works" DROP CONSTRAINT IF EXISTS "shared_works_approved_by_fkey";
ALTER TABLE "shared_works" ADD CONSTRAINT "shared_works_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES auth.users("id") ON DELETE RESTRICT;

-- A work key is Open Library's, and nothing else should get in here.
ALTER TABLE "shared_works" DROP CONSTRAINT IF EXISTS "shared_works_key_shape";
ALTER TABLE "shared_works" ADD CONSTRAINT "shared_works_key_shape"
  CHECK ("work_key" ~ '^/works/OL[0-9]+W$');

ALTER TABLE "shared_works" ENABLE ROW LEVEL SECURITY;

-- Anyone may see which books have a quote base, signed in or not.
DROP POLICY IF EXISTS shared_works_read_all ON public.shared_works;
CREATE POLICY shared_works_read_all ON public.shared_works
  FOR SELECT TO anon, authenticated USING (true);

-- Only a moderator opens a book up, and only a moderator closes it again.
-- Split by command: opening one records who did it, but a later moderator
-- must still be able to correct a title without the row's original approver
-- blocking them — which a single FOR ALL policy would have done.
DROP POLICY IF EXISTS shared_works_moderate ON public.shared_works;

DROP POLICY IF EXISTS shared_works_insert ON public.shared_works;
CREATE POLICY shared_works_insert ON public.shared_works
  FOR INSERT TO authenticated
  WITH CHECK (public.is_moderator() AND approved_by = auth.uid());

DROP POLICY IF EXISTS shared_works_update ON public.shared_works;
CREATE POLICY shared_works_update ON public.shared_works
  FOR UPDATE TO authenticated
  USING (public.is_moderator()) WITH CHECK (public.is_moderator());

DROP POLICY IF EXISTS shared_works_delete ON public.shared_works;
CREATE POLICY shared_works_delete ON public.shared_works
  FOR DELETE TO authenticated USING (public.is_moderator());

-- =============================================================================
-- 3. SHARING A QUOTE
-- =============================================================================

ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "work_key" TEXT;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'private';

ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "quotes_visibility_check";
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_visibility_check"
  CHECK ("visibility" IN ('private', 'public'));

-- Rule 2, as a constraint rather than a hope: a quote cannot be public
-- without naming a work, and the work must be one a moderator approved.
--
-- NO ACTION rather than SET NULL, and a trigger does the work instead. SET
-- NULL would null `work_key` while `visibility` stayed 'public', which the
-- check below forbids — so un-approving a book would have failed with a
-- constraint violation instead of quietly un-sharing its quotes.
ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "quotes_work_key_fkey";
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_work_key_fkey"
  FOREIGN KEY ("work_key") REFERENCES "shared_works"("work_key")
  ON DELETE NO ACTION ON UPDATE CASCADE
  DEFERRABLE INITIALLY IMMEDIATE;

-- Closing a book puts every quote under it back in its owner's own hands.
-- The text is never touched; only its visibility.
CREATE OR REPLACE FUNCTION public.unshare_quotes_of_work()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.quotes
     SET visibility = 'private', work_key = NULL
   WHERE work_key = OLD.work_key;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS shared_works_unshare ON public.shared_works;
CREATE TRIGGER shared_works_unshare BEFORE DELETE ON public.shared_works
  FOR EACH ROW EXECUTE FUNCTION public.unshare_quotes_of_work();

ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "quotes_public_needs_work";
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_public_needs_work"
  CHECK ("visibility" = 'private' OR "work_key" IS NOT NULL);

-- Rule for length. Short attributed excerpts are ordinary practice; whole
-- chapters are not, and a cap is the difference.
ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "quotes_shared_length";
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_shared_length"
  CHECK ("visibility" = 'private' OR char_length("text") <= 1000);

CREATE INDEX IF NOT EXISTS quotes_work_key_idx
  ON public.quotes ("work_key") WHERE "visibility" = 'public';

-- -----------------------------------------------------------------------------
-- Policies on quotes.
--
-- The blanket `FOR ALL USING (auth.uid() = user_id)` is replaced by one policy
-- per command, because moderators need to reach exactly one of them — delete —
-- and nothing else. Note that SELECT stays owner-only: nobody reads anybody
-- else's row from this table, ever. The public path is the view below.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS quotes_owner_all ON public.quotes;

DROP POLICY IF EXISTS quotes_select_own ON public.quotes;
CREATE POLICY quotes_select_own ON public.quotes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS quotes_insert_own ON public.quotes;
CREATE POLICY quotes_insert_own ON public.quotes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS quotes_update_own ON public.quotes;
CREATE POLICY quotes_update_own ON public.quotes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS quotes_delete_own ON public.quotes;
CREATE POLICY quotes_delete_own ON public.quotes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Moderation is deliberately NOT a policy on this table.
--
-- Two reasons, both found by testing rather than by thinking:
--
-- First, it would not have worked. A DELETE with a WHERE clause has to be
-- able to SEE the row before it can match it, and SELECT here is owner-only —
-- so a moderator's delete silently matched nothing at all.
--
-- Second, the obvious repair — a SELECT policy letting moderators read public
-- quotes — hands them every column of those rows, including `note`, which is
-- the one thing that is never shared even when the quote is. Moderating a
-- public page should not come with a window into somebody's private thoughts.
--
-- So the power is a single function instead, narrow enough to describe in a
-- sentence: it un-shares, and it can only touch a quote that is already
-- public.

CREATE TABLE IF NOT EXISTS "moderation_actions" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_id"     UUID NOT NULL,
    "moderator_id" UUID NOT NULL,
    "reason"       TEXT,
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "moderation_actions" ENABLE ROW LEVEL SECURITY;
-- No policy: written by the function below, read from the dashboard. An
-- action nobody can review is not moderation, it is just deletion.

/**
 * Take a quote out of the shared base.
 *
 * It is un-shared, not deleted. The row belongs to the reader who wrote it
 * and their copy is none of a moderator's business; what is being withdrawn
 * is its appearance on a public page. Their words stay in their own
 * commonplace book, exactly as typed.
 *
 * Returns true when something was actually withdrawn.
 */
CREATE OR REPLACE FUNCTION public.moderate_unshare(quote_id UUID, reason TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  touched INTEGER;
BEGIN
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'Only a moderator can withdraw a shared quote.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.quotes
     SET visibility = 'private', work_key = NULL
   WHERE id = quote_id
     AND visibility = 'public';        -- never reaches a private quote

  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched = 0 THEN RETURN false; END IF;

  INSERT INTO public.moderation_actions (quote_id, moderator_id, reason)
  VALUES (quote_id, auth.uid(), reason);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_unshare(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_unshare(UUID, TEXT) TO authenticated;

-- =============================================================================
-- 4. WHAT THE PUBLIC ACTUALLY READS
-- =============================================================================
--
-- A view, and the reason it is a view is the note.
--
-- Row-level security is row-level: if a policy lets you read a row, it lets
-- you read every column of it, and `note` holds the reader's own thought
-- about a passage. So there is no policy exposing other people's rows at all.
-- Instead this view selects the shareable columns and nothing else, and the
-- note is unreachable because it is not in the projection.
--
-- The view runs as its owner and so passes the base table's policies by
-- design. That makes the WHERE clause load-bearing, which is why both
-- conditions are stated here rather than relied on from elsewhere:
-- the quote says it is public, AND its work is on the allowlist.

DROP VIEW IF EXISTS public.shared_quotes;
CREATE VIEW public.shared_quotes
WITH (security_barrier = true) AS
  SELECT
    q.id,
    q.work_key,
    q.text,
    q.author,
    q.quoted_author,
    q.created_at
  FROM public.quotes q
  JOIN public.shared_works w ON w.work_key = q.work_key
  WHERE q.visibility = 'public';

-- Deliberately not selected, and so not reachable through this view:
--   note            the reader's private thought
--   user_id         who kept it
--   book_id         which of their local books it came from
--   chapter_idx, position_sec, clip_start_sec, clip_end_sec
--   transcribed

GRANT SELECT ON public.shared_quotes TO anon, authenticated;

COMMENT ON VIEW public.shared_quotes IS
  'Shared quotes, per approved work. Omits note and user_id by construction; '
  'see migration 20260923120000_shared_quotes.';
