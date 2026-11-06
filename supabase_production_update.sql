-- ==============================================================================
-- OUTERA — FINAL COMMUNITY + TOURIST + SUGGEST A PLACE PRODUCTION SQL UPDATE
-- Safe, idempotent migration tailored to existing OUTERA Supabase schema.
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADMIN ROLE HELPER & ROLE ESCALATION PROTECTION
-- ------------------------------------------------------------------------------
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

-- Prevent non-admin users from modifying their own role in public.profiles
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_escalation();

-- ------------------------------------------------------------------------------
-- 2. EXTEND public.places & public.place_images (REUSE EXISTING TABLES)
-- ------------------------------------------------------------------------------
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS upazila text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS why_worth_visiting text,
  ADD COLUMN IF NOT EXISTS best_time text,
  ADD COLUMN IF NOT EXISTS suitable_for text[],
  ADD COLUMN IF NOT EXISTS crowd_level text,
  ADD COLUMN IF NOT EXISTS scout_attribution_name text,
  ADD COLUMN IF NOT EXISTS scout_attribution_handle text;

ALTER TABLE public.place_images
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS display_order smallint DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false;

GRANT SELECT ON TABLE public.places TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.places TO authenticated;
GRANT SELECT ON TABLE public.place_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.place_images TO authenticated;

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view approved places" ON public.places;
CREATE POLICY "Public can view approved places"
ON public.places FOR SELECT
USING (status = 'approved' OR status IS NULL OR public.is_admin() OR auth.uid() = created_by);

DROP POLICY IF EXISTS "Admins can insert places" ON public.places;
CREATE POLICY "Admins can insert places"
ON public.places FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update places" ON public.places;
CREATE POLICY "Admins can update places"
ON public.places FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can view place images" ON public.place_images;
CREATE POLICY "Public can view place images"
ON public.place_images FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage place images" ON public.place_images;
CREATE POLICY "Admins can manage place images"
ON public.place_images FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 3. EXTEND public.place_suggestions & CREATE public.place_suggestion_images
-- Reuses existing ownership column `user_id` and `name`
-- ------------------------------------------------------------------------------
ALTER TABLE public.place_suggestions
  ADD COLUMN IF NOT EXISTS place_name text,
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS upazila text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS why_worth_visiting text,
  ADD COLUMN IF NOT EXISTS estimated_budget_min integer,
  ADD COLUMN IF NOT EXISTS estimated_budget_max integer,
  ADD COLUMN IF NOT EXISTS best_time text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_note text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Keep `name` and `place_name` synchronized automatically
CREATE OR REPLACE FUNCTION public.sync_suggestion_place_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.place_name IS NULL AND NEW.name IS NOT NULL THEN
    NEW.place_name := NEW.name;
  ELSIF NEW.name IS NULL AND NEW.place_name IS NOT NULL THEN
    NEW.name := NEW.place_name;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_suggestion_place_name ON public.place_suggestions;
CREATE TRIGGER trg_sync_suggestion_place_name
BEFORE INSERT OR UPDATE ON public.place_suggestions
FOR EACH ROW
EXECUTE FUNCTION public.sync_suggestion_place_name();

-- Prevent non-admins from approving/rejecting their own suggestion
CREATE OR REPLACE FUNCTION public.enforce_suggestion_status_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_admin() THEN
      NEW.status := 'pending';
      NEW.reviewed_by := NULL;
      NEW.reviewed_at := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Only administrators can change suggestion moderation status.';
      END IF;
      NEW.reviewed_by := OLD.reviewed_by;
      NEW.reviewed_at := OLD.reviewed_at;
      NEW.moderation_note := OLD.moderation_note;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_suggestion_status_security ON public.place_suggestions;
CREATE TRIGGER trg_enforce_suggestion_status_security
BEFORE INSERT OR UPDATE ON public.place_suggestions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_suggestion_status_security();

GRANT SELECT ON TABLE public.place_suggestions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.place_suggestions TO authenticated;

ALTER TABLE public.place_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public and users can view suggestions" ON public.place_suggestions;
DROP POLICY IF EXISTS "Users can view own suggestions" ON public.place_suggestions;
CREATE POLICY "Public and users can view suggestions"
ON public.place_suggestions FOR SELECT
USING (
  status::text = 'approved' OR
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
  public.is_admin()
);

DROP POLICY IF EXISTS "Authenticated users can insert own suggestion" ON public.place_suggestions;
CREATE POLICY "Authenticated users can insert own suggestion"
ON public.place_suggestions FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

