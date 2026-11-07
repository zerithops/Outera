-- ==============================================================================
-- OUTERA — SMART TRAVEL PLANNING SYSTEM SCHEMA MIGRATION
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- Safely creates tables, columns, indexes, triggers, and RLS policies for:
--   1. public.trip_plans
--   2. public.trip_stops
--   3. public.trip_checklist_items
--   4. public.trip_members
--   5. public.trip_expenses
--   6. public.tourist_emergency_contacts
-- ==============================================================================

-- 0. Ensure helper updated_at trigger function exists
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. Create trip_plans table
CREATE TABLE IF NOT EXISTS public.trip_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_name text,
  owner_handle text,
  title text NOT NULL,
  origin_name text NOT NULL,
  origin_district text NOT NULL,
  origin_lat double precision,
  origin_lng double precision,
  destination_division text NOT NULL,
  destination_district text NOT NULL,
  destination_area text,
  start_date date NOT NULL DEFAULT current_date,
  duration_days integer NOT NULL DEFAULT 3 CHECK (duration_days >= 1 AND duration_days <= 30),
  travelers_count integer NOT NULL DEFAULT 2 CHECK (travelers_count >= 1 AND travelers_count <= 100),
  total_budget_bdt numeric(12, 2) NOT NULL DEFAULT 10000 CHECK (total_budget_bdt >= 0),
  preferences text[] DEFAULT '{}',
  selected_transport_id text,
  selected_stay_id text,
  round_trip_transport boolean DEFAULT true,
  custom_budget_overrides jsonb DEFAULT '{}'::jsonb,
  is_public_shared boolean DEFAULT true,
  share_token text UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Create trip_stops table (Day-by-day itinerary stops linked to actual OUTERA places)
CREATE TABLE IF NOT EXISTS public.trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trip_plans(id) ON DELETE CASCADE,
  place_id text NOT NULL,
  place_name text NOT NULL,
  place_category text,
  place_district text,
  place_neighborhood text,
  lat double precision,
  lng double precision,
  day_number integer NOT NULL DEFAULT 1 CHECK (day_number >= 1 AND day_number <= 30),
  stop_order integer NOT NULL DEFAULT 0,
  time_slot text NOT NULL DEFAULT 'Morning', -- 'Morning', 'Afternoon', 'Evening'
  estimated_spend_min numeric(10, 2) DEFAULT 0,
  estimated_spend_max numeric(10, 2) DEFAULT 0,
  price_source_label text DEFAULT 'Database Range',
  custom_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Create trip_checklist_items table
