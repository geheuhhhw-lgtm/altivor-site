-- ═══════════════════════════════════════════════════════════════════════════
-- ALTIVOR — Platform Social Metrics (public aggregation)
-- Migration: 20260427c_social_metrics.sql
--
-- Run AFTER 20260427b_pending_entitlements_hardening.sql
--
-- Creates an RPC function that returns aggregated, privacy-safe
-- platform statistics for the Social Proof page.
-- No user emails, no personal data, no individual account details.
-- ═══════════════════════════════════════════════════════════════════════════


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
  -- Validated trades: validated OR validated_with_warnings AND counts_toward_challenge
  SELECT COUNT(*) INTO v_validated_trades
  FROM trades
  WHERE validation_status IN ('validated', 'validated_with_warnings')
    AND counts_toward_challenge = TRUE;

  -- Total submitted trades
  SELECT COUNT(*) INTO v_total_trades FROM trades;

  -- Invalid trades
  SELECT COUNT(*) INTO v_invalid_trades
  FROM trades
  WHERE validation_status IN ('invalid', 'not_counted', 'strike');

  -- Warning trades
  SELECT COUNT(*) INTO v_warning_trades
  FROM trades
  WHERE validation_status = 'validated_with_warnings';

  -- Active users: users who submitted a trade, check-in, or statement in the last 30 days,
  -- OR have an active entitlement (purchased/active).
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

  -- PREPARE completions: users who purchased PREPARE (entitlement exists and active)
  SELECT COUNT(DISTINCT user_id) INTO v_prepare_completions
  FROM user_entitlements
  WHERE product_key = 'prepare'
    AND status = 'active';

  -- Wall of Traders verified + visible count
  SELECT COUNT(*) INTO v_wot_count
  FROM wall_of_traders
  WHERE verified = TRUE AND visible = TRUE;

  -- Average execution / trader score across active or completed challenges
  SELECT COALESCE(ROUND(AVG(trader_score), 2), 0) INTO v_avg_execution_score
  FROM challenges
  WHERE status IN ('active', 'passing', 'completed', 'ready_for_final_verification')
    AND validated_trade_count > 0;

  -- Rule compliance: validated / total × 100
  IF v_total_trades > 0 THEN
    v_rule_compliance := ROUND((v_validated_trades::NUMERIC / v_total_trades::NUMERIC) * 100, 1);
  ELSE
    v_rule_compliance := 0;
  END IF;

  -- Active challenges
  SELECT COUNT(*) INTO v_active_challenges
  FROM challenges
  WHERE status IN ('active', 'passing', 'at_risk');

  -- Completed challenges
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
