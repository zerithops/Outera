-- ==============================================================================
-- OUTERA — TRANSPORT & FARE INTELLIGENCE SYSTEM SCHEMA
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- 1. Create transport_routes table
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

ALTER TABLE public.transport_routes
  ADD COLUMN IF NOT EXISTS from_location text,
  ADD COLUMN IF NOT EXISTS to_location text;

-- 2. Create transport_fares table
CREATE TABLE IF NOT EXISTS public.transport_fares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  transport_type text NOT NULL,
  min_fare numeric(10, 2) NOT NULL,
  max_fare numeric(10, 2) NOT NULL,
  currency text DEFAULT 'BDT',
  fare_unit text DEFAULT 'per person',
  source_type text DEFAULT 'ESTIMATED', -- 'OFFICIAL', 'OPERATOR', 'COMMUNITY', 'ESTIMATED'
  source_reference text,
  confidence text DEFAULT 'Medium', -- 'High', 'Medium', 'Low'
  verified_at timestamptz,
  notes text,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Create fare_reports table (Community submissions)
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
  currency text DEFAULT 'BDT',
  trip_date date DEFAULT current_date,
  notes text,
  status text DEFAULT 'pending', -- 'pending', 'verified', 'rejected'
  created_at timestamptz DEFAULT now()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_fares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fare_reports ENABLE ROW LEVEL SECURITY;

-- 5. Table Grants
GRANT SELECT ON TABLE public.transport_routes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transport_routes TO authenticated;

GRANT SELECT ON TABLE public.transport_fares TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transport_fares TO authenticated;

GRANT SELECT, INSERT ON TABLE public.fare_reports TO anon, authenticated;
GRANT UPDATE, DELETE ON TABLE public.fare_reports TO authenticated;

-- 6. RLS Policies: transport_routes
DROP POLICY IF EXISTS "Public can view active transport routes" ON public.transport_routes;
CREATE POLICY "Public can view active transport routes"
ON public.transport_routes FOR SELECT
USING (active = true OR (auth.uid() IS NOT NULL AND public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage transport routes" ON public.transport_routes;
CREATE POLICY "Admins can manage transport routes"
ON public.transport_routes FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 7. RLS Policies: transport_fares
DROP POLICY IF EXISTS "Public can view active transport fares" ON public.transport_fares;
CREATE POLICY "Public can view active transport fares"
ON public.transport_fares FOR SELECT
USING (is_archived = false OR (auth.uid() IS NOT NULL AND public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage transport fares" ON public.transport_fares;
CREATE POLICY "Admins can manage transport fares"
ON public.transport_fares FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 8. RLS Policies: fare_reports
DROP POLICY IF EXISTS "Public can view verified fare reports" ON public.fare_reports;
CREATE POLICY "Public can view verified fare reports"
ON public.fare_reports FOR SELECT
USING (status = 'verified' OR auth.uid() = user_id OR (auth.uid() IS NOT NULL AND public.is_admin()));

DROP POLICY IF EXISTS "Users can insert fare reports" ON public.fare_reports;
CREATE POLICY "Users can insert fare reports"
ON public.fare_reports FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can moderate fare reports" ON public.fare_reports;
CREATE POLICY "Admins can moderate fare reports"
ON public.fare_reports FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete fare reports" ON public.fare_reports;
CREATE POLICY "Admins can delete fare reports"
ON public.fare_reports FOR DELETE
TO authenticated
USING (public.is_admin());

-- 9. Indexes for lightning-fast route lookups
CREATE INDEX IF NOT EXISTS idx_transport_routes_origin_dest ON public.transport_routes (origin_district, destination_district);
CREATE INDEX IF NOT EXISTS idx_transport_routes_place ON public.transport_routes (destination_place_id);
CREATE INDEX IF NOT EXISTS idx_transport_fares_route_id ON public.transport_fares (route_id);
CREATE INDEX IF NOT EXISTS idx_fare_reports_dest ON public.fare_reports (destination, destination_place_id);
