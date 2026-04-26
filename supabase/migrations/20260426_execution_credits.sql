-- ═══════════════════════════════════════════════════════════════════════════
-- ALTIVOR — Execution Credits table
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.execution_credits (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID          NOT NULL,
  email           TEXT          NOT NULL,
  promotion_code  TEXT          NOT NULL UNIQUE,
  stripe_promotion_code_id TEXT,
  expires_at      TIMESTAMPTZ   NOT NULL,
  used            BOOLEAN       DEFAULT FALSE,
  used_at         TIMESTAMPTZ,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id   TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ec_user_id ON public.execution_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_ec_email   ON public.execution_credits(email);
CREATE INDEX IF NOT EXISTS idx_ec_code    ON public.execution_credits(promotion_code);
CREATE INDEX IF NOT EXISTS idx_ec_stripe  ON public.execution_credits(stripe_promotion_code_id);

-- Row Level Security
ALTER TABLE public.execution_credits ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own credits
CREATE POLICY "Users can view own credits"
  ON public.execution_credits
  FOR SELECT
  USING (auth.uid() = user_id);

-- Note: Edge Functions use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS
-- so no INSERT/UPDATE policy is needed for the service role.
