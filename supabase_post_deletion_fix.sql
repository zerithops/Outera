-- ==============================================================================
-- OUTERA — COMPLETE POST DELETION, STATUS MODERATION & RLS REPAIR
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- 1. Ensure `deleted_at` column exists on `public.place_posts` for soft-deletion support
ALTER TABLE public.place_posts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. Verify or Create is_admin() and is_outera_admin() functions (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_outera_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role::text IN ('admin', 'moderator')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_outera_admin() TO authenticated, anon;

-- 3. Table Permissions (Grants)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.place_posts TO authenticated;
GRANT SELECT ON TABLE public.place_posts TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.place_post_images TO authenticated;
GRANT SELECT ON TABLE public.place_post_images TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.place_post_comments TO authenticated;
GRANT SELECT ON TABLE public.place_post_comments TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.place_post_helpful TO authenticated;
GRANT SELECT ON TABLE public.place_post_helpful TO anon;

-- 4. Ensure foreign keys on child tables have ON DELETE CASCADE so post deletions never fail
DO $$
BEGIN
  -- place_post_images cascade
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'place_post_images'
  ) THEN
    ALTER TABLE public.place_post_images
      DROP CONSTRAINT IF EXISTS place_post_images_post_id_fkey,
      ADD CONSTRAINT place_post_images_post_id_fkey
        FOREIGN KEY (post_id) REFERENCES public.place_posts(id) ON DELETE CASCADE;
  END IF;

  -- place_post_comments cascade
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'place_post_comments'
  ) THEN
    ALTER TABLE public.place_post_comments
      DROP CONSTRAINT IF EXISTS place_post_comments_post_id_fkey,
      ADD CONSTRAINT place_post_comments_post_id_fkey
        FOREIGN KEY (post_id) REFERENCES public.place_posts(id) ON DELETE CASCADE;
  END IF;

  -- place_post_helpful cascade
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'place_post_helpful'
  ) THEN
    ALTER TABLE public.place_post_helpful
      DROP CONSTRAINT IF EXISTS place_post_helpful_post_id_fkey,
      ADD CONSTRAINT place_post_helpful_post_id_fkey
        FOREIGN KEY (post_id) REFERENCES public.place_posts(id) ON DELETE CASCADE;
  END IF;

  -- reports cascade
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'post_id'
  ) THEN
    ALTER TABLE public.reports
      DROP CONSTRAINT IF EXISTS reports_post_id_fkey,
      ADD CONSTRAINT reports_post_id_fkey
        FOREIGN KEY (post_id) REFERENCES public.place_posts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5. Row Level Security for `public.place_posts`
ALTER TABLE public.place_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public and users can view approved posts" ON public.place_posts;
DROP POLICY IF EXISTS "place_posts_select_policy" ON public.place_posts;
DROP POLICY IF EXISTS "Public can view approved posts" ON public.place_posts;
DROP POLICY IF EXISTS "Authors and admins can view any post" ON public.place_posts;

CREATE POLICY "place_posts_select_policy"
ON public.place_posts FOR SELECT
USING (
  (status = 'approved' AND deleted_at IS NULL)
  OR (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  OR public.is_admin()
  OR public.is_outera_admin()
);

DROP POLICY IF EXISTS "place_posts_insert_policy" ON public.place_posts;
DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.place_posts;

CREATE POLICY "place_posts_insert_policy"
ON public.place_posts FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

DROP POLICY IF EXISTS "place_posts_update_policy" ON public.place_posts;
DROP POLICY IF EXISTS "Admins or authors can update posts" ON public.place_posts;

CREATE POLICY "place_posts_update_policy"
ON public.place_posts FOR UPDATE
TO authenticated
USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  OR public.is_admin()
  OR public.is_outera_admin()
)
WITH CHECK (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  OR public.is_admin()
  OR public.is_outera_admin()
);

DROP POLICY IF EXISTS "place_posts_delete_policy" ON public.place_posts;
DROP POLICY IF EXISTS "Authors or admins can delete posts" ON public.place_posts;

CREATE POLICY "place_posts_delete_policy"
ON public.place_posts FOR DELETE
TO authenticated
USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  OR public.is_admin()
  OR public.is_outera_admin()
);

-- 6. Row Level Security for Child Tables
-- place_post_images
ALTER TABLE public.place_post_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "place_post_images_select_policy" ON public.place_post_images;
DROP POLICY IF EXISTS "Anyone can view post images" ON public.place_post_images;
CREATE POLICY "place_post_images_select_policy"
ON public.place_post_images FOR SELECT USING (true);

DROP POLICY IF EXISTS "place_post_images_delete_policy" ON public.place_post_images;
DROP POLICY IF EXISTS "Authors or admins can delete post images" ON public.place_post_images;
CREATE POLICY "place_post_images_delete_policy"
ON public.place_post_images FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_admin()
  OR public.is_outera_admin()
  OR EXISTS (
    SELECT 1 FROM public.place_posts p
    WHERE p.id = place_post_images.post_id
      AND p.user_id = auth.uid()
  )
);

-- place_post_comments
ALTER TABLE public.place_post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "place_post_comments_select_policy" ON public.place_post_comments;
DROP POLICY IF EXISTS "Anyone can view post comments" ON public.place_post_comments;
CREATE POLICY "place_post_comments_select_policy"
ON public.place_post_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "place_post_comments_delete_policy" ON public.place_post_comments;
DROP POLICY IF EXISTS "Comment authors or admins can delete comments" ON public.place_post_comments;
CREATE POLICY "place_post_comments_delete_policy"
ON public.place_post_comments FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_admin()
  OR public.is_outera_admin()
  OR EXISTS (
    SELECT 1 FROM public.place_posts p
    WHERE p.id = place_post_comments.post_id
      AND p.user_id = auth.uid()
  )
);

-- place_post_helpful
ALTER TABLE public.place_post_helpful ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "place_post_helpful_select_policy" ON public.place_post_helpful;
CREATE POLICY "place_post_helpful_select_policy"
ON public.place_post_helpful FOR SELECT USING (true);

DROP POLICY IF EXISTS "place_post_helpful_delete_policy" ON public.place_post_helpful;
CREATE POLICY "place_post_helpful_delete_policy"
ON public.place_post_helpful FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_admin()
  OR public.is_outera_admin()
  OR EXISTS (
    SELECT 1 FROM public.place_posts p
    WHERE p.id = place_post_helpful.post_id
      AND p.user_id = auth.uid()
  )
);

-- 7. Atomic RPC for 100% Reliable Deletion
-- Deletes images, comments, helpful, reports, and the post record in one atomic transaction
CREATE OR REPLACE FUNCTION public.delete_post_completely(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_is_adm boolean;
BEGIN
  SELECT user_id INTO v_owner FROM public.place_posts WHERE id = p_post_id;
  IF v_owner IS NULL THEN
    RETURN true; -- Already deleted
  END IF;

  v_is_adm := public.is_admin() OR public.is_outera_admin();
  IF auth.uid() <> v_owner AND NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: only author or admin can delete post';
  END IF;

  DELETE FROM public.place_post_images WHERE post_id = p_post_id;
  DELETE FROM public.place_post_comments WHERE post_id = p_post_id;
  DELETE FROM public.place_post_helpful WHERE post_id = p_post_id;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'post_id') THEN
    DELETE FROM public.reports WHERE post_id = p_post_id;
  END IF;
  DELETE FROM public.place_posts WHERE id = p_post_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_post_completely(uuid) TO authenticated;

-- 8. Add `place_posts` to Supabase Realtime publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.place_posts;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
