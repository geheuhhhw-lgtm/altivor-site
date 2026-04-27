// ═══════════════════════════════════════════════════════════════════════════
// ALTIVOR — Challenge Sync (Supabase Edge Function)  v2 — FULL ENGINE
// ─────────────────────────────────────────────────────────────────────────
// Complete server-side trade classification, challenge scoring,
// audit trail generation, and Wall of Traders management.
//
// The backend is the SOLE source of truth.
// Frontend values are NEVER trusted for final state.
//
// POST /challenge-sync
// Body: { challenge_id: string }
// Auth: Bearer token (user JWT)
//
// Deploy: supabase functions deploy challenge-sync --no-verify-jwt
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS — must match frontend display engines
   ══════════════════════════════════════════════════════════════════════════ */
const VALIDATED_TARGET   = 55
const STRIKE_THRESHOLD   = 3
const DRAWDOWN_LIMIT     = 10
const PROFIT_TARGET      = 6
const WEEKLY_TARGET      = 8
const MAX_RISK_PERCENT   = 2
const MAX_TRADES_PER_DAY = 5
const SL_WIDEN_THRESHOLD = 0.15  // 15%
const SESSION_START_UTC  = 7
const SESSION_END_UTC    = 21

/* ══════════════════════════════════════════════════════════════════════════
   CHALLENGE SCORE MODEL — starts at 100
   ══════════════════════════════════════════════════════════════════════════ */
const CS = {
  INVALID_PENALTIES: [-6, -8, -10, -12], // 1st, 2nd, 3rd, 4th+ invalid
  WARNING_PENALTY:     -2,
  BEHAVIOR_PENALTY:    -3,    // overtrading / revenge trading / risk inconsistency
  OVERTRADING_PENALTY: -4,
  RULE_BREAK_PENALTY:  -5,    // SL widening (non-strike level)
  VALID_BONUS:          1,    // per valid trade, max +5
  VALID_BONUS_CAP:      5,
  MIN: 0,
  MAX: 100,
  FAILING_THRESHOLD:   60,
}

/* ══════════════════════════════════════════════════════════════════════════
   TRADER SCORE / DISCIPLINE MODEL — starts at 100
   ══════════════════════════════════════════════════════════════════════════ */
const TS = {
  INVALID_BASE: -3,
  INVALID_ESCALATE: -1,
  STRIKE: -10,
  WARNING: -2,
  VALID_CLEAN_BONUS: 0.5,
}

