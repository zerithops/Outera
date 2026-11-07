-- =============================================================================
-- OUTERA — PRODUCTION DATABASE & STORAGE REPAIR MIGRATION (VERIFIED SCHEMA)
-- Safe, idempotent, non-destructive SQL script for Supabase SQL Editor.
-- Also removes the 3 test entries ("Hbbb", "Hshs", "Hshs") from places & suggestions.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. REMOVE THE 3 TEST ENTRIES ("Hbbb", "Hshs", "Hshs")
-- -----------------------------------------------------------------------------
DELETE FROM public.place_images
WHERE place_id IN (
  'cbc6ab88-7d9b-4da6-be3e-ca498b0e828f',
  '4e10637f-c1dc-46d3-9efa-cf2aae8c0ed8',
  '980b49a1-5685-4406-8564-d73885e365fe'
);

DELETE FROM public.places
WHERE id IN (
  'cbc6ab88-7d9b-4da6-be3e-ca498b0e828f',
  '4e10637f-c1dc-46d3-9efa-cf2aae8c0ed8',
  '980b49a1-5685-4406-8564-d73885e365fe'
)
OR lower(trim(name)) IN ('hbbb', 'hshs');

DELETE FROM public.place_suggestions
WHERE lower(trim(name)) IN ('hbbb', 'hshs');

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
      AND role::text IN ('admin', 'moderator')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_outera_admin() TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 2. STORAGE BUCKET: `community-review-media`
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
  AND auth.uid() IS NOT NULL
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
-- 4. RLS POLICIES FOR `places` AND `place_posts`
-- -----------------------------------------------------------------------------
GRANT SELECT ON TABLE public.places TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.places TO authenticated;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "places_delete_policy" ON public.places;
CREATE POLICY "places_delete_policy"
ON public.places FOR DELETE
TO authenticated
USING (public.is_outera_admin() OR auth.uid() = created_by);

GRANT SELECT ON TABLE public.place_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.place_posts TO authenticated;
ALTER TABLE public.place_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_posts_select_policy" ON public.place_posts;
CREATE POLICY "place_posts_select_policy"
ON public.place_posts FOR SELECT
USING (
  status::text = 'approved'
  OR auth.uid() = user_id
  OR public.is_outera_admin()
);

DROP POLICY IF EXISTS "place_posts_insert_policy" ON public.place_posts;
CREATE POLICY "place_posts_insert_policy"
ON public.place_posts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "place_posts_update_policy" ON public.place_posts;
DROP POLICY IF EXISTS "Admins or authors can update posts" ON public.place_posts;
CREATE POLICY "place_posts_update_policy"
ON public.place_posts FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.is_outera_admin())
WITH CHECK (auth.uid() = user_id OR public.is_outera_admin());

DROP POLICY IF EXISTS "place_posts_delete_policy" ON public.place_posts;
DROP POLICY IF EXISTS "Authors or admins can delete posts" ON public.place_posts;
CREATE POLICY "place_posts_delete_policy"
ON public.place_posts FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.is_outera_admin());

-- -----------------------------------------------------------------------------
-- 5. RLS POLICIES FOR `place_post_images`
-- -----------------------------------------------------------------------------
GRANT SELECT ON TABLE public.place_post_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.place_post_images TO authenticated;
ALTER TABLE public.place_post_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_post_images_select_policy" ON public.place_post_images;
DROP POLICY IF EXISTS "Public can view approved post images or own" ON public.place_post_images;
DROP POLICY IF EXISTS "Anyone can view post images" ON public.place_post_images;
CREATE POLICY "place_post_images_select_policy"
ON public.place_post_images FOR SELECT
USING (true);

DROP POLICY IF EXISTS "place_post_images_insert_policy" ON public.place_post_images;
DROP POLICY IF EXISTS "Authors can insert post images" ON public.place_post_images;
CREATE POLICY "place_post_images_insert_policy"
ON public.place_post_images FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.place_posts p
    WHERE p.id = place_post_images.post_id
      AND (p.user_id = auth.uid() OR public.is_outera_admin())
  )
);

DROP POLICY IF EXISTS "place_post_images_delete_policy" ON public.place_post_images;
DROP POLICY IF EXISTS "Authors or admins can delete post images" ON public.place_post_images;
CREATE POLICY "place_post_images_delete_policy"
ON public.place_post_images FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_outera_admin()
  OR EXISTS (
    SELECT 1 FROM public.place_posts p
    WHERE p.id = place_post_images.post_id
      AND p.user_id = auth.uid()
  )
);

-- -----------------------------------------------------------------------------
-- 6. RLS POLICIES FOR `place_post_comments` & `place_post_helpful`
-- -----------------------------------------------------------------------------
GRANT SELECT ON TABLE public.place_post_comments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.place_post_comments TO authenticated;
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

