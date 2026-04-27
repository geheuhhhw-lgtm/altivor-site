-- ═══════════════════════════════════════════════════════════════════════════
-- ALTIVOR — SAFE REPAIR MIGRATION (idempotent, no data loss)
-- ═══════════════════════════════════════════════════════════════════════════
-- Handles pre-existing trades + challenges tables with old schemas.
-- Uses ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS, DO $$ blocks.
-- Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════
-- 0. HELPER FUNCTION
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ══════════════════════════════════════════════════════════════════════════
-- 1. USER ENTITLEMENTS — create if missing
-- ══════════════════════════════════════════════════════════════════════════
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
  updated_at                  TIMESTAMPTZ   DEFAULT NOW()
);

-- Safe add columns if table existed but was missing some
ALTER TABLE public.user_entitlements ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE public.user_entitlements ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
ALTER TABLE public.user_entitlements ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE public.user_entitlements ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.user_entitlements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Constraints (safe: ignore if exists)
DO $$ BEGIN
  ALTER TABLE public.user_entitlements ADD CONSTRAINT ue_valid_product
    CHECK (product_key IN ('prepare','frameworkPack','us100Framework','accessories'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.user_entitlements ADD CONSTRAINT ue_valid_status
    CHECK (status IN ('active','inactive','refunded','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_ue_user_id ON public.user_entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_ue_email   ON public.user_entitlements(email);
CREATE INDEX IF NOT EXISTS idx_ue_product ON public.user_entitlements(product_key, status);
CREATE INDEX IF NOT EXISTS idx_ue_session ON public.user_entitlements(stripe_checkout_session_id);

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ue_select_own" ON public.user_entitlements;
CREATE POLICY "ue_select_own"
  ON public.user_entitlements FOR SELECT
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_ue_updated ON public.user_entitlements;
CREATE TRIGGER trg_ue_updated
  BEFORE UPDATE ON public.user_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ══════════════════════════════════════════════════════════════════════════
-- 2. CHALLENGES — patch existing table with missing columns
-- ══════════════════════════════════════════════════════════════════════════
-- Table already exists. Add every column our schema requires.
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS product_key TEXT;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS second_life_used BOOLEAN DEFAULT FALSE;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS validated_trade_count INTEGER DEFAULT 0;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS invalid_trade_count INTEGER DEFAULT 0;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS strike_count INTEGER DEFAULT 0;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS trader_score NUMERIC(5,2) DEFAULT 100;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS challenge_score NUMERIC(5,2) DEFAULT 100;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS discipline_rating TEXT DEFAULT 'Institutional';
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS peak_equity NUMERIC(12,2) DEFAULT 10000;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS current_equity NUMERIC(12,2) DEFAULT 10000;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS max_drawdown NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS net_profit_percent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS weekly_checkins_completed INTEGER DEFAULT 0;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS broker_statement_status TEXT DEFAULT 'missing';
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Constraints (safe)
DO $$ BEGIN
  ALTER TABLE public.challenges ADD CONSTRAINT ch_valid_status
    CHECK (status IN ('active','passing','at_risk','failed','invalidated','completed','ready_for_final_verification','second_life_available'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.challenges ADD CONSTRAINT ch_valid_broker
    CHECK (broker_statement_status IN ('missing','submitted','reviewed','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.challenges ADD CONSTRAINT ch_valid_product
    CHECK (product_key IN ('frameworkPack','us100Framework'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_ch_user   ON public.challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_ch_status ON public.challenges(user_id, status);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ch_select_own" ON public.challenges;
CREATE POLICY "ch_select_own"
  ON public.challenges FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ch_insert_own" ON public.challenges;
CREATE POLICY "ch_insert_own"
  ON public.challenges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ch_update_own" ON public.challenges;
CREATE POLICY "ch_update_own"
  ON public.challenges FOR UPDATE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_ch_updated ON public.challenges;
CREATE TRIGGER trg_ch_updated
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ══════════════════════════════════════════════════════════════════════════
-- 3. TRADES — patch existing table with missing columns
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS challenge_id UUID REFERENCES public.challenges(id) ON DELETE SET NULL;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS product_context TEXT DEFAULT '55_trade_cycle';
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS strategy_id TEXT;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS entry_price NUMERIC(14,5);
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS exit_price NUMERIC(14,5);
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS stop_loss NUMERIC(14,5);
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS take_profit NUMERIC(14,5);
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS lot_size NUMERIC(10,4);
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS planned_risk NUMERIC(12,2);
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS actual_risk NUMERIC(12,2);
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS risk_percent NUMERIC(5,2);
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS account_equity NUMERIC(12,2);
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS entry_time TIMESTAMPTZ;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS exit_time TIMESTAMPTZ;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS pnl NUMERIC(12,2);
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS rr_planned NUMERIC(6,2);
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS rr_realized NUMERIC(6,2);
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'pending';
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS counts_toward_challenge BOOLEAN DEFAULT FALSE;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS violation_tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS warnings JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS invalid_reasons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS evaluation_result JSONB;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS execution_checklist_snapshot JSONB;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Constraints (safe)
DO $$ BEGIN
  ALTER TABLE public.trades ADD CONSTRAINT tr_valid_context
    CHECK (product_context IN ('prepare','55_trade_cycle'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.trades ADD CONSTRAINT tr_valid_status
    CHECK (validation_status IN ('pending','validated','validated_with_warnings','invalid','not_counted','strike'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_tr_user      ON public.trades(user_id);
CREATE INDEX IF NOT EXISTS idx_tr_challenge ON public.trades(challenge_id);
CREATE INDEX IF NOT EXISTS idx_tr_context   ON public.trades(product_context);
CREATE INDEX IF NOT EXISTS idx_tr_created   ON public.trades(created_at);
CREATE INDEX IF NOT EXISTS idx_tr_status    ON public.trades(validation_status);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tr_select_own" ON public.trades;
CREATE POLICY "tr_select_own"
  ON public.trades FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tr_insert_own" ON public.trades;
CREATE POLICY "tr_insert_own"
  ON public.trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tr_update_own" ON public.trades;
CREATE POLICY "tr_update_own"
  ON public.trades FOR UPDATE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_tr_updated ON public.trades;
CREATE TRIGGER trg_tr_updated
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ══════════════════════════════════════════════════════════════════════════
-- 4. CHALLENGE ATTEMPTS — create if missing
-- ══════════════════════════════════════════════════════════════════════════
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

DROP POLICY IF EXISTS "ca_select_own" ON public.challenge_attempts;
CREATE POLICY "ca_select_own"
  ON public.challenge_attempts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ca_insert_own" ON public.challenge_attempts;
CREATE POLICY "ca_insert_own"
  ON public.challenge_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════════════════════
-- 5. WALL OF TRADERS — create if missing
-- ══════════════════════════════════════════════════════════════════════════
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

DROP POLICY IF EXISTS "wot_select_public" ON public.wall_of_traders;
CREATE POLICY "wot_select_public"
  ON public.wall_of_traders FOR SELECT
  USING (verified = true AND visible = true);

DROP POLICY IF EXISTS "wot_select_own" ON public.wall_of_traders;
CREATE POLICY "wot_select_own"
  ON public.wall_of_traders FOR SELECT
  USING (auth.uid() = user_id);

-- This INSERT policy will be DROPped by migration 2b (hardening).
-- Create it so migration 1 is complete, then 2b removes it.
DROP POLICY IF EXISTS "wot_insert_own" ON public.wall_of_traders;
CREATE POLICY "wot_insert_own"
  ON public.wall_of_traders FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════════════════════
-- 6. WEEKLY CHECK-INS — create if missing
-- ══════════════════════════════════════════════════════════════════════════
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

DROP POLICY IF EXISTS "wc_select_own" ON public.weekly_checkins;
CREATE POLICY "wc_select_own"
  ON public.weekly_checkins FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wc_insert_own" ON public.weekly_checkins;
CREATE POLICY "wc_insert_own"
  ON public.weekly_checkins FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════════════════════
-- 7. BROKER STATEMENTS — create if missing
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.broker_statements (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id    UUID          NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  file_url        TEXT,
  status          TEXT          NOT NULL DEFAULT 'submitted',
  submitted_at    TIMESTAMPTZ   DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE public.broker_statements ADD CONSTRAINT bs_valid_status
    CHECK (status IN ('submitted','reviewed','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_bs_user      ON public.broker_statements(user_id);
CREATE INDEX IF NOT EXISTS idx_bs_challenge ON public.broker_statements(challenge_id);

ALTER TABLE public.broker_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bs_select_own" ON public.broker_statements;
CREATE POLICY "bs_select_own"
  ON public.broker_statements FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bs_insert_own" ON public.broker_statements;
CREATE POLICY "bs_insert_own"
  ON public.broker_statements FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════════════════════
-- 8. HELPER FUNCTION: get_user_id_by_email
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(lookup_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE email = lower(trim(lookup_email)) LIMIT 1;
$$;


-- ══════════════════════════════════════════════════════════════════════════
-- 9. PENDING ENTITLEMENTS — create if missing
-- ══════════════════════════════════════════════════════════════════════════
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
  claimed_by_user_id          UUID          REFERENCES auth.users(id)
);

DO $$ BEGIN
  ALTER TABLE public.pending_entitlements ADD CONSTRAINT pe_valid_product
    CHECK (product_key IN ('prepare','frameworkPack','us100Framework','accessories'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.pending_entitlements ADD CONSTRAINT pe_valid_status
    CHECK (status IN ('pending','claimed','refunded','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_pe_email   ON public.pending_entitlements(email, status);
CREATE INDEX IF NOT EXISTS idx_pe_session ON public.pending_entitlements(stripe_checkout_session_id);

ALTER TABLE public.pending_entitlements ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════════════
-- 10. RPC: claim_pending_entitlements
-- ══════════════════════════════════════════════════════════════════════════
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
    IF NOT EXISTS (
      SELECT 1 FROM user_entitlements
      WHERE stripe_checkout_session_id = rec.stripe_checkout_session_id
    ) THEN
      INSERT INTO user_entitlements (
        user_id, email, product_key,
        stripe_customer_id, stripe_checkout_session_id, stripe_payment_intent_id,
        status, purchased_at
      ) VALUES (
        user_uuid, rec.email, rec.product_key,
        rec.stripe_customer_id, rec.stripe_checkout_session_id, rec.stripe_payment_intent_id,
        'active', rec.created_at
      );

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

    UPDATE pending_entitlements
    SET status = 'claimed',
        claimed_at = NOW(),
        claimed_by_user_id = user_uuid
    WHERE id = rec.id;
  END LOOP;

  RETURN jsonb_build_object('claimed', claimed_count, 'items', result);
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════
-- 11. RLS HARDENING — Wall of Traders
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "wot_insert_own" ON public.wall_of_traders;

DROP POLICY IF EXISTS "wot_update_own_visible" ON public.wall_of_traders;
CREATE POLICY "wot_update_own_visible"
  ON public.wall_of_traders FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════════════════════
-- 12. TRADE AUDIT RESULTS — create if missing
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.trade_audit_results (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id        UUID          NOT NULL UNIQUE REFERENCES public.trades(id) ON DELETE CASCADE,
  challenge_id    UUID          REFERENCES public.challenges(id) ON DELETE SET NULL,
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  server_status           TEXT NOT NULL,
  client_status           TEXT,
  status_overridden       BOOLEAN DEFAULT FALSE,
  correct_items           JSONB DEFAULT '[]'::jsonb,
  violations              JSONB DEFAULT '[]'::jsonb,
  warnings                JSONB DEFAULT '[]'::jsonb,
  improvement_actions     JSONB DEFAULT '[]'::jsonb,
  rule_matrix             JSONB DEFAULT '{}'::jsonb,
  counts_toward_challenge BOOLEAN DEFAULT FALSE,
  score_impact            NUMERIC(5,2) DEFAULT 0,
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

DROP POLICY IF EXISTS "tar_select_own" ON public.trade_audit_results;
CREATE POLICY "tar_select_own"
  ON public.trade_audit_results FOR SELECT
  USING (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════════════════════
-- 13. SOCIAL METRICS RPC
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.platform_social_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validated_trades     BIGINT;
  v_total_trades         BIGINT;
  v_invalid_trades       BIGINT;
  v_warning_trades       BIGINT;
  v_active_users         BIGINT;
  v_prepare_completions  BIGINT;
  v_wot_count            BIGINT;
  v_avg_execution_score  NUMERIC(5,2);
  v_rule_compliance      NUMERIC(5,2);
  v_active_challenges    BIGINT;
  v_completed_challenges BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_validated_trades
  FROM trades
  WHERE validation_status IN ('validated', 'validated_with_warnings')
    AND counts_toward_challenge = TRUE;

  SELECT COUNT(*) INTO v_total_trades FROM trades;

  SELECT COUNT(*) INTO v_invalid_trades
  FROM trades
  WHERE validation_status IN ('invalid', 'not_counted', 'strike');

  SELECT COUNT(*) INTO v_warning_trades
  FROM trades
  WHERE validation_status = 'validated_with_warnings';

  SELECT COUNT(DISTINCT u) INTO v_active_users
  FROM (
    SELECT user_id AS u FROM trades
    WHERE created_at >= NOW() - INTERVAL '30 days'
    UNION
    SELECT user_id AS u FROM weekly_checkins
    WHERE created_at >= NOW() - INTERVAL '30 days'
    UNION
    SELECT user_id AS u FROM broker_statements
    WHERE created_at >= NOW() - INTERVAL '30 days'
    UNION
    SELECT user_id AS u FROM user_entitlements
    WHERE status = 'active'
      AND (purchased_at >= NOW() - INTERVAL '30 days'
           OR updated_at >= NOW() - INTERVAL '30 days')
  ) sub;

  SELECT COUNT(DISTINCT user_id) INTO v_prepare_completions
  FROM user_entitlements
  WHERE product_key = 'prepare'
    AND status = 'active';

  SELECT COUNT(*) INTO v_wot_count
  FROM wall_of_traders
  WHERE verified = TRUE AND visible = TRUE;

  SELECT COALESCE(ROUND(AVG(trader_score), 2), 0) INTO v_avg_execution_score
  FROM challenges
  WHERE status IN ('active', 'passing', 'completed', 'ready_for_final_verification')
    AND validated_trade_count > 0;

  IF v_total_trades > 0 THEN
    v_rule_compliance := ROUND((v_validated_trades::NUMERIC / v_total_trades::NUMERIC) * 100, 1);
  ELSE
    v_rule_compliance := 0;
  END IF;

  SELECT COUNT(*) INTO v_active_challenges
  FROM challenges
  WHERE status IN ('active', 'passing', 'at_risk');

  SELECT COUNT(*) INTO v_completed_challenges
  FROM challenges
  WHERE status IN ('completed', 'ready_for_final_verification');

  RETURN jsonb_build_object(
    'validated_trades',        v_validated_trades,
    'total_submitted_trades',  v_total_trades,
    'invalid_trades',          v_invalid_trades,
    'warning_trades',          v_warning_trades,
    'active_users',            v_active_users,
    'prepare_completions',     v_prepare_completions,
    'wall_of_traders_count',   v_wot_count,
    'average_execution_score', v_avg_execution_score,
    'rule_compliance_percent', v_rule_compliance,
    'active_challenges',       v_active_challenges,
    'completed_challenges',    v_completed_challenges
  );
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════
-- DONE — All 3 migrations merged into one safe repair script.
-- ══════════════════════════════════════════════════════════════════════════
