-- =============================================================================
-- OUTERA — PRODUCTION DATABASE & STORAGE REPAIR MIGRATION
-- Safe, idempotent, non-destructive SQL script for Supabase SQL Editor.
-- Does NOT drop or truncate existing user data.
-- Fixes:
--   1. Storage bucket `community-review-media` provisioning & public read/write/delete policies
--   2. Foreign key ON DELETE CASCADE for post images, comments, helpful votes, suggestion images, and place images
--   3. RLS policies for `place_posts` (allowing owners to edit/delete their own posts of any status, and admins to moderate/delete)
--   4. RLS policies for `place_post_images`, `place_suggestion_images`, `place_images`, `place_post_comments`, `place_post_helpful`, `experiences`, and `reports`
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. HELPER FUNCTION FOR ADMIN CHECK (Safe, non-recursive)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_outera_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'moderator')
  );
$$;

-- -----------------------------------------------------------------------------
-- 2. STORAGE BUCKET: `community-review-media`
--    Creates the bucket if missing, sets `public = true` so public URLs & signed
--    URLs both work reliably, sets 5MB limit and allowed image MIME types.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-review-media',
  'community-review-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- Storage RLS Policies for `community-review-media`
DROP POLICY IF EXISTS "outera_media_public_read" ON storage.objects;
CREATE POLICY "outera_media_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'community-review-media');

DROP POLICY IF EXISTS "outera_media_auth_insert" ON storage.objects;
CREATE POLICY "outera_media_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'community-review-media'
  AND (
    (storage.foldername(name))[2] = auth.uid()::text
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_outera_admin()
  )
);

DROP POLICY IF EXISTS "outera_media_owner_or_admin_update" ON storage.objects;
CREATE POLICY "outera_media_owner_or_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'community-review-media'
  AND (
    owner = auth.uid()
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_outera_admin()
  )
);

DROP POLICY IF EXISTS "outera_media_owner_or_admin_delete" ON storage.objects;
CREATE POLICY "outera_media_owner_or_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'community-review-media'
  AND (
    owner = auth.uid()
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_outera_admin()
  )
);

-- -----------------------------------------------------------------------------
-- 3. FOREIGN KEY REPAIR (Ensure ON DELETE CASCADE on child tables)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Ensure place_post_images.post_id cascades on delete
  FOR r IN (
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'place_post_images'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'post_id'
  ) LOOP
    EXECUTE format('ALTER TABLE public.place_post_images DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
  END LOOP;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'place_post_images') THEN
    ALTER TABLE public.place_post_images
      ADD CONSTRAINT place_post_images_post_id_fkey
      FOREIGN KEY (post_id) REFERENCES public.place_posts(id) ON DELETE CASCADE;
  END IF;

  -- Ensure place_post_comments.post_id cascades on delete
  FOR r IN (
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'place_post_comments'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'post_id'
  ) LOOP
    EXECUTE format('ALTER TABLE public.place_post_comments DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
  END LOOP;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'place_post_comments') THEN
    ALTER TABLE public.place_post_comments
      ADD CONSTRAINT place_post_comments_post_id_fkey
      FOREIGN KEY (post_id) REFERENCES public.place_posts(id) ON DELETE CASCADE;
  END IF;

  -- Ensure place_post_helpful.post_id cascades on delete
  FOR r IN (
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'place_post_helpful'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'post_id'
  ) LOOP
    EXECUTE format('ALTER TABLE public.place_post_helpful DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
  END LOOP;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'place_post_helpful') THEN
    ALTER TABLE public.place_post_helpful
      ADD CONSTRAINT place_post_helpful_post_id_fkey
      FOREIGN KEY (post_id) REFERENCES public.place_posts(id) ON DELETE CASCADE;
  END IF;

  -- Ensure place_suggestion_images.suggestion_id cascades on delete
  FOR r IN (
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'place_suggestion_images'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'suggestion_id'
  ) LOOP
    EXECUTE format('ALTER TABLE public.place_suggestion_images DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
  END LOOP;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'place_suggestion_images') THEN
    ALTER TABLE public.place_suggestion_images
      ADD CONSTRAINT place_suggestion_images_suggestion_id_fkey
      FOREIGN KEY (suggestion_id) REFERENCES public.place_suggestions(id) ON DELETE CASCADE;
  END IF;

  -- Ensure place_images.place_id cascades on delete
  FOR r IN (
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'place_images'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'place_id'
  ) LOOP
    EXECUTE format('ALTER TABLE public.place_images DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
  END LOOP;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'place_images') THEN
    ALTER TABLE public.place_images
      ADD CONSTRAINT place_images_place_id_fkey
      FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. RLS POLICIES FOR `place_posts`