GRANT SELECT ON TABLE public.place_post_helpful TO anon, authenticated;
GRANT INSERT, DELETE ON TABLE public.place_post_helpful TO authenticated;
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
-- 7. RLS POLICIES FOR `place_suggestions` (user_id),
--    `place_suggestion_images` (user_id), & `place_images` (place_id)
-- -----------------------------------------------------------------------------
GRANT SELECT ON TABLE public.place_suggestions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.place_suggestions TO authenticated;
ALTER TABLE public.place_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_suggestions_select_policy" ON public.place_suggestions;
DROP POLICY IF EXISTS "Public and users can view suggestions" ON public.place_suggestions;
CREATE POLICY "place_suggestions_select_policy"
ON public.place_suggestions FOR SELECT
USING (
  status::text = 'approved'
  OR auth.uid() = user_id
  OR public.is_outera_admin()
);

DROP POLICY IF EXISTS "place_suggestions_insert_policy" ON public.place_suggestions;
DROP POLICY IF EXISTS "Authenticated users can insert own suggestion" ON public.place_suggestions;
CREATE POLICY "place_suggestions_insert_policy"
ON public.place_suggestions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "place_suggestions_update_policy" ON public.place_suggestions;
DROP POLICY IF EXISTS "Users can update own pending suggestions or admins all" ON public.place_suggestions;
CREATE POLICY "place_suggestions_update_policy"
ON public.place_suggestions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.is_outera_admin())
WITH CHECK (auth.uid() = user_id OR public.is_outera_admin());

DROP POLICY IF EXISTS "place_suggestions_delete_policy" ON public.place_suggestions;
DROP POLICY IF EXISTS "Users can delete own pending suggestions or admins all" ON public.place_suggestions;
CREATE POLICY "place_suggestions_delete_policy"
ON public.place_suggestions FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.is_outera_admin());

GRANT SELECT ON TABLE public.place_suggestion_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.place_suggestion_images TO authenticated;
ALTER TABLE public.place_suggestion_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_suggestion_images_select_policy" ON public.place_suggestion_images;
DROP POLICY IF EXISTS "View approved or own suggestion images" ON public.place_suggestion_images;
CREATE POLICY "place_suggestion_images_select_policy"
ON public.place_suggestion_images FOR SELECT
USING (true);

DROP POLICY IF EXISTS "place_suggestion_images_insert_policy" ON public.place_suggestion_images;
DROP POLICY IF EXISTS "Authenticated users can insert own suggestion images" ON public.place_suggestion_images;
CREATE POLICY "place_suggestion_images_insert_policy"
ON public.place_suggestion_images FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.place_suggestions s
    WHERE s.id = place_suggestion_images.suggestion_id
      AND (s.user_id = auth.uid() OR public.is_outera_admin())
  )
);

DROP POLICY IF EXISTS "place_suggestion_images_delete_policy" ON public.place_suggestion_images;
DROP POLICY IF EXISTS "Owners or admins can delete suggestion images" ON public.place_suggestion_images;
CREATE POLICY "place_suggestion_images_delete_policy"
ON public.place_suggestion_images FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_outera_admin()
  OR EXISTS (
    SELECT 1 FROM public.place_suggestions s
    WHERE s.id = place_suggestion_images.suggestion_id
      AND s.user_id = auth.uid()
  )
);

GRANT SELECT ON TABLE public.place_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.place_images TO authenticated;
ALTER TABLE public.place_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_images_select_policy" ON public.place_images;
DROP POLICY IF EXISTS "Public can view place images" ON public.place_images;
CREATE POLICY "place_images_select_policy"
ON public.place_images FOR SELECT
USING (true);

DROP POLICY IF EXISTS "place_images_insert_policy" ON public.place_images;
DROP POLICY IF EXISTS "Admins can manage place images" ON public.place_images;
CREATE POLICY "place_images_insert_policy"
ON public.place_images FOR INSERT
TO authenticated
WITH CHECK (
  public.is_outera_admin()
  OR EXISTS (
    SELECT 1 FROM public.places pl
    WHERE pl.id = place_images.place_id
      AND pl.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "place_images_delete_policy" ON public.place_images;
CREATE POLICY "place_images_delete_policy"
ON public.place_images FOR DELETE
TO authenticated
USING (
  public.is_outera_admin()
  OR EXISTS (
    SELECT 1 FROM public.places pl
    WHERE pl.id = place_images.place_id
      AND pl.created_by = auth.uid()
  )
);

-- -----------------------------------------------------------------------------
-- 8. RLS POLICIES FOR `experiences` AND `reports`
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'experiences') THEN
    EXECUTE 'GRANT SELECT ON TABLE public.experiences TO anon, authenticated';
    EXECUTE 'GRANT INSERT, UPDATE, DELETE ON TABLE public.experiences TO authenticated';
    EXECUTE 'ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "experiences_delete_policy" ON public.experiences';
    EXECUTE 'CREATE POLICY "experiences_delete_policy" ON public.experiences FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_outera_admin())';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reports') THEN
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON TABLE public.reports TO authenticated';
    EXECUTE 'ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "reports_delete_policy" ON public.reports';
    EXECUTE 'CREATE POLICY "reports_delete_policy" ON public.reports FOR DELETE TO authenticated USING (auth.uid() = reporter_id OR public.is_outera_admin())';
  END IF;
END $$;

COMMIT;
