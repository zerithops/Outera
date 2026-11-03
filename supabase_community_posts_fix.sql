-- ==============================================================================
-- OUTERA: Community Posts, Direct Photo Storage, and Moderation RLS Policies
-- ==============================================================================

-- 1. Table Grants for authenticated and anonymous users
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.place_posts TO authenticated;
GRANT SELECT ON TABLE public.place_posts TO anon;

GRANT SELECT, INSERT, DELETE ON TABLE public.place_post_images TO authenticated;
GRANT SELECT ON TABLE public.place_post_images TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.place_post_comments TO authenticated;
GRANT SELECT ON TABLE public.place_post_comments TO anon;

-- 2. Verify or Create is_admin() Function
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

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- 3. Row Level Security for public.place_posts
ALTER TABLE public.place_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view approved posts" ON public.place_posts;
DROP POLICY IF EXISTS "Authors and admins can view any post" ON public.place_posts;
DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.place_posts;
DROP POLICY IF EXISTS "Admins can update any post" ON public.place_posts;
DROP POLICY IF EXISTS "Authors or admins can delete posts" ON public.place_posts;

-- Public / Authenticated read: Approved posts, own posts, or admin
CREATE POLICY "Public and users can view approved posts" ON public.place_posts
  FOR SELECT USING (
    status = 'approved' OR
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
    public.is_admin()
  );

-- Insert: Any authenticated user with valid auth.uid()
CREATE POLICY "Authenticated users can create posts" ON public.place_posts
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND auth.uid() = user_id
  );

-- Update: Admins can moderate any post, or author can update their pending post
CREATE POLICY "Admins or authors can update posts" ON public.place_posts
  FOR UPDATE USING (
    public.is_admin() OR
    (auth.uid() IS NOT NULL AND auth.uid() = user_id AND status = 'pending')
  );

-- Delete: Post author or Admin
CREATE POLICY "Authors or admins can delete posts" ON public.place_posts
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
    public.is_admin()
  );

-- 4. Row Level Security for public.place_post_images
ALTER TABLE public.place_post_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view post images" ON public.place_post_images;
DROP POLICY IF EXISTS "Authors can insert post images" ON public.place_post_images;
DROP POLICY IF EXISTS "Authors or admins can delete post images" ON public.place_post_images;

CREATE POLICY "Anyone can view post images" ON public.place_post_images
  FOR SELECT USING (true);

CREATE POLICY "Authors can insert post images" ON public.place_post_images
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND auth.uid() = user_id
  );

CREATE POLICY "Authors or admins can delete post images" ON public.place_post_images
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
    public.is_admin()
  );

-- 5. Row Level Security for public.place_post_comments
ALTER TABLE public.place_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view post comments" ON public.place_post_comments;
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON public.place_post_comments;
DROP POLICY IF EXISTS "Comment authors or admins can delete comments" ON public.place_post_comments;

CREATE POLICY "Anyone can view post comments" ON public.place_post_comments
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert comments" ON public.place_post_comments
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND auth.uid() = user_id
  );

CREATE POLICY "Comment authors or admins can delete comments" ON public.place_post_comments
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
    public.is_admin()
  );

-- 6. Storage Bucket 'community-review-media' Policies
-- Note: Ensure the bucket 'community-review-media' is set to public.
-- Allow anyone to read objects:
CREATE POLICY "Public media access" ON storage.objects
  FOR SELECT USING (bucket_id = 'community-review-media');

-- Allow authenticated users to upload their post photos:
CREATE POLICY "Authenticated users can upload review photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'community-review-media' AND
    auth.uid() IS NOT NULL
  );

-- Allow uploaders or admins to delete photos:
CREATE POLICY "Users or admins can delete photos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'community-review-media' AND
    (auth.uid() IS NOT NULL OR public.is_admin())
  );
