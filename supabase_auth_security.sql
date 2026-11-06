-- ==============================================================================
-- OUTERA — AUTHENTICATION & ACCOUNT SECURITY RLS HARDENING MIGRATION
-- Safe, idempotent migration: preserves existing tables, records, and policies.
-- Run in Supabase Dashboard -> SQL Editor -> New Query
-- ==============================================================================

-- 1. Ensure Row Level Security is enabled on public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Grant base table privileges to authenticated and anon roles
GRANT SELECT ON TABLE public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.profiles TO authenticated;

-- 3. Public read access for Scout profiles (display_name, username, avatar_url, bio)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
ON public.profiles
FOR SELECT
USING (true);

-- 4. Users can only insert their own profile row
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 5. Prevent unauthorized profile updates and prevent privilege escalation on profiles.role
DROP POLICY IF EXISTS "Users can update own profile safely" ON public.profiles;
CREATE POLICY "Users can update own profile safely"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND (
    -- Preserve existing role so non-admin users can never self-assign 'admin'
    role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    OR public.is_admin()
  )
);

-- 6. Automatically provision a Scout profile row when a new auth.users record is created
CREATE OR REPLACE FUNCTION public.handle_new_outera_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_display_name text;
BEGIN
  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    SPLIT_PART(NEW.email, '@', 1),
    'Scout'
  );

  v_username := LOWER(REGEXP_REPLACE(
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
      SPLIT_PART(NEW.email, '@', 1),
      'scout'
    ),
    '[^a-z0-9_]', '', 'g'
  ));

  IF LENGTH(v_username) < 3 THEN
    v_username := v_username || '_' || SUBSTR(REPLACE(NEW.id::text, '-', ''), 1, 5);
  END IF;

  INSERT INTO public.profiles (id, display_name, username, role, created_at, updated_at)
  VALUES (
    NEW.id,
    v_display_name,
    v_username,
    'scout',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_outera ON auth.users;
CREATE TRIGGER on_auth_user_created_outera
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_outera_user();