CREATE TABLE IF NOT EXISTS public.trip_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trip_plans(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'Essentials',
  label text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Create trip_members table (Group trip participants)
CREATE TABLE IF NOT EXISTS public.trip_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trip_plans(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  handle_or_contact text,
  role text NOT NULL DEFAULT 'Member', -- 'Organizer', 'Member'
  created_at timestamptz DEFAULT now()
);

-- 5. Create trip_expenses table (Group member expense contributions)
CREATE TABLE IF NOT EXISTS public.trip_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trip_plans(id) ON DELETE CASCADE,
  paid_by_member_id uuid REFERENCES public.trip_members(id) ON DELETE SET NULL,
  paid_by_name text NOT NULL,
  category text NOT NULL DEFAULT 'Transport', -- 'Transport', 'Hotel/Resort', 'Food', 'Entry Tickets', 'Local Transport', 'Other'
  title text NOT NULL,
  amount_bdt numeric(12, 2) NOT NULL CHECK (amount_bdt >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expense_date date DEFAULT current_date,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 6. Create tourist_emergency_contacts table (Verified hospitals, police stations, tourist police)
CREATE TABLE IF NOT EXISTS public.tourist_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division text NOT NULL,
  district text NOT NULL,
  category text NOT NULL, -- 'Emergency Hotline', 'Tourist Police', 'Hospital', 'Police Station', 'Tourist Assistance'
  name text NOT NULL,
  phone text NOT NULL,
  secondary_phone text,
  address text NOT NULL,
  latitude double precision,
  longitude double precision,
  source_name text NOT NULL,
  verified boolean DEFAULT true,
  last_updated date NOT NULL DEFAULT current_date,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trip_plans_user_id ON public.trip_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_plans_share_token ON public.trip_plans(share_token);
CREATE INDEX IF NOT EXISTS idx_trip_plans_dest_district ON public.trip_plans(destination_district);
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip_id ON public.trip_stops(trip_id, day_number, stop_order);
CREATE INDEX IF NOT EXISTS idx_trip_checklist_trip_id ON public.trip_checklist_items(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_trip_id ON public.trip_members(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_expenses_trip_id ON public.trip_expenses(trip_id);
CREATE INDEX IF NOT EXISTS idx_tourist_emergency_district ON public.tourist_emergency_contacts(district, division);

-- 8. Triggers for updated_at
DROP TRIGGER IF EXISTS trg_trip_plans_updated_at ON public.trip_plans;
CREATE TRIGGER trg_trip_plans_updated_at
BEFORE UPDATE ON public.trip_plans
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_trip_stops_updated_at ON public.trip_stops;
CREATE TRIGGER trg_trip_stops_updated_at
BEFORE UPDATE ON public.trip_stops
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_trip_checklist_updated_at ON public.trip_checklist_items;
CREATE TRIGGER trg_trip_checklist_updated_at
BEFORE UPDATE ON public.trip_checklist_items
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 9. Enable Row Level Security (RLS)
ALTER TABLE public.trip_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tourist_emergency_contacts ENABLE ROW LEVEL SECURITY;

-- 10. Table Grants
GRANT SELECT ON TABLE public.trip_plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.trip_plans TO authenticated;

GRANT SELECT ON TABLE public.trip_stops TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.trip_stops TO authenticated;

GRANT SELECT ON TABLE public.trip_checklist_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.trip_checklist_items TO authenticated;

GRANT SELECT ON TABLE public.trip_members TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.trip_members TO authenticated;

GRANT SELECT ON TABLE public.trip_expenses TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.trip_expenses TO authenticated;

GRANT SELECT ON TABLE public.tourist_emergency_contacts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.tourist_emergency_contacts TO authenticated;

-- 11. RLS Policies for trip_plans
DROP POLICY IF EXISTS "trip_plans_select_policy" ON public.trip_plans;
CREATE POLICY "trip_plans_select_policy"
ON public.trip_plans FOR SELECT
USING (
  is_public_shared = true
  OR (auth.uid() IS NOT NULL AND auth.uid() = user_id)
);

DROP POLICY IF EXISTS "trip_plans_insert_policy" ON public.trip_plans;
CREATE POLICY "trip_plans_insert_policy"
ON public.trip_plans FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "trip_plans_update_policy" ON public.trip_plans;
CREATE POLICY "trip_plans_update_policy"
ON public.trip_plans FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "trip_plans_delete_policy" ON public.trip_plans;
CREATE POLICY "trip_plans_delete_policy"
ON public.trip_plans FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 12. RLS Policies for child tables (trip_stops, trip_checklist_items, trip_members, trip_expenses)
DROP POLICY IF EXISTS "trip_stops_select_policy" ON public.trip_stops;
CREATE POLICY "trip_stops_select_policy"
ON public.trip_stops FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_stops.trip_id
      AND (tp.is_public_shared = true OR tp.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "trip_stops_write_policy" ON public.trip_stops;
CREATE POLICY "trip_stops_write_policy"
ON public.trip_stops FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_stops.trip_id
      AND tp.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_stops.trip_id
      AND tp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "trip_checklist_select_policy" ON public.trip_checklist_items;
CREATE POLICY "trip_checklist_select_policy"
ON public.trip_checklist_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_checklist_items.trip_id
      AND (tp.is_public_shared = true OR tp.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "trip_checklist_write_policy" ON public.trip_checklist_items;
CREATE POLICY "trip_checklist_write_policy"
ON public.trip_checklist_items FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_checklist_items.trip_id
      AND tp.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_checklist_items.trip_id
      AND tp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "trip_members_select_policy" ON public.trip_members;
CREATE POLICY "trip_members_select_policy"
ON public.trip_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_members.trip_id
      AND (tp.is_public_shared = true OR tp.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "trip_members_write_policy" ON public.trip_members;
CREATE POLICY "trip_members_write_policy"
ON public.trip_members FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_members.trip_id
      AND (tp.is_public_shared = true OR tp.user_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_members.trip_id
      AND (tp.is_public_shared = true OR tp.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "trip_expenses_select_policy" ON public.trip_expenses;
CREATE POLICY "trip_expenses_select_policy"
ON public.trip_expenses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_expenses.trip_id
      AND (tp.is_public_shared = true OR tp.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "trip_expenses_write_policy" ON public.trip_expenses;
CREATE POLICY "trip_expenses_write_policy"
ON public.trip_expenses FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_expenses.trip_id
      AND (tp.is_public_shared = true OR tp.user_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_expenses.trip_id
      AND (tp.is_public_shared = true OR tp.user_id = auth.uid())
  )
);

-- 13. RLS Policies for tourist_emergency_contacts
DROP POLICY IF EXISTS "tourist_emergency_select_policy" ON public.tourist_emergency_contacts;
CREATE POLICY "tourist_emergency_select_policy"
ON public.tourist_emergency_contacts FOR SELECT
USING (true);
