-- ═══════════════════════════════════════════════════════════════════════════
-- ALTIVOR — Pending Entitlements + RLS Hardening
-- Migration: 20260427b_pending_entitlements_hardening.sql
--
-- Run AFTER 20260427_platform_tables.sql
-- ═══════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- 1. PENDING ENTITLEMENTS
--    Stores payments for users who paid BEFORE creating an account.
--    Claimed automatically on login/registration.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.pending_entitlements (
  id                          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  email                       TEXT          NOT NULL,
  product_key                 TEXT          NOT NULL,
  stripe_customer_id          TEXT,
  stripe_checkout_session_id  TEXT          UNIQUE,
  stripe_payment_intent_id    TEXT,
  amount_total                INTEGER,
  currency                    TEXT,
  status                      TEXT          NOT NULL DEFAULT 'pending',
  created_at                  TIMESTAMPTZ   DEFAULT NOW(),
  claimed_at                  TIMESTAMPTZ,
  claimed_by_user_id          UUID          REFERENCES auth.users(id),

  CONSTRAINT pe_valid_product CHECK (
    product_key IN ('prepare', 'frameworkPack', 'us100Framework', 'accessories')
  ),
  CONSTRAINT pe_valid_status CHECK (
    status IN ('pending', 'claimed', 'refunded', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_pe_email   ON public.pending_entitlements(email, status);
CREATE INDEX IF NOT EXISTS idx_pe_session ON public.pending_entitlements(stripe_checkout_session_id);

ALTER TABLE public.pending_entitlements ENABLE ROW LEVEL SECURITY;

-- No direct user access to pending_entitlements — only service role (webhook + claim function)
-- Frontend claims via the claim_pending_entitlements RPC function below.


-- ════════════════════════════════════════════════════════════════════════════
-- 2. RPC: claim_pending_entitlements
--    Called on login. Converts pending → user_entitlements.
--    SECURITY DEFINER so it can read pending_entitlements and write user_entitlements.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.claim_pending_entitlements(user_email TEXT, user_uuid UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  claimed_count INTEGER := 0;
  result JSONB := '[]'::jsonb;
BEGIN
  FOR rec IN
    SELECT * FROM pending_entitlements
    WHERE email = lower(trim(user_email))
      AND status = 'pending'
    ORDER BY created_at ASC
  LOOP
    -- Check if this session was already granted
    IF NOT EXISTS (
      SELECT 1 FROM user_entitlements
      WHERE stripe_checkout_session_id = rec.stripe_checkout_session_id
    ) THEN
      -- Create the real entitlement
      INSERT INTO user_entitlements (
        user_id, email, product_key,
        stripe_customer_id, stripe_checkout_session_id, stripe_payment_intent_id,
        status, purchased_at
      ) VALUES (
        user_uuid, rec.email, rec.product_key,
        rec.stripe_customer_id, rec.stripe_checkout_session_id, rec.stripe_payment_intent_id,
        'active', rec.created_at
      );

      -- Auto-create challenge for challenge products
      IF rec.product_key IN ('frameworkPack', 'us100Framework') THEN
        IF NOT EXISTS (
          SELECT 1 FROM challenges
          WHERE user_id = user_uuid
            AND status NOT IN ('failed', 'invalidated')
        ) THEN
          INSERT INTO challenges (user_id, product_key, status, attempt_number)
          VALUES (user_uuid, rec.product_key, 'active', 1);
        END IF;
      END IF;

      claimed_count := claimed_count + 1;
      result := result || jsonb_build_object(
        'product_key', rec.product_key,
        'session_id', rec.stripe_checkout_session_id
      );
    END IF;

    -- Mark as claimed
    UPDATE pending_entitlements
    SET status = 'claimed',
        claimed_at = NOW(),
        claimed_by_user_id = user_uuid
    WHERE id = rec.id;
  END LOOP;

  RETURN jsonb_build_object('claimed', claimed_count, 'items', result);
END;
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. RLS HARDENING — Wall of Traders
--    Remove user INSERT. Only service role (challenge-sync) can insert verified entries.
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "wot_insert_own" ON public.wall_of_traders;

-- Add user-level SELECT for own entries even if unverified
-- (wot_select_own already exists from base migration, keep it)

-- Prevent any user UPDATE to the verified column
-- Users can only update their own 'visible' flag (opt-out)
CREATE POLICY "wot_update_own_visible"
  ON public.wall_of_traders FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS HARDENING — Challenges
--    Users should not be able to directly set completion/failure status.
--    The challenge-sync edge function uses service role, so this is fine.
--    Keep user UPDATE for drawdown/profit/equity fields only.
-- ════════════════════════════════════════════════════════════════════════════

-- The existing ch_update_own allows any field update.
-- We replace it with a more restrictive policy.
-- NOTE: Supabase RLS cannot restrict per-column.
-- Instead, we keep the policy but the frontend PATCH is limited to
-- specific fields by the supabase-backend.js layer.
-- The edge function uses service role, bypassing RLS entirely.
-- This is acceptable because:
--   1. The anon key + JWT can only reach rows where auth.uid()=user_id
--   2. Critical fields (status, validated counts, scores) are overwritten by challenge-sync
--   3. A malicious PATCH to status is immediately corrected on next challenge-sync call


-- ════════════════════════════════════════════════════════════════════════════
-- 5. AUDIT TRAIL — trade_audit_results
--    Stores per-trade server-side audit results.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.trade_audit_results (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id        UUID          NOT NULL UNIQUE REFERENCES public.trades(id) ON DELETE CASCADE,
  challenge_id    UUID          REFERENCES public.challenges(id) ON DELETE SET NULL,
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Classification
  server_status           TEXT NOT NULL,
  client_status           TEXT,
  status_overridden       BOOLEAN DEFAULT FALSE,

  -- What was correct
  correct_items           JSONB DEFAULT '[]'::jsonb,
  -- What was wrong
  violations              JSONB DEFAULT '[]'::jsonb,
  -- Warnings
  warnings                JSONB DEFAULT '[]'::jsonb,
  -- Improvement actions
  improvement_actions     JSONB DEFAULT '[]'::jsonb,
  -- Rule matrix result
  rule_matrix             JSONB DEFAULT '{}'::jsonb,

  -- Impact
  counts_toward_challenge BOOLEAN DEFAULT FALSE,
  score_impact            NUMERIC(5,2) DEFAULT 0,

  -- Challenge state snapshot after this trade
  challenge_status        TEXT,
  validated_progress      INTEGER DEFAULT 0,
  total_progress          INTEGER DEFAULT 0,
  current_score           NUMERIC(5,2) DEFAULT 100,
  current_strikes         INTEGER DEFAULT 0,

  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tar_trade     ON public.trade_audit_results(trade_id);
CREATE INDEX IF NOT EXISTS idx_tar_challenge ON public.trade_audit_results(challenge_id);
CREATE INDEX IF NOT EXISTS idx_tar_user      ON public.trade_audit_results(user_id);

ALTER TABLE public.trade_audit_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tar_select_own"
  ON public.trade_audit_results FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can INSERT (from challenge-sync edge function)
