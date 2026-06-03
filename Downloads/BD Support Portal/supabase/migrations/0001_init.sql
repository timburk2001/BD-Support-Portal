-- ============================================================
-- 0001_init.sql — BD Support Portal initial schema
-- Run in Supabase SQL editor or via: supabase db push
-- ============================================================


-- -------------------------------------------------------
-- HELPER FUNCTIONS
-- (created before tables so policies can reference them)
-- -------------------------------------------------------

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

-- Safely extracts a ticket UUID from a storage path of the
-- form  tickets/{ticket_uuid}/filename.ext
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


-- -------------------------------------------------------
-- TABLES
-- -------------------------------------------------------

CREATE TABLE public.profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  full_name   text,
  role        text        NOT NULL DEFAULT 'client'
                          CHECK (role IN ('client', 'admin')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  url         text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- clients ↔ sites many-to-many
CREATE TABLE public.site_members (
  site_id  uuid NOT NULL REFERENCES public.sites(id)    ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (site_id, user_id)
);

-- API keys used by the WordPress plugin to authenticate ingest.
-- key_hash stores SHA-256 of the raw key; raw key is never persisted.
CREATE TABLE public.api_keys (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  key_hash     text        NOT NULL,
  label        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

CREATE TABLE public.tickets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid        NOT NULL  REFERENCES public.sites(id)    ON DELETE RESTRICT,
  -- null when submitted via plugin without a linked portal user
  submitted_by    uuid                  REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitter_email text,
  method          text        NOT NULL  CHECK (method IN ('visual', 'standard')),
  title           text        NOT NULL,
  description     text        NOT NULL,
  page_url        text,
  browser         text,
  device          text,
  viewport        text,
  status          text        NOT NULL  DEFAULT 'new'
                              CHECK (status IN ('new', 'open', 'in_progress', 'resolved', 'closed')),
  created_at      timestamptz NOT NULL  DEFAULT now(),
  updated_at      timestamptz NOT NULL  DEFAULT now()
);

CREATE TABLE public.ticket_attachments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid        NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  storage_path text        NOT NULL,
  kind         text        NOT NULL CHECK (kind IN ('annotated_screenshot', 'upload')),
  mime_type    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ticket_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid        NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id   uuid                 REFERENCES public.profiles(id) ON DELETE SET NULL,
  body        text        NOT NULL,
  is_internal boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_recommendations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid        NOT NULL REFERENCES public.tickets(id)    ON DELETE CASCADE,
  requested_by uuid                 REFERENCES public.profiles(id)   ON DELETE SET NULL,
  model        text        NOT NULL,
  content      text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);


-- -------------------------------------------------------
-- INDEXES
-- (RLS policies do table scans through site_members often)
-- -------------------------------------------------------

CREATE INDEX idx_site_members_user_id    ON public.site_members (user_id);
CREATE INDEX idx_site_members_site_id    ON public.site_members (site_id);
CREATE INDEX idx_tickets_site_id         ON public.tickets (site_id);
CREATE INDEX idx_tickets_submitted_by    ON public.tickets (submitted_by);
CREATE INDEX idx_ticket_attachments_tid  ON public.ticket_attachments (ticket_id);
CREATE INDEX idx_ticket_messages_tid     ON public.ticket_messages (ticket_id);
CREATE INDEX idx_ai_recommendations_tid  ON public.ai_recommendations (ticket_id);
CREATE INDEX idx_api_keys_site_id        ON public.api_keys (site_id);
CREATE INDEX idx_profiles_email          ON public.profiles (email);


-- -------------------------------------------------------
-- TRIGGERS
-- -------------------------------------------------------

-- 1. Auto-create a profiles row when a new auth.users row is inserted.
--    Pulls full_name from raw_user_meta_data when available (set during signUp).
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
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Keep tickets.updated_at accurate on every row update.
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- -------------------------------------------------------
-- ROW-LEVEL SECURITY — enable on every table
-- -------------------------------------------------------

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------
-- RLS POLICIES — profiles
-- -------------------------------------------------------

-- Any user can read their own row.
CREATE POLICY "profiles: select own row"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Admins can read every row.
CREATE POLICY "profiles: admins select all"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());

-- Users can update their own row.
-- The WITH CHECK subquery reads the current (pre-update) role from the
-- database; if the caller tries to change it, new.role won't match and
-- the update is rejected.  The service_role key bypasses RLS entirely,
-- so admins using the service client can still change the role column.
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


-- -------------------------------------------------------
-- RLS POLICIES — sites
-- -------------------------------------------------------

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


-- -------------------------------------------------------
-- RLS POLICIES — site_members
-- -------------------------------------------------------

CREATE POLICY "site_members: admins full access"
  ON public.site_members
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "site_members: clients select own memberships"
  ON public.site_members
  FOR SELECT
  USING (user_id = auth.uid());


-- -------------------------------------------------------
-- RLS POLICIES — api_keys  (admin only)
-- -------------------------------------------------------

CREATE POLICY "api_keys: admins only"
  ON public.api_keys
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- -------------------------------------------------------
-- RLS POLICIES — tickets
-- -------------------------------------------------------

CREATE POLICY "tickets: admins full access"
  ON public.tickets
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Clients can read tickets belonging to their sites.
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

-- Clients can open tickets for their sites only.
-- Status changes are admin-only — no UPDATE/DELETE policy for clients.
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


-- -------------------------------------------------------
-- RLS POLICIES — ticket_attachments
-- -------------------------------------------------------

CREATE POLICY "ticket_attachments: admins full access"
  ON public.ticket_attachments
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Same visibility as the parent ticket.
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

-- Clients can attach files to tickets they can see.
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


-- -------------------------------------------------------
-- RLS POLICIES — ticket_messages
-- -------------------------------------------------------

CREATE POLICY "ticket_messages: admins full access"
  ON public.ticket_messages
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Clients can only see non-internal messages on their tickets.
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

-- Clients can reply to their own tickets.
-- is_internal = false is also enforced here as a DB-level safeguard
-- (the API layer must also set it to false, but defence-in-depth).
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


-- -------------------------------------------------------
-- RLS POLICIES — ai_recommendations  (admin only)
-- -------------------------------------------------------

CREATE POLICY "ai_recommendations: admins only"
  ON public.ai_recommendations
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- -------------------------------------------------------
-- STORAGE
-- -------------------------------------------------------

-- Private bucket — all access is controlled by the policies below.
-- The service_role key bypasses RLS (and therefore these policies)
-- automatically, so plugin ingest works without extra configuration.
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Upload: authenticated users can upload to tickets/{ticket_id}/...
-- provided they have site-member access to that ticket.
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

-- Delete: admins only (clients never delete attachments).
CREATE POLICY "ticket-attachments: admins delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'ticket-attachments'
    AND public.is_admin()
  );


-- -------------------------------------------------------
-- ADMIN SEED
-- -------------------------------------------------------
-- After signing up through the portal, promote your account
-- to admin by running the line below in the SQL editor:
--
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'you@youragency.com';