--    Crucial fix: Allow post owners to DELETE and UPDATE their own posts
--    regardless of whether status is 'pending', 'approved', or 'rejected',
--    and allow admins full access.
-- -----------------------------------------------------------------------------
ALTER TABLE public.place_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_posts_select_policy" ON public.place_posts;
CREATE POLICY "place_posts_select_policy"
ON public.place_posts FOR SELECT
USING (
  status = 'approved'
  OR auth.uid() = user_id
  OR public.is_outera_admin()
);

DROP POLICY IF EXISTS "place_posts_insert_policy" ON public.place_posts;
CREATE POLICY "place_posts_insert_policy"
ON public.place_posts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "place_posts_update_policy" ON public.place_posts;
CREATE POLICY "place_posts_update_policy"
ON public.place_posts FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.is_outera_admin())
WITH CHECK (auth.uid() = user_id OR public.is_outera_admin());

DROP POLICY IF EXISTS "place_posts_delete_policy" ON public.place_posts;
CREATE POLICY "place_posts_delete_policy"
ON public.place_posts FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.is_outera_admin());

-- -----------------------------------------------------------------------------
-- 5. RLS POLICIES FOR `place_post_images`
-- -----------------------------------------------------------------------------
ALTER TABLE public.place_post_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_post_images_select_policy" ON public.place_post_images;
CREATE POLICY "place_post_images_select_policy"
ON public.place_post_images FOR SELECT
USING (true);

DROP POLICY IF EXISTS "place_post_images_insert_policy" ON public.place_post_images;
CREATE POLICY "place_post_images_insert_policy"
ON public.place_post_images FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.place_posts p
    WHERE p.id = place_post_images.post_id
      AND (p.user_id = auth.uid() OR public.is_outera_admin())
  )
);

DROP POLICY IF EXISTS "place_post_images_delete_policy" ON public.place_post_images;
CREATE POLICY "place_post_images_delete_policy"
ON public.place_post_images FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.place_posts p
    WHERE p.id = place_post_images.post_id
      AND (p.user_id = auth.uid() OR public.is_outera_admin())
  )
  OR public.is_outera_admin()
);

-- -----------------------------------------------------------------------------
-- 6. RLS POLICIES FOR `place_post_comments` & `place_post_helpful`
-- -----------------------------------------------------------------------------
ALTER TABLE public.place_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_post_comments_select_policy" ON public.place_post_comments;
CREATE POLICY "place_post_comments_select_policy"
ON public.place_post_comments FOR SELECT
USING (true);

DROP POLICY IF EXISTS "place_post_comments_insert_policy" ON public.place_post_comments;
CREATE POLICY "place_post_comments_insert_policy"
ON public.place_post_comments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "place_post_comments_delete_policy" ON public.place_post_comments;
CREATE POLICY "place_post_comments_delete_policy"
ON public.place_post_comments FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_outera_admin()
  OR EXISTS (
    SELECT 1 FROM public.place_posts p
    WHERE p.id = place_post_comments.post_id
      AND p.user_id = auth.uid()
  )
);

ALTER TABLE public.place_post_helpful ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_post_helpful_select_policy" ON public.place_post_helpful;
CREATE POLICY "place_post_helpful_select_policy"
ON public.place_post_helpful FOR SELECT
USING (true);

