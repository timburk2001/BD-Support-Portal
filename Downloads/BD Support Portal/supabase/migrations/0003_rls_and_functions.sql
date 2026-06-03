-- ============================================================
-- 0003_rls_and_functions.sql
-- Idempotent catch-up migration: applies everything from
-- 0001_init.sql that was not yet in the database —
-- functions, triggers, RLS policies, and storage policies.
-- Safe to run even if some pieces already exist.
-- ============================================================


-- ============================================================
-- SECTION 1 — HELPER FUNCTIONS
-- CREATE OR REPLACE makes these idempotent automatically.
-- ============================================================

-- Returns true when the calling user has role = 'admin'.
-- SECURITY DEFINER bypasses RLS on profiles so there is no
-- circular dependency between is_admin() and the profiles
-- SELECT policy that uses it.
CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

-- Extracts a ticket UUID from a storage path of the form
-- tickets/{ticket_uuid}/filename.ext.
-- Returns NULL if the path is malformed or not a valid UUID.
CREATE OR REPLACE FUNCTION public.extract_ticket_id_from_path(path text)
  RETURNS uuid
  LANGUAGE plpgsql
  IMMUTABLE
AS $$
DECLARE
  parts text[];
BEGIN
  parts := string_to_array(path, '/');
  IF array_length(parts, 1) < 2 THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN parts[2]::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
END;
$$;

-- Auto-creates a profiles row when a new auth.users row is inserted.
-- Pulls full_name from raw_user_meta_data when available.
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Keeps tickets.updated_at current on every row update.
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


-- ============================================================
-- SECTION 2 — TRIGGERS
-- Drop-if-exists then recreate for idempotency.
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created    ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS set_tickets_updated_at  ON public.tickets;
CREATE TRIGGER set_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- SECTION 3 — ENABLE ROW LEVEL SECURITY
-- Idempotent — safe to run when RLS is already enabled.
-- ============================================================

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SECTION 4 — RLS POLICIES
-- Drop each policy by name before (re-)creating it.
-- ============================================================

-- ── profiles ────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles: select own row"                   ON public.profiles;
DROP POLICY IF EXISTS "profiles: admins select all"                ON public.profiles;
DROP POLICY IF EXISTS "profiles: update own row (role immutable)"  ON public.profiles;

CREATE POLICY "profiles: select own row"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: admins select all"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());

-- Users may update their own row but cannot change their role.
-- The WITH CHECK re-reads the stored role so any attempt to
-- escalate is rejected. service_role bypasses RLS entirely.
CREATE POLICY "profiles: update own row (role immutable)"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (
      SELECT p2.role FROM public.profiles p2 WHERE p2.id = auth.uid()
    )
  );

-- ── sites ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "sites: admins full access"            ON public.sites;
DROP POLICY IF EXISTS "sites: clients select their own sites" ON public.sites;

CREATE POLICY "sites: admins full access"
  ON public.sites
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "sites: clients select their own sites"
  ON public.sites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.site_members sm
      WHERE sm.site_id = id
        AND sm.user_id = auth.uid()
    )
  );

-- ── site_members ─────────────────────────────────────────────

DROP POLICY IF EXISTS "site_members: admins full access"         ON public.site_members;
DROP POLICY IF EXISTS "site_members: clients select own memberships" ON public.site_members;

CREATE POLICY "site_members: admins full access"
  ON public.site_members
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "site_members: clients select own memberships"
  ON public.site_members
  FOR SELECT
  USING (user_id = auth.uid());

-- ── api_keys (admin only) ────────────────────────────────────

DROP POLICY IF EXISTS "api_keys: admins only" ON public.api_keys;

CREATE POLICY "api_keys: admins only"
  ON public.api_keys
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── tickets ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "tickets: admins full access"            ON public.tickets;
DROP POLICY IF EXISTS "tickets: clients select own site tickets" ON public.tickets;
DROP POLICY IF EXISTS "tickets: clients insert for own sites"  ON public.tickets;

CREATE POLICY "tickets: admins full access"
  ON public.tickets
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Clients read tickets that belong to their sites.
CREATE POLICY "tickets: clients select own site tickets"
  ON public.tickets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.site_members sm
      WHERE sm.site_id = site_id
        AND sm.user_id = auth.uid()
    )
  );