DROP POLICY IF EXISTS "Admins can update place suggestions" ON public.place_suggestions;
DROP POLICY IF EXISTS "Users can update own pending suggestions or admins all" ON public.place_suggestions;
CREATE POLICY "Users can update own pending suggestions or admins all"
ON public.place_suggestions FOR UPDATE
TO authenticated
USING (
  public.is_admin() OR
  (auth.uid() IS NOT NULL AND auth.uid() = user_id AND status::text = 'pending')
)
WITH CHECK (
  public.is_admin() OR
  (auth.uid() IS NOT NULL AND auth.uid() = user_id AND status::text = 'pending')
);

DROP POLICY IF EXISTS "Admins can delete place suggestions" ON public.place_suggestions;
DROP POLICY IF EXISTS "Users can delete own pending suggestions or admins all" ON public.place_suggestions;
CREATE POLICY "Users can delete own pending suggestions or admins all"
ON public.place_suggestions FOR DELETE
TO authenticated
USING (
  public.is_admin() OR
  (auth.uid() IS NOT NULL AND auth.uid() = user_id AND status::text = 'pending')
);

-- Create place_suggestion_images table (Max 2 images per suggestion)
CREATE TABLE IF NOT EXISTS public.place_suggestion_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES public.place_suggestions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  display_order smallint NOT NULL DEFAULT 1 CHECK (display_order IN (1, 2)),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.enforce_max_two_suggestion_images()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  img_count integer;
  owner_id uuid;
BEGIN
  SELECT user_id INTO owner_id FROM public.place_suggestions WHERE id = NEW.suggestion_id;
  IF owner_id IS NULL OR (owner_id <> NEW.user_id AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'You can only upload images to your own place suggestion.';
  END IF;

  SELECT count(*) INTO img_count
  FROM public.place_suggestion_images
  WHERE suggestion_id = NEW.suggestion_id;

  IF img_count >= 2 THEN
    RAISE EXCEPTION 'Maximum of 2 photos allowed per place suggestion.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_max_two_suggestion_images ON public.place_suggestion_images;
CREATE TRIGGER trg_max_two_suggestion_images
BEFORE INSERT ON public.place_suggestion_images
FOR EACH ROW
EXECUTE FUNCTION public.enforce_max_two_suggestion_images();

GRANT SELECT ON TABLE public.place_suggestion_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.place_suggestion_images TO authenticated;

ALTER TABLE public.place_suggestion_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View approved or own suggestion images" ON public.place_suggestion_images;
CREATE POLICY "View approved or own suggestion images"
ON public.place_suggestion_images FOR SELECT
USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
  public.is_admin() OR
  EXISTS (
    SELECT 1 FROM public.place_suggestions ps
    WHERE ps.id = place_suggestion_images.suggestion_id
      AND ps.status::text = 'approved'
  )
);

DROP POLICY IF EXISTS "Authenticated users can insert own suggestion images" ON public.place_suggestion_images;
CREATE POLICY "Authenticated users can insert own suggestion images"
ON public.place_suggestion_images FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

DROP POLICY IF EXISTS "Owners or admins can delete suggestion images" ON public.place_suggestion_images;
CREATE POLICY "Owners or admins can delete suggestion images"
ON public.place_suggestion_images FOR DELETE
TO authenticated
USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
  public.is_admin()
);

-- ------------------------------------------------------------------------------
-- 4. COMMUNITY POSTS, MAX 2 PHOTOS, HELPFUL & COMMENTS
-- ------------------------------------------------------------------------------
-- Enforce 1 community post/review per user per place (deduplicate any existing duplicates first if any)
CREATE UNIQUE INDEX IF NOT EXISTS idx_place_posts_one_per_user_place
ON public.place_posts (place_id, user_id);

-- Add display_order (1 or 2) and is_primary to place_post_images
ALTER TABLE public.place_post_images
  ADD COLUMN IF NOT EXISTS display_order smallint DEFAULT 1 CHECK (display_order IN (1, 2)),
  ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false;

-- Trigger to enforce maximum 2 photos per community post & parent ownership
CREATE OR REPLACE FUNCTION public.enforce_max_two_post_images()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  img_count integer;
  post_owner uuid;
BEGIN
  SELECT user_id INTO post_owner FROM public.place_posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner <> NEW.user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'You can only attach photos to your own community post.';
  END IF;

  SELECT count(*) INTO img_count
  FROM public.place_post_images
  WHERE post_id = NEW.post_id;

  IF img_count >= 2 THEN
    RAISE EXCEPTION 'Maximum of 2 photos allowed per community post.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_max_two_post_images ON public.place_post_images;
CREATE TRIGGER trg_max_two_post_images
BEFORE INSERT ON public.place_post_images
FOR EACH ROW
EXECUTE FUNCTION public.enforce_max_two_post_images();

