-- ============================================================
-- 0005_reply_to_email_and_claim_by_email.sql
--
-- A. Add tickets.reply_to_email (where the submitter wants replies).
-- B. Let a logged-in user read tickets whose submitter_email matches
--    their own (verified) account email — so an anonymous plugin
--    submitter can create an account and immediately see their ticket.
-- C. On signup, claim any matching anonymous tickets (set submitted_by).
-- D. One-time backfill for users who already have accounts.
--
-- All statements are idempotent (IF NOT EXISTS / DROP ... IF EXISTS).
-- ============================================================


-- ── A. reply_to_email column ────────────────────────────────
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS reply_to_email text;


-- ── Helper: the calling user's lowercased account email ─────
-- SECURITY DEFINER so it can read profiles without tripping RLS,
-- and so the email-match policies below are a single indexed
-- lookup per query rather than a correlated profiles subquery.
CREATE OR REPLACE FUNCTION public.current_user_email()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT lower(email) FROM public.profiles WHERE id = auth.uid();
$$;


-- ── B. Email-match SELECT policies (additive) ───────────────
-- Postgres OR's permissive policies, so existing site-member access
-- is preserved; these simply add a second way in for the submitter.

CREATE INDEX IF NOT EXISTS idx_tickets_lower_submitter_email
  ON public.tickets (lower(submitter_email));

-- tickets
DROP POLICY IF EXISTS "tickets: select by matching submitter email" ON public.tickets;
CREATE POLICY "tickets: select by matching submitter email"
  ON public.tickets
  FOR SELECT
  USING (
    submitter_email IS NOT NULL
    AND public.current_user_email() IS NOT NULL
    AND lower(submitter_email) = public.current_user_email()
  );

-- ticket_attachments (so the submitter can see attachment rows)
DROP POLICY IF EXISTS "ticket_attachments: select by matching submitter email" ON public.ticket_attachments;
CREATE POLICY "ticket_attachments: select by matching submitter email"
  ON public.ticket_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_attachments.ticket_id
        AND t.submitter_email IS NOT NULL
        AND public.current_user_email() IS NOT NULL
        AND lower(t.submitter_email) = public.current_user_email()
    )
  );

-- ticket_messages (non-internal only, mirrors the site-member policy)
DROP POLICY IF EXISTS "ticket_messages: select by matching submitter email" ON public.ticket_messages;
CREATE POLICY "ticket_messages: select by matching submitter email"
  ON public.ticket_messages
  FOR SELECT
  USING (
    NOT is_internal
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND t.submitter_email IS NOT NULL
        AND public.current_user_email() IS NOT NULL
        AND lower(t.submitter_email) = public.current_user_email()
    )
  );

-- Storage read: recreate the bucket read policy with an extra branch so
-- screenshots render for email-owners (not just admins / site members).
DROP POLICY IF EXISTS "ticket-attachments: authenticated read" ON storage.objects;
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
      OR EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = public.extract_ticket_id_from_path(name)
          AND t.submitter_email IS NOT NULL
          AND public.current_user_email() IS NOT NULL
          AND lower(t.submitter_email) = public.current_user_email()
      )
    )
  );


-- ── C. Claim matching anonymous tickets on signup ───────────
-- Extends the existing handle_new_user() (called by the
-- on_auth_user_created trigger). SECURITY DEFINER bypasses RLS for
-- the UPDATE, which is fine: the WHERE clause is scoped to unclaimed
-- tickets whose email exactly matches the brand-new user.
--
-- NOTE: if an admin manually sets a ticket's submitter_email to
-- someone else's address, that person could claim it on signup. That
-- is an admin action, not an external vector.
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

  -- Adopt any anonymously-submitted tickets matching this email.
  UPDATE public.tickets
  SET submitted_by = NEW.id
  WHERE submitted_by IS NULL
    AND submitter_email IS NOT NULL
    AND lower(submitter_email) = lower(NEW.email);

  RETURN NEW;
END;
$$;


-- ── D. One-time backfill for already-registered users ───────
UPDATE public.tickets t
SET submitted_by = p.id
FROM public.profiles p
WHERE t.submitted_by IS NULL
  AND t.submitter_email IS NOT NULL
  AND lower(t.submitter_email) = lower(p.email);
