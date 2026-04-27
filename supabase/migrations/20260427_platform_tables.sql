-- ═══════════════════════════════════════════════════════════════════════════
-- ALTIVOR INSTITUTE — Production Backend Tables
-- Migration: 20260427_platform_tables.sql
--
-- Creates 7 tables + RLS policies + indexes + triggers.
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- ═══════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- HELPER: updated_at trigger function (reusable)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. USER ENTITLEMENTS
--    Written ONLY by the Stripe webhook (service role).
--    Frontend reads via RLS to determine product access.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_entitlements (
  id                          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email                       TEXT          NOT NULL,
  product_key                 TEXT          NOT NULL,
  stripe_customer_id          TEXT,
  stripe_checkout_session_id  TEXT          UNIQUE,
  stripe_payment_intent_id    TEXT,
  status                      TEXT          NOT NULL DEFAULT 'active',
  purchased_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at                  TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ   DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ   DEFAULT NOW(),

  CONSTRAINT ue_valid_product CHECK (
    product_key IN ('prepare', 'frameworkPack', 'us100Framework', 'accessories')
  ),
  CONSTRAINT ue_valid_status CHECK (
    status IN ('active', 'inactive', 'refunded', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_ue_user_id   ON public.user_entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_ue_email     ON public.user_entitlements(email);
CREATE INDEX IF NOT EXISTS idx_ue_product   ON public.user_entitlements(product_key, status);
CREATE INDEX IF NOT EXISTS idx_ue_session   ON public.user_entitlements(stripe_checkout_session_id);

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

-- Users can read their own entitlements
CREATE POLICY "ue_select_own"
  ON public.user_entitlements FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE for anon/authenticated — only service role (webhook)

CREATE TRIGGER trg_ue_updated
  BEFORE UPDATE ON public.user_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- 2. CHALLENGES (one active challenge per user)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.challenges (
  id                          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_key                 TEXT          NOT NULL,
  status                      TEXT          NOT NULL DEFAULT 'active',
  attempt_number              INTEGER       NOT NULL DEFAULT 1,
  second_life_used            BOOLEAN       NOT NULL DEFAULT FALSE,
  validated_trade_count       INTEGER       NOT NULL DEFAULT 0,
  invalid_trade_count         INTEGER       NOT NULL DEFAULT 0,
  warning_count               INTEGER       NOT NULL DEFAULT 0,
  strike_count                INTEGER       NOT NULL DEFAULT 0,
  trader_score                NUMERIC(5,2)  NOT NULL DEFAULT 100,
  challenge_score             NUMERIC(5,2)  NOT NULL DEFAULT 100,
  discipline_rating           TEXT          DEFAULT 'Institutional',
  peak_equity                 NUMERIC(12,2) DEFAULT 10000,
  current_equity              NUMERIC(12,2) DEFAULT 10000,
  max_drawdown                NUMERIC(5,2)  DEFAULT 0,
  net_profit_percent          NUMERIC(5,2)  DEFAULT 0,
  weekly_checkins_completed   INTEGER       DEFAULT 0,
  broker_statement_status     TEXT          DEFAULT 'missing',
  completed_at                TIMESTAMPTZ,
  failed_at                   TIMESTAMPTZ,
  failure_reason              TEXT,
  created_at                  TIMESTAMPTZ   DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ   DEFAULT NOW(),

  CONSTRAINT ch_valid_status CHECK (
    status IN (
      'active','passing','at_risk','failed','invalidated',
      'completed','ready_for_final_verification','second_life_available'
    )
  ),
  CONSTRAINT ch_valid_broker CHECK (
    broker_statement_status IN ('missing','submitted','reviewed','rejected')
  ),
  CONSTRAINT ch_valid_product CHECK (
    product_key IN ('frameworkPack','us100Framework')
  )
);

CREATE INDEX IF NOT EXISTS idx_ch_user      ON public.challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_ch_status    ON public.challenges(user_id, status);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ch_select_own"
  ON public.challenges FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "ch_insert_own"
  ON public.challenges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ch_update_own"
  ON public.challenges FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_ch_updated
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- 3. TRADES
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.trades (
  id                            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                       UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id                  UUID          REFERENCES public.challenges(id) ON DELETE SET NULL,
  product_context               TEXT          NOT NULL DEFAULT '55_trade_cycle',
  strategy_id                   TEXT,
  direction                     TEXT,
  entry_price                   NUMERIC(14,5),
  exit_price                    NUMERIC(14,5),
  stop_loss                     NUMERIC(14,5),
  take_profit                   NUMERIC(14,5),
  lot_size                      NUMERIC(10,4),
  planned_risk                  NUMERIC(12,2),
  actual_risk                   NUMERIC(12,2),
  risk_percent                  NUMERIC(5,2),
  account_equity                NUMERIC(12,2),
  entry_time                    TIMESTAMPTZ,
  exit_time                     TIMESTAMPTZ,
  pnl                           NUMERIC(12,2),
  rr_planned                    NUMERIC(6,2),
  rr_realized                   NUMERIC(6,2),
  notes                         TEXT,
  screenshot_url                TEXT,
  validation_status             TEXT          DEFAULT 'pending',
  counts_toward_challenge       BOOLEAN       DEFAULT FALSE,
  violation_tags                JSONB         DEFAULT '[]'::jsonb,
  warnings                      JSONB         DEFAULT '[]'::jsonb,
  invalid_reasons               JSONB         DEFAULT '[]'::jsonb,
  evaluation_result             JSONB,
  execution_checklist_snapshot  JSONB,
  created_at                    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ   DEFAULT NOW(),

  CONSTRAINT tr_valid_context CHECK (
    product_context IN ('prepare','55_trade_cycle')
  ),
  CONSTRAINT tr_valid_status CHECK (
    validation_status IN ('pending','validated','validated_with_warnings','invalid','not_counted','strike')
  )
);

CREATE INDEX IF NOT EXISTS idx_tr_user       ON public.trades(user_id);
CREATE INDEX IF NOT EXISTS idx_tr_challenge  ON public.trades(challenge_id);
CREATE INDEX IF NOT EXISTS idx_tr_context    ON public.trades(product_context);
CREATE INDEX IF NOT EXISTS idx_tr_created    ON public.trades(created_at);
CREATE INDEX IF NOT EXISTS idx_tr_status     ON public.trades(validation_status);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tr_select_own"
  ON public.trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "tr_insert_own"
  ON public.trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tr_update_own"
  ON public.trades FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_tr_updated
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- 4. CHALLENGE ATTEMPTS (Second Life archive)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.challenge_attempts (
  id                UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id      UUID          NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  attempt_number    INTEGER       NOT NULL,
  status            TEXT          NOT NULL,
  started_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,
  failure_reason    TEXT,
  archived_snapshot JSONB,
  created_at        TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ca_user      ON public.challenge_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_ca_challenge ON public.challenge_attempts(challenge_id);

ALTER TABLE public.challenge_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ca_select_own"
  ON public.challenge_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "ca_insert_own"
  ON public.challenge_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 5. WALL OF TRADERS
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.wall_of_traders (
  id                    UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name          TEXT          NOT NULL,
  anonymized_name       TEXT          NOT NULL,
  challenge_id          UUID          REFERENCES public.challenges(id),
  completed_at          TIMESTAMPTZ   NOT NULL,
  net_profit_percent    NUMERIC(5,2),
  max_drawdown          NUMERIC(5,2),
  validated_trades      INTEGER,
  trader_score          NUMERIC(5,2),
  discipline_rating     TEXT,
  verified              BOOLEAN       DEFAULT FALSE,
  visible               BOOLEAN       DEFAULT TRUE,
  created_at            TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wot_public ON public.wall_of_traders(verified, visible);

ALTER TABLE public.wall_of_traders ENABLE ROW LEVEL SECURITY;

-- Anyone can read verified + visible entries (public social proof)
CREATE POLICY "wot_select_public"
  ON public.wall_of_traders FOR SELECT
  USING (verified = true AND visible = true);

-- Users can also see their own entry regardless
CREATE POLICY "wot_select_own"
  ON public.wall_of_traders FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own entry (validated by frontend + edge function)
CREATE POLICY "wot_insert_own"
  ON public.wall_of_traders FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 6. WEEKLY CHECK-INS
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.weekly_checkins (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id    UUID          NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  week_number     INTEGER       NOT NULL,
  equity          NUMERIC(12,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),

  UNIQUE(challenge_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_wc_user      ON public.weekly_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_wc_challenge ON public.weekly_checkins(challenge_id);

ALTER TABLE public.weekly_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wc_select_own"
  ON public.weekly_checkins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "wc_insert_own"
  ON public.weekly_checkins FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 7. BROKER STATEMENTS
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.broker_statements (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id    UUID          NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  file_url        TEXT,
  status          TEXT          NOT NULL DEFAULT 'submitted',
  submitted_at    TIMESTAMPTZ   DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),

  CONSTRAINT bs_valid_status CHECK (
    status IN ('submitted','reviewed','rejected')
  )
);

CREATE INDEX IF NOT EXISTS idx_bs_user      ON public.broker_statements(user_id);
CREATE INDEX IF NOT EXISTS idx_bs_challenge ON public.broker_statements(challenge_id);

ALTER TABLE public.broker_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bs_select_own"
  ON public.broker_statements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "bs_insert_own"
  ON public.broker_statements FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- HELPER: lookup user_id by email (used by Stripe webhook)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(lookup_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE email = lower(trim(lookup_email)) LIMIT 1;
$$;