-- RLS on place_post_images: Only approved post photos are public; pending/rejected stay hidden
ALTER TABLE public.place_post_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view post images" ON public.place_post_images;
DROP POLICY IF EXISTS "Public can view approved post images or own" ON public.place_post_images;
CREATE POLICY "Public can view approved post images or own"
ON public.place_post_images FOR SELECT
USING (
  (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
  public.is_admin() OR
  EXISTS (
    SELECT 1 FROM public.place_posts pp
    WHERE pp.id = place_post_images.post_id
      AND pp.status::text = 'approved'
  )
);

-- RLS on place_post_helpful
GRANT SELECT ON TABLE public.place_post_helpful TO anon, authenticated;
GRANT INSERT, DELETE ON TABLE public.place_post_helpful TO authenticated;
ALTER TABLE public.place_post_helpful ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view post helpful votes" ON public.place_post_helpful;
CREATE POLICY "Anyone can view post helpful votes"
ON public.place_post_helpful FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Authenticated users can mark helpful" ON public.place_post_helpful;
CREATE POLICY "Authenticated users can mark helpful"
ON public.place_post_helpful FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove own helpful vote" ON public.place_post_helpful;
CREATE POLICY "Users can remove own helpful vote"
ON public.place_post_helpful FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Extend reports table to support post_id
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS post_id uuid REFERENCES public.place_posts(id) ON DELETE CASCADE;

GRANT SELECT, INSERT ON TABLE public.reports TO authenticated;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can submit reports" ON public.reports;
CREATE POLICY "Authenticated users can submit reports"
ON public.reports FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can view and manage reports" ON public.reports;
CREATE POLICY "Admins can view and manage reports"
ON public.reports FOR ALL
TO authenticated
USING (public.is_admin() OR auth.uid() = reporter_id);

-- ------------------------------------------------------------------------------
-- 5. TOURIST INFORMATION TABLES
-- (transport_routes, transport_fares, fare_reports, local_transport_contacts,
--  place_nearby_services, nearby_service_reviews)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transport_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_district text NOT NULL,
  destination_district text NOT NULL,
  destination_place_id text,
  destination_place_name text,
  from_location text,
  to_location text,
  transport_type text NOT NULL,
  distance_km double precision,
  estimated_duration_min integer NOT NULL,
  is_multi_leg boolean DEFAULT false,
  legs jsonb,
  notes text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transport_fares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  transport_type text NOT NULL,
  min_fare numeric(10, 2) NOT NULL,
  max_fare numeric(10, 2) NOT NULL,
  currency text DEFAULT 'BDT',
  fare_unit text DEFAULT 'per person',
  source_type text DEFAULT 'ESTIMATED',
  source_reference text,
  confidence text DEFAULT 'Medium',
  verified_at timestamptz,
  notes text,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fare_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  author_handle text,
  origin text NOT NULL,
  destination text NOT NULL,
  destination_place_id text,
  destination_place_name text,
  transport_type text NOT NULL,
  fare_paid numeric(10, 2) NOT NULL,
  fare_unit text DEFAULT 'per person',
  currency text DEFAULT 'BDT',
  trip_date date DEFAULT current_date,
  notes text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.local_transport_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text,
  district text NOT NULL,
  division text,
  vehicle_type text NOT NULL, -- 'CNG/Auto', 'Rickshaw', 'Easy Bike/E-Rickshaw', 'Car', 'Boat/Launch', 'Other'
  operator_name text NOT NULL,
  service_area text NOT NULL,
  phone text,
  whatsapp text,
  contact_permission boolean DEFAULT false,
  rate_note text,
  is_contact_verified boolean DEFAULT false,
  is_outera_verified boolean DEFAULT false,
  is_community_recommended boolean DEFAULT false,
  last_verified_at timestamptz,
  status text DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'hidden'
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.place_nearby_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text,
  district text NOT NULL,
  division text,
  service_category text NOT NULL CHECK (service_category IN ('stay', 'eat')),
  service_type text NOT NULL, -- Hotel, Resort, Guest House, Hostel, Homestay | Restaurant, Cafe, Street Food, Family Restaurant, Local Food
  name text NOT NULL,
  food_specialty text,
  address text,
  latitude double precision,
  longitude double precision,
  distance_km double precision,
  price_min integer,
  price_max integer,
  price_range_label text,
  contact_phone text,
  contact_permission boolean DEFAULT false,
  community_confidence text DEFAULT 'Insufficient Data', -- 'High', 'Medium', 'Limited', 'Insufficient Data'
  is_verified boolean DEFAULT false,
  visitor_reports_count integer DEFAULT 0,
  status text DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'hidden'
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nearby_service_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.place_nearby_services(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  price_paid integer,
  status text DEFAULT 'approved',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS & Grants for Tourist Tables
ALTER TABLE public.transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_fares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fare_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_transport_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_nearby_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nearby_service_reviews ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.transport_routes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.transport_routes TO authenticated;

GRANT SELECT ON TABLE public.transport_fares TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.transport_fares TO authenticated;

GRANT SELECT ON TABLE public.fare_reports TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.fare_reports TO authenticated;

GRANT SELECT ON TABLE public.local_transport_contacts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.local_transport_contacts TO authenticated;

GRANT SELECT ON TABLE public.place_nearby_services TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.place_nearby_services TO authenticated;

GRANT SELECT ON TABLE public.nearby_service_reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.nearby_service_reviews TO authenticated;

DROP POLICY IF EXISTS "Public view active transport routes" ON public.transport_routes;
CREATE POLICY "Public view active transport routes"
ON public.transport_routes FOR SELECT
USING (active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage transport routes" ON public.transport_routes;
CREATE POLICY "Admins manage transport routes"
ON public.transport_routes FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public view active transport fares" ON public.transport_fares;
CREATE POLICY "Public view active transport fares"
ON public.transport_fares FOR SELECT
USING (is_archived = false OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage transport fares" ON public.transport_fares;
CREATE POLICY "Admins manage transport fares"
ON public.transport_fares FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public view verified fare reports" ON public.fare_reports;
CREATE POLICY "Public view verified fare reports"
ON public.fare_reports FOR SELECT
USING (status = 'verified' OR auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Authenticated insert fare reports" ON public.fare_reports;
CREATE POLICY "Authenticated insert fare reports"
ON public.fare_reports FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins manage fare reports" ON public.fare_reports;
CREATE POLICY "Admins manage fare reports"
ON public.fare_reports FOR UPDATE TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public view approved local transport contacts" ON public.local_transport_contacts;
CREATE POLICY "Public view approved local transport contacts"
ON public.local_transport_contacts FOR SELECT
USING (status = 'approved' OR auth.uid() = submitted_by OR public.is_admin());

DROP POLICY IF EXISTS "Authenticated suggest local transport contacts" ON public.local_transport_contacts;
CREATE POLICY "Authenticated suggest local transport contacts"
ON public.local_transport_contacts FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = submitted_by);

DROP POLICY IF EXISTS "Admins manage local transport contacts" ON public.local_transport_contacts;
CREATE POLICY "Admins manage local transport contacts"
ON public.local_transport_contacts FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public view approved nearby services" ON public.place_nearby_services;
CREATE POLICY "Public view approved nearby services"
ON public.place_nearby_services FOR SELECT
USING (status = 'approved' OR auth.uid() = submitted_by OR public.is_admin());

DROP POLICY IF EXISTS "Authenticated suggest nearby services" ON public.place_nearby_services;
CREATE POLICY "Authenticated suggest nearby services"
ON public.place_nearby_services FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = submitted_by);

DROP POLICY IF EXISTS "Admins manage nearby services" ON public.place_nearby_services;
CREATE POLICY "Admins manage nearby services"
ON public.place_nearby_services FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public view approved nearby service reviews" ON public.nearby_service_reviews;
CREATE POLICY "Public view approved nearby service reviews"
ON public.nearby_service_reviews FOR SELECT
USING (status = 'approved' OR auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Authenticated insert nearby service reviews" ON public.nearby_service_reviews;
CREATE POLICY "Authenticated insert nearby service reviews"
ON public.nearby_service_reviews FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 6. SUPABASE STORAGE BUCKET & POLICIES ('community-review-media')
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-review-media',
  'community-review-media',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Public media access" ON storage.objects;
DROP POLICY IF EXISTS "Approved or own community media read access" ON storage.objects;
CREATE POLICY "Approved or own community media read access"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'community-review-media' AND (
    public.is_admin() OR
    (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::text) OR
    (auth.uid() IS NOT NULL AND (storage.foldername(name))[2] = auth.uid()::text) OR
    EXISTS (
      SELECT 1 FROM public.place_post_images ppi
      JOIN public.place_posts pp ON pp.id = ppi.post_id
      WHERE ppi.storage_path = storage.objects.name
        AND pp.status::text = 'approved'
    ) OR
    EXISTS (
      SELECT 1 FROM public.place_suggestion_images psi
      JOIN public.place_suggestions ps ON ps.id = psi.suggestion_id
      WHERE psi.storage_path = storage.objects.name
        AND ps.status::text = 'approved'
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can upload review photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload review photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'community-review-media' AND
  auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "Users or admins can delete photos" ON storage.objects;
CREATE POLICY "Users or admins can delete photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'community-review-media' AND
  (
    public.is_admin() OR
    (storage.foldername(name))[1] = auth.uid()::text OR
    (storage.foldername(name))[2] = auth.uid()::text
  )
);
