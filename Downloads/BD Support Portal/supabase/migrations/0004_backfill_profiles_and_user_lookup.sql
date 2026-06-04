-- ============================================================
-- 0004_backfill_profiles_and_user_lookup.sql
--
-- Two things:
-- 1. Back-fill public.profiles for any auth.users who signed up
--    before the on_auth_user_created trigger existed (migration 0003).
-- 2. Add a SECURITY DEFINER helper that lets server-side code look
--    up an auth.users row by email without exposing the auth schema
--    to client queries.
-- ============================================================

-- 1. Back-fill missing profiles
INSERT INTO public.profiles (id, email, full_name)
SELECT
    au.id,
    au.email,
    au.raw_user_meta_data->>'full_name'
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
  AND au.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 2. RPC helper — returns the auth.users UUID for a given email,
--    or NULL if no matching user exists.
--    SECURITY DEFINER + restricted search_path means it runs as
--    the function owner (postgres) and can read auth.users safely.
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(user_email text)
    RETURNS uuid
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
AS $$
    SELECT id
    FROM auth.users
    WHERE LOWER(email) = LOWER(user_email)
    LIMIT 1;
$$;
