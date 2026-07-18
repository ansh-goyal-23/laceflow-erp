-- User Management module schema.
-- Run in the Supabase SQL Editor.
--
-- Adds:
--   * 'editor' and 'viewer' values to public.app_role enum
--   * public.user_profiles table (name / mobile / designation / department / status / last_login)
--   * RLS: admins can read all + write; each user can read/update their own profile row
--   * Trigger that auto-creates a profile row on new auth.users signup
--
-- Depends on: public.has_role(uuid, app_role), public.user_roles, public.app_role.
--
-- IMPORTANT: Postgres does not allow a newly added enum value to be used in
-- the same transaction that added it ("unsafe use of new value ... of enum
-- type"). Run STEP 1 below on its own first, then run STEP 2 as a separate
-- query in the Supabase SQL Editor.

-- ===========================================================================
-- STEP 1 — Run this ALONE first, then run STEP 2 in a separate query.
-- ===========================================================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'editor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';

-- ===========================================================================
-- STEP 2 — Run everything below AFTER Step 1 has been committed.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 2. user_profiles table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    text NOT NULL DEFAULT '',
  mobile       text,
  designation  text,
  department   text,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  last_login_at  timestamptz,
  last_logout_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles read self or admin" ON public.user_profiles;
CREATE POLICY "profiles read self or admin"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "profiles insert admin or self" ON public.user_profiles;
CREATE POLICY "profiles insert admin or self"
  ON public.user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "profiles update admin or self" ON public.user_profiles;
CREATE POLICY "profiles update admin or self"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 3. Auto-create profile + default 'viewer' role for new signups
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, created_by)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. Widen user_roles: admins may write, everyone may read all rows
--    (needed so the User Management UI can list every user's role in one query)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_roles read all" ON public.user_roles;
CREATE POLICY "user_roles read all"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "user_roles admin write" ON public.user_roles;
CREATE POLICY "user_roles admin write"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 5. Backfill profiles for pre-existing auth.users
-- ---------------------------------------------------------------------------
INSERT INTO public.user_profiles (id, full_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', '')
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Convenience view for the User Management screen (admin-gated by RLS on
-- user_profiles; auth.users is not exposed directly).
CREATE OR REPLACE VIEW public.user_management_view AS
SELECT
  p.id,
  u.email,
  p.full_name,
  p.mobile,
  p.designation,
  p.department,
  p.status,
  p.last_login_at,
  p.last_logout_at,
  p.created_at,
  p.created_by,
  COALESCE(
    (SELECT role::text FROM public.user_roles r
     WHERE r.user_id = p.id
     ORDER BY CASE r.role::text
       WHEN 'admin'  THEN 1
       WHEN 'editor' THEN 2
       WHEN 'viewer' THEN 3
       ELSE 4 END
     LIMIT 1),
    'viewer'
  ) AS role
FROM public.user_profiles p
LEFT JOIN auth.users u ON u.id = p.id;

GRANT SELECT ON public.user_management_view TO authenticated;