-- Clients may open tickets for their own sites.
-- Status changes are admin-only (no UPDATE/DELETE policy for clients).
CREATE POLICY "tickets: clients insert for own sites"
  ON public.tickets
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.site_members sm
      WHERE sm.site_id = site_id
        AND sm.user_id = auth.uid()
    )
  );

-- ── ticket_attachments ───────────────────────────────────────

DROP POLICY IF EXISTS "ticket_attachments: admins full access"            ON public.ticket_attachments;
DROP POLICY IF EXISTS "ticket_attachments: clients select for own tickets" ON public.ticket_attachments;
DROP POLICY IF EXISTS "ticket_attachments: clients insert for own tickets" ON public.ticket_attachments;

CREATE POLICY "ticket_attachments: admins full access"
  ON public.ticket_attachments
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "ticket_attachments: clients select for own tickets"
  ON public.ticket_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      JOIN public.site_members sm ON sm.site_id = t.site_id
      WHERE t.id = ticket_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "ticket_attachments: clients insert for own tickets"
  ON public.ticket_attachments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets t
      JOIN public.site_members sm ON sm.site_id = t.site_id
      WHERE t.id = ticket_id
        AND sm.user_id = auth.uid()
    )
  );

-- ── ticket_messages ──────────────────────────────────────────

DROP POLICY IF EXISTS "ticket_messages: admins full access"                          ON public.ticket_messages;
DROP POLICY IF EXISTS "ticket_messages: clients select non-internal for own tickets" ON public.ticket_messages;
DROP POLICY IF EXISTS "ticket_messages: clients insert on own tickets"               ON public.ticket_messages;

CREATE POLICY "ticket_messages: admins full access"
  ON public.ticket_messages
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Clients see only non-internal messages on their tickets.
CREATE POLICY "ticket_messages: clients select non-internal for own tickets"
  ON public.ticket_messages
  FOR SELECT
  USING (
    NOT is_internal
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      JOIN public.site_members sm ON sm.site_id = t.site_id
      WHERE t.id = ticket_id
        AND sm.user_id = auth.uid()
    )
  );

-- Clients may reply; is_internal = false enforced at DB level.
CREATE POLICY "ticket_messages: clients insert on own tickets"
  ON public.ticket_messages
  FOR INSERT
  WITH CHECK (
    NOT is_internal
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      JOIN public.site_members sm ON sm.site_id = t.site_id
      WHERE t.id = ticket_id
        AND sm.user_id = auth.uid()
    )
  );

-- ── ai_recommendations (admin only) ─────────────────────────

DROP POLICY IF EXISTS "ai_recommendations: admins only" ON public.ai_recommendations;

CREATE POLICY "ai_recommendations: admins only"
  ON public.ai_recommendations
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================
-- SECTION 5 — STORAGE BUCKET + POLICIES
-- ============================================================

-- Bucket (no-op if it already exists).
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Drop old storage policies before recreating.
DROP POLICY IF EXISTS "ticket-attachments: authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "ticket-attachments: authenticated read"   ON storage.objects;
DROP POLICY IF EXISTS "ticket-attachments: admins delete"        ON storage.objects;

-- Upload: authenticated users with site-member access to the ticket.
CREATE POLICY "ticket-attachments: authenticated upload"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND auth.role() = 'authenticated'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.tickets t
        JOIN public.site_members sm ON sm.site_id = t.site_id
        WHERE t.id = public.extract_ticket_id_from_path(name)
          AND sm.user_id = auth.uid()
      )
    )
  );

-- Read: same access check as upload.
CREATE POLICY "ticket-attachments: authenticated read"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'ticket-attachments'
    AND auth.role() = 'authenticated'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.tickets t
        JOIN public.site_members sm ON sm.site_id = t.site_id
        WHERE t.id = public.extract_ticket_id_from_path(name)
          AND sm.user_id = auth.uid()
      )
    )
  );

-- Delete: admins only.
CREATE POLICY "ticket-attachments: admins delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'ticket-attachments'
    AND public.is_admin()
  );


-- ============================================================
-- SECTION 6 — PROMOTE ADMIN
-- Requires the user to have already signed up so a profiles
-- row exists. Run separately if the account doesn't exist yet.
-- ============================================================

UPDATE public.profiles
SET role = 'admin'
WHERE email = 'info@burkdigital.com';
