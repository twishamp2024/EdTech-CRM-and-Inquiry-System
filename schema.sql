-- =============================================================================
-- EdTech CRM & Inquiry Management System — initial database schema
--
-- Target:      PostgreSQL 15+ (Supabase). Uses only core features
--              (gen_random_uuid() is built in since PostgreSQL 13).
-- Idempotent:  safe to run more than once; existing tables are left untouched.
-- Apply with:  `npm run db:migrate` (from backend/) or paste into the
--              Supabase SQL editor.
--
-- Allowed values below must match backend/src/constants/inquiry.js
-- (a test in backend/tests/schema enforces this).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- admins: dashboard users. Authentication is implemented by the backend
-- (bcrypt + JWT); Supabase Auth is not used.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admins (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admins_email_key
    UNIQUE (email),
  -- Emails are stored normalised so the UNIQUE constraint is case-insensitive.
  CONSTRAINT admins_email_normalised
    CHECK (email = lower(btrim(email))),
  CONSTRAINT admins_email_format
    CHECK (char_length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Only bcrypt hashes can be stored, never a plaintext password.
  CONSTRAINT admins_password_hash_bcrypt
    CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$')
);

COMMENT ON TABLE public.admins IS 'Admin users for the inquiry dashboard (custom bcrypt/JWT auth).';

-- -----------------------------------------------------------------------------
-- inquiries: submissions from the public inquiry form.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inquiries (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  email      text        NOT NULL,
  phone      text        NOT NULL,
  user_type  text        NOT NULL,
  category   text        NOT NULL,
  message    text        NOT NULL,
  status     text        NOT NULL DEFAULT 'New',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inquiries_name_length
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 100),
  CONSTRAINT inquiries_email_format
    CHECK (char_length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Phone is text (keeps leading "+" and zeros): digits, spaces, "-", "(", ")",
  -- optional leading "+", at most 20 characters and 7–15 digits.
  CONSTRAINT inquiries_phone_format
    CHECK (
      char_length(phone) <= 20
      AND phone ~ '^\+?[0-9() -]+$'
      AND char_length(regexp_replace(phone, '[^0-9]', '', 'g')) BETWEEN 7 AND 15
    ),
  CONSTRAINT inquiries_user_type_allowed
    CHECK (user_type IN ('Parent', 'Student', 'School')),
  CONSTRAINT inquiries_category_allowed
    CHECK (category IN ('Scholarship', 'Concert', 'Admission', 'General Query')),
  CONSTRAINT inquiries_message_length
    CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000),
  CONSTRAINT inquiries_status_allowed
    CHECK (status IN ('New', 'In Progress', 'Resolved'))
);

COMMENT ON TABLE public.inquiries IS 'Inquiries submitted through the public form.';

-- Dashboard queries filter by category / user type and sort newest first, so
-- the composite indexes serve "filter + ORDER BY created_at DESC LIMIT n".
CREATE INDEX IF NOT EXISTS inquiries_created_at_idx
  ON public.inquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS inquiries_category_created_at_idx
  ON public.inquiries (category, created_at DESC);
CREATE INDEX IF NOT EXISTS inquiries_user_type_created_at_idx
  ON public.inquiries (user_type, created_at DESC);

-- -----------------------------------------------------------------------------
-- Keep updated_at correct for every UPDATE, including ones made outside the API.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inquiries_set_updated_at ON public.inquiries;
CREATE TRIGGER inquiries_set_updated_at
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security: Supabase exposes public tables through its REST API to
-- anyone holding the project's anon key. Enabling RLS with no policies denies
-- that access entirely. The backend connects as the table owner (postgres),
-- which bypasses RLS, so the API is unaffected.
-- -----------------------------------------------------------------------------
ALTER TABLE public.admins    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

COMMIT;