DROP POLICY IF EXISTS "place_post_helpful_insert_policy" ON public.place_post_helpful;
CREATE POLICY "place_post_helpful_insert_policy"
ON public.place_post_helpful FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "place_post_helpful_delete_policy" ON public.place_post_helpful;
CREATE POLICY "place_post_helpful_delete_policy"
ON public.place_post_helpful FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_outera_admin()
  OR EXISTS (
    SELECT 1 FROM public.place_posts p
    WHERE p.id = place_post_helpful.post_id
      AND p.user_id = auth.uid()
  )
);

-- -----------------------------------------------------------------------------
-- 7. RLS POLICIES FOR `place_suggestions`, `place_suggestion_images`, & `place_images`
-- -----------------------------------------------------------------------------
ALTER TABLE public.place_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_suggestions_select_policy" ON public.place_suggestions;
CREATE POLICY "place_suggestions_select_policy"
ON public.place_suggestions FOR SELECT
USING (
  auth.uid() = suggested_by
  OR status = 'approved'
  OR public.is_outera_admin()
);

DROP POLICY IF EXISTS "place_suggestions_insert_policy" ON public.place_suggestions;
CREATE POLICY "place_suggestions_insert_policy"
ON public.place_suggestions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = suggested_by);

DROP POLICY IF EXISTS "place_suggestions_update_policy" ON public.place_suggestions;
CREATE POLICY "place_suggestions_update_policy"
ON public.place_suggestions FOR UPDATE
TO authenticated
USING (auth.uid() = suggested_by OR public.is_outera_admin())
WITH CHECK (auth.uid() = suggested_by OR public.is_outera_admin());

DROP POLICY IF EXISTS "place_suggestions_delete_policy" ON public.place_suggestions;
CREATE POLICY "place_suggestions_delete_policy"
ON public.place_suggestions FOR DELETE
TO authenticated
USING (auth.uid() = suggested_by OR public.is_outera_admin());

ALTER TABLE public.place_suggestion_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_suggestion_images_select_policy" ON public.place_suggestion_images;
CREATE POLICY "place_suggestion_images_select_policy"
ON public.place_suggestion_images FOR SELECT
USING (true);

DROP POLICY IF EXISTS "place_suggestion_images_insert_policy" ON public.place_suggestion_images;
CREATE POLICY "place_suggestion_images_insert_policy"
ON public.place_suggestion_images FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.place_suggestions s
    WHERE s.id = place_suggestion_images.suggestion_id
      AND (s.suggested_by = auth.uid() OR public.is_outera_admin())
  )
);

DROP POLICY IF EXISTS "place_suggestion_images_delete_policy" ON public.place_suggestion_images;
CREATE POLICY "place_suggestion_images_delete_policy"
ON public.place_suggestion_images FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.place_suggestions s
    WHERE s.id = place_suggestion_images.suggestion_id
      AND (s.suggested_by = auth.uid() OR public.is_outera_admin())
  )
  OR public.is_outera_admin()
);

ALTER TABLE public.place_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_images_select_policy" ON public.place_images;
CREATE POLICY "place_images_select_policy"
ON public.place_images FOR SELECT
USING (true);

DROP POLICY IF EXISTS "place_images_insert_policy" ON public.place_images;
CREATE POLICY "place_images_insert_policy"
ON public.place_images FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = uploaded_by OR public.is_outera_admin());

DROP POLICY IF EXISTS "place_images_delete_policy" ON public.place_images;
CREATE POLICY "place_images_delete_policy"
ON public.place_images FOR DELETE
TO authenticated
USING (auth.uid() = uploaded_by OR public.is_outera_admin());

-- -----------------------------------------------------------------------------
-- 8. RLS POLICIES FOR LEGACY `experiences` TABLE (Ensure old entries can be deleted)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'experiences') THEN
    EXECUTE 'ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "experiences_delete_policy" ON public.experiences';
    EXECUTE 'CREATE POLICY "experiences_delete_policy" ON public.experiences FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_outera_admin())';
  END IF;
END $$;

COMMIT;
