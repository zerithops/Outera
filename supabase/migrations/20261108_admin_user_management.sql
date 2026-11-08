-- ============================================================================
-- OUTERA — ADMIN USER MANAGEMENT, RBAC, ACCOUNT SUSPENSION & AUDIT LOGS
-- Migration: 20261108_admin_user_management.sql
-- ============================================================================
-- Security guarantees:
-- 1. Enforces strict Row Level Security (RLS) on public.profiles and public.admin_audit_logs.
-- 2. Prevents ordinary users from escalating their own role or modifying other users.
-- 3. Protects the primary administrator account (65215d11-9637-40e8-91d9-daf831fd1acf / zerith_65215d11)
--    from accidental removal, suspension, or demotion at the database trigger & RPC level.
-- 4. Logs all sensitive admin user management actions into public.admin_audit_logs and public.activities.
-- ============================================================================

BEGIN;

-- 1. Add account status & suspension tracking columns to public.profiles (if not present)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended')),
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS suspended_reason text NULL,
  ADD COLUMN IF NOT EXISTS suspended_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- Ensure role column only permits valid roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_valid_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_valid_check
      CHECK (role IN ('user', 'moderator', 'admin', 'suspended'));
  END IF;
END $$;

-- 2. Create immutable admin_audit_logs table for sensitive admin actions
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_email text NULL,
  target_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_username text NULL,
  action_type text NOT NULL CHECK (
    action_type IN ('update_role', 'suspend_account', 'reactivate_account', 'verify_user')
  ),
  previous_value text NULL,
  new_value text NULL,
  reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_user
  ON public.admin_audit_logs (target_user_id, created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only verified admins can view or insert audit logs; nobody can update or delete audit logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND COALESCE(p.account_status, 'active') = 'active'
    )
  );

DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can insert audit logs"
  ON public.admin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND COALESCE(p.account_status, 'active') = 'active'
    )
  );

-- 3. Database Trigger: Prevent ordinary users from changing their role/status
--    and protect the Primary Admin account (65215d11-9637-40e8-91d9-daf831fd1acf) from demotion/suspension/deletion
CREATE OR REPLACE FUNCTION public.enforce_profile_security_and_primary_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_PrimaryAdminId constant uuid := '65215d11-9637-40e8-91d9-daf831fd1acf'::uuid;
  v_CallerIsAdmin boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.id = v_PrimaryAdminId OR lower(COALESCE(OLD.username, '')) = 'zerith_65215d11' THEN
      RAISE EXCEPTION 'Protected account: The primary OUTERA administrator account cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  -- Check if current authenticated caller is an active admin
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND COALESCE(account_status, 'active') = 'active'
    ) INTO v_CallerIsAdmin;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Protect Primary Admin from role demotion or suspension
    IF OLD.id = v_PrimaryAdminId OR lower(COALESCE(OLD.username, '')) = 'zerith_65215d11' THEN
      IF NEW.role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Protected account: The primary OUTERA administrator account cannot be demoted.';
      END IF;
      IF COALESCE(NEW.account_status, 'active') <> 'active' THEN
        RAISE EXCEPTION 'Protected account: The primary OUTERA administrator account cannot be suspended.';
      END IF;
    END IF;

    -- Prevent non-admins from changing role, account_status, or is_verified
    IF NOT v_CallerIsAdmin AND current_setting('role', true) <> 'service_role' THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can modify user roles.';
      END IF;
      IF COALESCE(NEW.account_status, 'active') IS DISTINCT FROM COALESCE(OLD.account_status, 'active') THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can suspend or reactivate accounts.';
      END IF;
      IF COALESCE(NEW.is_verified, false) IS DISTINCT FROM COALESCE(OLD.is_verified, false) THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can change verification status.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_security ON public.profiles;
CREATE TRIGGER trg_enforce_profile_security
  BEFORE UPDATE OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_security_and_primary_admin();