/* ══════════════════════════════════════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════════════════════════════════════ */
interface TradeAudit {
  trade_id: string
  server_status: string
  client_status: string
  status_overridden: boolean
  correct_items: string[]
  violations: string[]
  warnings: string[]
  improvement_actions: string[]
  rule_matrix: Record<string, any>
  counts_toward_challenge: boolean
  score_impact: number
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN HANDLER
   ══════════════════════════════════════════════════════════════════════════ */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
      },
    })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    // ── Auth ───────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No auth token' }, 401)

    const token = authHeader.replace('Bearer ', '')
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const userId = user.id
    const body = await req.json()
    const challengeId = body.challenge_id

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ── 1. Load challenge ────────────────────────────────────────────
    const { data: challenge, error: chErr } = await db
      .from('challenges')
      .select('*')
      .eq('id', challengeId)
      .eq('user_id', userId)
      .single()

    if (chErr || !challenge) return json({ error: 'Challenge not found' }, 404)

    // ── 2. Load ALL trades (ordered by time) ─────────────────────────
    const { data: trades, error: trErr } = await db
      .from('trades')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (trErr) return json({ error: 'Failed to load trades' }, 500)
    const allTrades = trades || []

    // ── 3. Build day-grouped lookup for overtrading detection ────────
    const tradesByDay: Record<string, any[]> = {}
    for (const t of allTrades) {
      const day = (t.entry_time || t.created_at || '').substring(0, 10)
      if (!tradesByDay[day]) tradesByDay[day] = []
      tradesByDay[day].push(t)
    }

    // ── 4. SERVER-SIDE CLASSIFICATION — every single trade ───────────
    let validatedCount = 0
    let invalidCount   = 0
    let strikeCount    = 0
    let warningCount   = 0
    let traderScore    = 100
    let challengeScore = 100
    let invalidSeq     = 0  // sequential invalid counter for escalation

    const auditResults: TradeAudit[] = []
    const tradeUpdates: { id: string; patch: Record<string, any> }[] = []

    for (let i = 0; i < allTrades.length; i++) {
      const t = allTrades[i]
      const audit = classifyTrade(t, allTrades, i, tradesByDay)

      // ── Determine final server status ──────────────────────────────
      let finalStatus = audit.server_status

      // ── Update trade row if server disagrees ───────────────────────
      const overridden = finalStatus !== (t.validation_status || 'pending')
      const countsToward = finalStatus === 'validated' || finalStatus === 'validated_with_warnings'

      const patch: Record<string, any> = {
        validation_status: finalStatus,
        counts_toward_challenge: countsToward,
        violation_tags: audit.violations,
        warnings: audit.warnings.map(w => ({ tag: w, impact: CS.WARNING_PENALTY })),
        invalid_reasons: audit.violations,
      }
      tradeUpdates.push({ id: t.id, patch })

      // ── Aggregate counts ───────────────────────────────────────────
      let scoreImpact = 0

      if (countsToward) {
        validatedCount++
      }

      if (finalStatus === 'invalid' || finalStatus === 'not_counted') {
        invalidCount++
        invalidSeq++
        const idx = Math.min(invalidSeq - 1, CS.INVALID_PENALTIES.length - 1)
        const csPenalty = CS.INVALID_PENALTIES[idx]
        challengeScore += csPenalty
        scoreImpact += csPenalty

        const tsPenalty = TS.INVALID_BASE - (invalidCount - 1) * TS.INVALID_ESCALATE
        traderScore += tsPenalty
      }

      if (finalStatus === 'strike') {
        strikeCount++
        traderScore += TS.STRIKE
        challengeScore += CS.RULE_BREAK_PENALTY
        scoreImpact += CS.RULE_BREAK_PENALTY
      }

      // Warning penalties
      const warnCount = audit.warnings.length
      warningCount += warnCount
      for (let w = 0; w < warnCount; w++) {
        traderScore += TS.WARNING
        challengeScore += CS.WARNING_PENALTY
        scoreImpact += CS.WARNING_PENALTY
      }

      // Behavior penalties (overtrading, revenge trading)
      if (audit.rule_matrix.overtrading) {
        challengeScore += CS.OVERTRADING_PENALTY
        scoreImpact += CS.OVERTRADING_PENALTY
      }
      if (audit.rule_matrix.revenge_trading) {
        challengeScore += CS.BEHAVIOR_PENALTY
        scoreImpact += CS.BEHAVIOR_PENALTY
      }
      if (audit.rule_matrix.risk_inconsistency) {
        challengeScore += CS.BEHAVIOR_PENALTY
        scoreImpact += CS.BEHAVIOR_PENALTY
      }

      // Valid clean trade bonus
      if (finalStatus === 'validated' && warnCount === 0) {
        const bonus = Math.min(CS.VALID_BONUS, CS.VALID_BONUS_CAP - Math.min(validatedCount - 1, CS.VALID_BONUS_CAP))
        if (bonus > 0) {
          challengeScore += bonus
          scoreImpact += bonus
        }
        traderScore += TS.VALID_CLEAN_BONUS
      }

      audit.counts_toward_challenge = countsToward
      audit.score_impact = scoreImpact
      audit.status_overridden = overridden
      audit.client_status = t.validation_status || 'pending'
      auditResults.push(audit)
    }

    // Clamp scores
    traderScore = Math.max(0, Math.min(100, Math.round(traderScore * 100) / 100))
    challengeScore = Math.max(CS.MIN, Math.min(CS.MAX, Math.round(challengeScore)))

    // ── 5. Batch-update all trades ───────────────────────────────────
    for (const u of tradeUpdates) {
      await db.from('trades').update(u.patch).eq('id', u.id)
    }

    // ── 6. Load weekly check-ins + broker statement ──────────────────
    const { data: checkins } = await db
      .from('weekly_checkins')
      .select('id')
      .eq('challenge_id', challengeId)
    const weeklyCount = (checkins || []).length

    const { data: statements } = await db
      .from('broker_statements')
      .select('status')
      .eq('challenge_id', challengeId)
      .in('status', ['submitted', 'reviewed'])
    const statementSubmitted = (statements || []).length > 0
    const brokerStatus = statementSubmitted ? 'submitted' : challenge.broker_statement_status

    // ── 7. Determine challenge status ────────────────────────────────
    const drawdownFailed = parseFloat(challenge.max_drawdown) >= DRAWDOWN_LIMIT
    const netProfit = parseFloat(challenge.net_profit_percent) || 0

    let status = challenge.status
    let failureReason: string | null = null
    let completedAt: string | null = null
    let failedAt: string | null = null

    // Hard fail: drawdown
    if (drawdownFailed) {
      status = 'failed'
      failureReason = `Maximum drawdown exceeded (${challenge.max_drawdown}% >= ${DRAWDOWN_LIMIT}%)`
      failedAt = new Date().toISOString()
    }
    // Hard fail: 3 strikes
    else if (strikeCount >= STRIKE_THRESHOLD) {
      status = 'failed'
      failureReason = `${strikeCount} strikes accumulated (threshold: ${STRIKE_THRESHOLD})`
      failedAt = new Date().toISOString()
    }
    // Hard fail: score below threshold with significant trades
    else if (challengeScore < CS.FAILING_THRESHOLD && allTrades.length >= 10) {
      status = 'failed'
      failureReason = `Challenge score ${challengeScore} below minimum ${CS.FAILING_THRESHOLD}`
      failedAt = new Date().toISOString()
    }
    else {
      // Completion check
      const allComplete = validatedCount >= VALIDATED_TARGET
        && weeklyCount >= WEEKLY_TARGET
        && netProfit >= PROFIT_TARGET
        && !drawdownFailed
        && statementSubmitted
        && strikeCount < STRIKE_THRESHOLD

      if (allComplete) {
        status = 'ready_for_final_verification'
        completedAt = new Date().toISOString()
      } else if (validatedCount >= VALIDATED_TARGET) {
        status = 'completed'
      } else if (strikeCount > 0 || warningCount >= 5 || traderScore < CS.FAILING_THRESHOLD) {
        status = 'at_risk'
      } else if (validatedCount > 0 && traderScore >= CS.FAILING_THRESHOLD) {
        status = 'passing'
      } else {
        status = 'active'
      }
    }

    // Second Life availability
    if (status === 'failed' && !challenge.second_life_used) {
      status = 'second_life_available'
    }

    // Discipline rating
    let disciplineRating = 'Institutional'
    if (traderScore < 40) disciplineRating = 'Chaotic'
    else if (traderScore < 60) disciplineRating = 'High Risk'
    else if (traderScore < 75) disciplineRating = 'Needs Improvement'
    else if (traderScore < 90) disciplineRating = 'Controlled'

    // ── 8. Update challenge record ───────────────────────────────────
    const updatePayload: Record<string, any> = {
      status,
      validated_trade_count: validatedCount,
      invalid_trade_count: invalidCount,
      warning_count: warningCount,
      strike_count: strikeCount,
      trader_score: traderScore,
      challenge_score: challengeScore,
      discipline_rating: disciplineRating,
      weekly_checkins_completed: weeklyCount,
      broker_statement_status: brokerStatus,
    }

    if (failedAt) updatePayload.failed_at = failedAt
    if (failureReason) updatePayload.failure_reason = failureReason
    if (completedAt) updatePayload.completed_at = completedAt

    const { error: updateErr } = await db
      .from('challenges')
      .update(updatePayload)
      .eq('id', challengeId)

    if (updateErr) {
      console.error('[Sync] Update failed:', updateErr)
      return json({ error: 'update_failed' }, 500)
    }

    // ── 9. Write audit trail ─────────────────────────────────────────
    for (let i = 0; i < auditResults.length; i++) {
      const a = auditResults[i]
      await db.from('trade_audit_results').upsert({
        trade_id: a.trade_id,
        challenge_id: challengeId,
        user_id: userId,
        server_status: a.server_status,
        client_status: a.client_status,
        status_overridden: a.status_overridden,
        correct_items: a.correct_items,
        violations: a.violations,
        warnings: a.warnings,
        improvement_actions: a.improvement_actions,
        rule_matrix: a.rule_matrix,
        counts_toward_challenge: a.counts_toward_challenge,
        score_impact: a.score_impact,
        challenge_status: status,
        validated_progress: validatedCount,
        total_progress: allTrades.length,
        current_score: challengeScore,
        current_strikes: strikeCount,
      }, { onConflict: 'trade_id' })
    }

    // ── 10. Wall of Traders (service-role-only insert) ───────────────
    if (status === 'ready_for_final_verification') {
      const { data: existingWot } = await db
        .from('wall_of_traders')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

      if (!existingWot) {
        const email = user.email || ''
        const nick = email.split('@')[0]
        const anonName = nick.length > 3 ? nick.substring(0, 3) + '***' : nick + '***'

        await db.from('wall_of_traders').insert({
          user_id: userId,
          display_name: 'Trader_' + anonName,
          anonymized_name: anonName,
          challenge_id: challengeId,
          completed_at: completedAt || new Date().toISOString(),
          net_profit_percent: netProfit,
          max_drawdown: challenge.max_drawdown,
          validated_trades: validatedCount,
          trader_score: traderScore,
          discipline_rating: disciplineRating,
          verified: true,
          visible: true,
        })
        console.log(`[Sync] ✓ Added to Wall of Traders: ${email}`)
      }
    }

    console.log(`[Sync] ✓ Challenge ${challengeId}: ${status}, ${validatedCount}/${VALIDATED_TARGET}, CS=${challengeScore}, TS=${traderScore}, strikes=${strikeCount}`)

    // ── 11. Build response with per-trade audit data ─────────────────
    const latestAudit = auditResults.length > 0 ? auditResults[auditResults.length - 1] : null

    return json({
      success: true,
      challenge: {
        ...challenge,
        ...updatePayload,
        failed_at: failedAt || challenge.failed_at,
        failure_reason: failureReason || challenge.failure_reason,
        completed_at: completedAt || challenge.completed_at,
      },
      summary: {
        total_trades: allTrades.length,
        validated: validatedCount,
        invalid: invalidCount,
        strikes: strikeCount,
        warnings: warningCount,
        challenge_score: challengeScore,
        trader_score: traderScore,
        discipline_rating: disciplineRating,
        weekly_checkins: weeklyCount,
        broker_statement: brokerStatus,
        net_profit: netProfit,
        max_drawdown: parseFloat(challenge.max_drawdown) || 0,
        status,
      },
      latest_trade_audit: latestAudit,
      audit_count: auditResults.length,
      overrides: auditResults.filter(a => a.status_overridden).length,
    })

  } catch (err) {
    console.error('[Sync] Error:', err)
    return json({ error: 'sync_failed' }, 500)
  }
})


