-- Add submitter_name column so the WordPress plugin can pass the
-- submitter's display name without requiring a portal account.
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS submitter_name text;