-- 4. Secure Server-Side RPC: admin_manage_user_account
--    Allows authenticated admins to update roles or suspend/reactivate users with full audit logging.
CREATE OR REPLACE FUNCTION public.admin_manage_user_account(
  p_target_user_id uuid,
  p_action text,
  p_new_role text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_PrimaryAdminId constant uuid := '65215d11-9637-40e8-91d9-daf831fd1acf'::uuid;
  v_CallerId uuid := auth.uid();
  v_CallerProfile public.profiles%ROWTYPE;
  v_TargetProfile public.profiles%ROWTYPE;
  v_PrevValue text;
  v_NewValue text;
BEGIN
  IF v_CallerId IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_CallerProfile
  FROM public.profiles
  WHERE id = v_CallerId;

  IF NOT FOUND OR v_CallerProfile.role <> 'admin' OR COALESCE(v_CallerProfile.account_status, 'active') <> 'active' THEN
    RAISE EXCEPTION 'Unauthorized: Active administrator privileges required';
  END IF;

  SELECT * INTO v_TargetProfile
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  -- Protect primary admin account & prevent self-demotion/self-suspension
  IF v_TargetProfile.id = v_PrimaryAdminId OR lower(COALESCE(v_TargetProfile.username, '')) = 'zerith_65215d11' THEN
    IF p_action IN ('suspend_account', 'update_role') AND COALESCE(p_new_role, '') <> 'admin' THEN
      RAISE EXCEPTION 'Protected account: The primary administrator account cannot be suspended or demoted.';
    END IF;
  END IF;

  IF v_TargetProfile.id = v_CallerId AND p_action IN ('suspend_account', 'update_role') AND COALESCE(p_new_role, 'admin') <> 'admin' THEN
    RAISE EXCEPTION 'Safety check: You cannot suspend or demote your own administrator account.';
  END IF;

  IF p_action = 'update_role' THEN
    IF p_new_role IS NULL OR p_new_role NOT IN ('user', 'moderator', 'admin') THEN
      RAISE EXCEPTION 'Invalid role specified: %', COALESCE(p_new_role, 'null');
    END IF;
    v_PrevValue := COALESCE(v_TargetProfile.role, 'user');
    v_NewValue := p_new_role;

    UPDATE public.profiles
    SET role = p_new_role,
        updated_at = now()
    WHERE id = p_target_user_id;

  ELSIF p_action = 'suspend_account' THEN
    v_PrevValue := COALESCE(v_TargetProfile.account_status, 'active');
    v_NewValue := 'suspended';

    UPDATE public.profiles
    SET account_status = 'suspended',
        suspended_at = now(),
        suspended_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Suspended by administrator'),
        suspended_by = v_CallerId,
        updated_at = now()
    WHERE id = p_target_user_id;

  ELSIF p_action = 'reactivate_account' THEN
    v_PrevValue := COALESCE(v_TargetProfile.account_status, 'suspended');
    v_NewValue := 'active';

    UPDATE public.profiles
    SET account_status = 'active',
        suspended_at = NULL,
        suspended_reason = NULL,
        suspended_by = NULL,
        updated_at = now()
    WHERE id = p_target_user_id;

  ELSE
    RAISE EXCEPTION 'Unsupported management action: %', p_action;
  END IF;

  -- Record immutable audit log
  INSERT INTO public.admin_audit_logs (
    actor_id,
    target_user_id,
    target_username,
    action_type,
    previous_value,
    new_value,
    reason,
    metadata
  ) VALUES (
    v_CallerId,
    p_target_user_id,
    v_TargetProfile.username,
    p_action,
    v_PrevValue,
    v_NewValue,
    NULLIF(trim(COALESCE(p_reason, '')), ''),
    jsonb_build_object(
      'actor_username', v_CallerProfile.username,
      'target_display_name', v_TargetProfile.display_name
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'target_user_id', p_target_user_id,
    'action', p_action,
    'previous_value', v_PrevValue,
    'new_value', v_NewValue
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_manage_user_account(uuid, text, text, text) TO authenticated;

COMMIT;