/* ══════════════════════════════════════════════════════════════════════════
   FULL SERVER-SIDE TRADE CLASSIFICATION
   This is the authoritative engine. Frontend classification is advisory only.
   ══════════════════════════════════════════════════════════════════════════ */
function classifyTrade(trade: any, allTrades: any[], index: number, tradesByDay: Record<string, any[]>): TradeAudit {
  const entry    = pf(trade.entry_price)
  const exit     = pf(trade.exit_price)
  const sl       = pf(trade.stop_loss)
  const tp       = pf(trade.take_profit)
  const lotSize  = pf(trade.lot_size)
  const riskPct  = pf(trade.risk_percent)
  const equity   = pf(trade.account_equity) || 10000
  const pnl      = pf(trade.pnl)
  const hasNotes = !!(trade.notes && trade.notes.trim())
  const hasScreenshot = !!(trade.screenshot_url && trade.screenshot_url.trim())
  const strategyId = trade.strategy_id
  const ecSnapshot = trade.execution_checklist_snapshot as any
  const entryTime  = trade.entry_time || trade.created_at || ''
  const day = entryTime.substring(0, 10)

  const violations: string[] = []
  const warnings: string[]   = []
  const correct: string[]    = []
  const actions: string[]    = []
  const ruleMatrix: Record<string, any> = {}

  // ── INVALID RULES ────────────────────────────────────────────────────

  // 1. No stop loss
  if (sl <= 0 || sl === entry) {
    violations.push('no_stop_loss')
    actions.push('Always define a stop loss before entry.')
    ruleMatrix.stop_loss = 'missing'
  } else {
    correct.push('Stop loss defined')
    ruleMatrix.stop_loss = 'ok'
  }

  // 2. Excessive risk (>2%)
  let calculatedRisk = riskPct
  if (entry > 0 && sl > 0 && lotSize > 0 && equity > 0) {
    calculatedRisk = (lotSize * Math.abs(entry - sl) / equity) * 100
  }
  ruleMatrix.risk_percent = Math.round((calculatedRisk || 0) * 100) / 100
  if (calculatedRisk > MAX_RISK_PERCENT) {
    violations.push('excessive_risk')
    actions.push(`Reduce position size. Risk was ${calculatedRisk.toFixed(2)}%, max allowed is ${MAX_RISK_PERCENT}%.`)
    ruleMatrix.risk = 'exceeded'
  } else if (calculatedRisk > 0) {
    correct.push(`Risk within limit (${calculatedRisk.toFixed(2)}%)`)
    ruleMatrix.risk = 'ok'
  }

  // 3. Missing screenshot AND missing notes (both absent)
  if (!hasScreenshot && !hasNotes) {
    violations.push('no_documentation')
    actions.push('Attach a screenshot or write trade notes for every trade.')
    ruleMatrix.documentation = 'missing'
  }

  // 4. No framework / strategy setup
  if (!strategyId || strategyId === '' || strategyId === 'none') {
    violations.push('no_framework')
    actions.push('Select a framework/strategy setup before logging a trade.')
    ruleMatrix.framework = 'missing'
  } else {
    correct.push(`Framework: ${strategyId}`)
    ruleMatrix.framework = 'ok'
  }

  // 5. Missing entry price
  if (entry <= 0) {
    violations.push('missing_entry_price')
    ruleMatrix.entry_price = 'missing'
  } else {
    correct.push('Entry price recorded')
    ruleMatrix.entry_price = 'ok'
  }

  // 6. Missing exit price
  if (exit <= 0) {
    violations.push('missing_exit_price')
    ruleMatrix.exit_price = 'missing'
  } else {
    correct.push('Exit price recorded')
    ruleMatrix.exit_price = 'ok'
  }

  // 7. Missing take profit
  if (tp <= 0) {
    violations.push('missing_take_profit')
    ruleMatrix.take_profit = 'missing'
  } else {
    correct.push('Take profit defined')
    ruleMatrix.take_profit = 'ok'
  }

  // 8. Non-compliant checklist
  if (ecSnapshot && ecSnapshot.nonCompliantFlag === true) {
    violations.push('non_compliant_checklist')
    actions.push('Review execution checklist and ensure compliance before entry.')
    ruleMatrix.checklist = 'non_compliant'
  } else if (ecSnapshot) {
    correct.push('Execution checklist compliant')
    ruleMatrix.checklist = 'ok'
  }

  // ── WARNING RULES ────────────────────────────────────────────────────

  // 1. Missing screenshot but notes exist
  if (!hasScreenshot && hasNotes) {
    warnings.push('missing_screenshot')
    actions.push('Add a screenshot for visual trade documentation.')
    ruleMatrix.screenshot = 'missing_but_notes_ok'
  } else if (hasScreenshot) {
    correct.push('Screenshot attached')
    ruleMatrix.screenshot = 'ok'
  }

  // 2. Outside session window (07:00-21:00 UTC)
  if (entryTime) {
    const hour = parseHourUTC(entryTime)
    if (hour !== null && (hour < SESSION_START_UTC || hour >= SESSION_END_UTC)) {
      warnings.push('outside_session_window')
      actions.push(`Trade entered at ${hour}:00 UTC. Recommended session: ${SESSION_START_UTC}:00-${SESSION_END_UTC}:00 UTC.`)
      ruleMatrix.session = 'outside'
    } else {
      ruleMatrix.session = 'ok'
    }
  }

  // 3. Overtrading (>5 trades on same day)
  const dayTrades = tradesByDay[day] || []
  ruleMatrix.trades_today = dayTrades.length
  if (dayTrades.length > MAX_TRADES_PER_DAY) {
    warnings.push('overtrading')
    actions.push(`${dayTrades.length} trades on ${day}. Maximum recommended: ${MAX_TRADES_PER_DAY}/day.`)
    ruleMatrix.overtrading = true
  } else {
    ruleMatrix.overtrading = false
  }

  // 4. Revenge trading: loss immediately followed by another trade within 30 min
  ruleMatrix.revenge_trading = false
  if (index > 0) {
    const prev = allTrades[index - 1]
    const prevPnl = pf(prev.pnl)
    if (prevPnl < 0) {
      const prevExit = prev.exit_time || prev.created_at || ''
      const currEntry = entryTime
      if (prevExit && currEntry) {
        const diffMs = new Date(currEntry).getTime() - new Date(prevExit).getTime()
        if (diffMs > 0 && diffMs < 30 * 60 * 1000) {
          warnings.push('revenge_trading')
          actions.push('Avoid entering immediately after a loss. Wait at least 30 minutes.')
          ruleMatrix.revenge_trading = true
        }
      }
    }
  }

  // 5. Risk inconsistency: risk varies >50% from median of last 10 trades
  ruleMatrix.risk_inconsistency = false
  if (calculatedRisk > 0 && index >= 3) {
    const recentRisks: number[] = []
    for (let j = Math.max(0, index - 10); j < index; j++) {
      const rr = pf(allTrades[j].risk_percent)
      if (rr > 0) recentRisks.push(rr)
    }
    if (recentRisks.length >= 3) {
      const sorted = recentRisks.sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      if (median > 0 && Math.abs(calculatedRisk - median) / median > 0.5) {
        warnings.push('risk_inconsistency')
        actions.push(`Risk ${calculatedRisk.toFixed(2)}% deviates significantly from recent median ${median.toFixed(2)}%.`)
        ruleMatrix.risk_inconsistency = true
      }
    }
  }

  // ── STRIKE RULES ─────────────────────────────────────────────────────

  // SL widening >15% beyond original distance
  ruleMatrix.sl_widening = false
  if (sl > 0 && entry > 0 && ecSnapshot) {
    const originalSl = pf(ecSnapshot.originalStopLoss) || pf(ecSnapshot.planned_sl)
    if (originalSl > 0 && originalSl !== sl) {
      const originalDist = Math.abs(entry - originalSl)
      const currentDist  = Math.abs(entry - sl)
      if (originalDist > 0) {
        const widening = (currentDist - originalDist) / originalDist
        ruleMatrix.sl_widening_pct = Math.round(widening * 100)
        if (widening > SL_WIDEN_THRESHOLD) {
          violations.push('sl_widening_strike')
          actions.push(`Stop loss widened by ${(widening * 100).toFixed(1)}% (threshold: ${SL_WIDEN_THRESHOLD * 100}%). Strike issued.`)
          ruleMatrix.sl_widening = true
        }
      }
    }
  }

  // ── DETERMINE FINAL STATUS ───────────────────────────────────────────
  const isStrike = violations.includes('sl_widening_strike')
  const invalidViolations = violations.filter(v => v !== 'sl_widening_strike')
  const hasInvalidViolation = invalidViolations.length > 0

  let serverStatus: string
  if (isStrike) {
    serverStatus = 'strike'
  } else if (hasInvalidViolation) {
    serverStatus = 'invalid'
  } else if (warnings.length > 0) {
    serverStatus = 'validated_with_warnings'
  } else {
    serverStatus = 'validated'
  }

  return {
    trade_id: trade.id,
    server_status: serverStatus,
    client_status: trade.validation_status || 'pending',
    status_overridden: false,
    correct_items: correct,
    violations,
    warnings,
    improvement_actions: actions,
    rule_matrix: ruleMatrix,
    counts_toward_challenge: serverStatus === 'validated' || serverStatus === 'validated_with_warnings',
    score_impact: 0,
  }
}


/* ── Helpers ─────────────────────────────────────────────────────────────── */
function pf(v: any): number {
  if (v === undefined || v === null || v === '') return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

function parseHourUTC(isoStr: string): number | null {
  try {
    const d = new Date(isoStr)
    return isNaN(d.getTime()) ? null : d.getUTCHours()
  } catch { return null }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
