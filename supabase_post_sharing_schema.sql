-- ==============================================================================
-- OUTERA — UNIQUE POST-SHARING URL & SLUG SYSTEM MIGRATION
-- URL Structure: https://www.outerabd.buzz/p/{slug}-{uniqueId}
-- Example:       https://www.outerabd.buzz/p/raaga-art-caffe-8f3k2a
-- Safe, idempotent migration extending existing `public.place_posts` table.
-- ==============================================================================

BEGIN;

-- 1. Add `short_id` and `slug` columns to existing `public.place_posts` table
ALTER TABLE public.place_posts
  ADD COLUMN IF NOT EXISTS short_id text,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. Helper function: Convert text (place name or post title) into a URL-safe slug
CREATE OR REPLACE FUNCTION public.slugify_outera_text(p_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean text;
BEGIN
  v_clean := lower(coalesce(trim(p_input), ''));
  -- Replace any non-alphanumeric sequence with a single hyphen
  v_clean := regexp_replace(v_clean, '[^a-z0-9]+', '-', 'g');
  -- Trim leading and trailing hyphens
  v_clean := regexp_replace(v_clean, '^-+|-+$', '', 'g');
  -- Truncate to 60 chars cleanly
  v_clean := left(v_clean, 60);
  v_clean := regexp_replace(v_clean, '-+$', '', 'g');

  IF v_clean = '' THEN
    RETURN 'community-post';
  END IF;

  RETURN v_clean;
END;
$$;

-- 3. Helper function: Deterministic 6-char alphanumeric (base36) short_id from post UUID
-- Matches the TypeScript `uuidToShortId(uuid)` implementation in `src/services/postUrl.ts`
CREATE OR REPLACE FUNCTION public.derive_post_short_id(p_uuid uuid)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_hex text;
  v_high bigint;
  v_low bigint;
  v_combined bigint;
  v_val bigint;
  v_chars constant text := '0123456789abcdefghijklmnopqrstuvwxyz';
  v_result text := '';
  v_rem int;
  i int;
BEGIN
  IF p_uuid IS NULL THEN
    RETURN substr(md5(random()::text), 1, 6);
  END IF;

  v_hex := replace(lower(p_uuid::text), '-', '');
  v_high := ('x' || lpad(substr(v_hex, 1, 8), 16, '0'))::bit(64)::bigint;
  v_low  := ('x' || lpad(substr(v_hex, 25, 8), 16, '0'))::bit(64)::bigint;

  -- Mask to 32-bit unsigned equivalent: (v_high # (v_low << 7)) & 0xffffffff
  v_combined := (v_high # (v_low << 7)) & 4294967295;
  -- Map into 6-char base36 range [60466176 .. 2176782335]
  v_val := 60466176 + (v_combined % (2176782336 - 60466176));

  FOR i IN 1..6 LOOP
    v_rem := (v_val % 36)::int;
    v_result := substr(v_chars, v_rem + 1, 1) || v_result;
    v_val := v_val / 36;
  END LOOP;

  RETURN v_result;
END;
$$;

-- 4. Trigger function: Automatically populate `short_id` and `slug` on INSERT / UPDATE
CREATE OR REPLACE FUNCTION public.sync_place_post_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_place_name text;
  v_base_slug text;
  v_candidate_short text;
  v_counter int := 0;
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  -- Ensure unique short_id
  IF NEW.short_id IS NULL OR trim(NEW.short_id) = '' THEN
    v_candidate_short := public.derive_post_short_id(NEW.id);
    WHILE EXISTS (
      SELECT 1 FROM public.place_posts
      WHERE short_id = v_candidate_short
        AND id <> NEW.id
    ) LOOP
      v_counter := v_counter + 1;
      v_candidate_short := substr(md5(NEW.id::text || v_counter::text), 1, 6);
    END LOOP;
    NEW.short_id := v_candidate_short;
  END IF;

  -- Fetch associated place name for human-readable slug
  IF NEW.place_id IS NOT NULL THEN
    SELECT name INTO v_place_name
    FROM public.places
    WHERE id = NEW.place_id;
  END IF;

  v_base_slug := public.slugify_outera_text(
    CASE
      WHEN v_place_name IS NOT NULL AND trim(v_place_name) <> '' THEN v_place_name
      ELSE NEW.title
    END
  );

  NEW.slug := v_base_slug || '-' || NEW.short_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_place_post_slug ON public.place_posts;
CREATE TRIGGER trg_sync_place_post_slug
BEFORE INSERT OR UPDATE OF title, place_id, short_id, slug
ON public.place_posts
FOR EACH ROW
EXECUTE FUNCTION public.sync_place_post_slug();

-- 5. Backfill existing rows in `public.place_posts`
UPDATE public.place_posts pp
SET
  short_id = COALESCE(NULLIF(trim(pp.short_id), ''), public.derive_post_short_id(pp.id)),
  slug = public.slugify_outera_text(
    COALESCE(
      (SELECT p.name FROM public.places p WHERE p.id = pp.place_id),
      pp.title
    )
  ) || '-' || COALESCE(NULLIF(trim(pp.short_id), ''), public.derive_post_short_id(pp.id))
WHERE pp.short_id IS NULL
   OR pp.slug IS NULL
   OR trim(pp.short_id) = ''
   OR trim(pp.slug) = '';

-- 6. Create indexes for fast direct post lookup by `slug` and `short_id`
CREATE UNIQUE INDEX IF NOT EXISTS idx_place_posts_short_id_unique
  ON public.place_posts (short_id)
  WHERE short_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_place_posts_slug_unique
  ON public.place_posts (slug)
  WHERE slug IS NOT NULL;

-- 7. Ensure RLS policy strictly restricts public visitors to approved, non-deleted posts
ALTER TABLE public.place_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_posts_select_policy" ON public.place_posts;
DROP POLICY IF EXISTS "Public and users can view approved posts" ON public.place_posts;

CREATE POLICY "place_posts_select_policy"
ON public.place_posts FOR SELECT
USING (
  (status::text = 'approved' AND deleted_at IS NULL)
  OR (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  OR public.is_admin()
);

COMMIT;
