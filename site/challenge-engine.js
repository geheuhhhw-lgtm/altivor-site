/**
 * ALTIVOR INSTITUTE — Challenge Engine v1
 * Unified challenge state manager for the 55 Trade Cycle.
 *
 * Runs deterministically on EVERY trade submission.
 * Writes results to localStorage so both verification-trades.html
 * and verification-status.html see the same state.
 *
 * Data flow:
 *   trade submitted → processTrade() → classify → warnings → score →
 *   update counters → update status → persist → render audit summary
 */
(function () {
  'use strict';

  // ═══ STORAGE KEYS ═══════════════════════════════════════════════════════
  var TRADES_KEY    = 'altivor_verification_trades_v1';
  var ENGINE_KEY    = 'altivor_challenge_engine_v1';
  var SCORE_KEY     = 'altivor_challenge_score_v1';
  var DRAWDOWN_KEY  = 'altivor_verification_drawdown_v1';
  var DAILY_LOG_KEY = 'altivor_daily_log_v1';
  var VIOLATION_KEY = 'altivor_violation_log_v1';
  var SECOND_LIFE_KEY = 'altivor_second_life_v1';
  var WEEKLY_KEY    = 'altivor_verification_weekly_v1';
  var PROFIT_KEY    = 'altivor_verification_profit_v1';
  var STATEMENT_KEY = 'altivor_verification_statement_v1';

  // ═══ THRESHOLDS ═════════════════════════════════════════════════════════
  var STRIKE_THRESHOLD      = 3;
  var VALIDATED_TARGET      = 55;
  var WEEKLY_TARGET          = 8;
  var PROFIT_TARGET          = 6;      // %
  var DRAWDOWN_LIMIT         = 10;     // %
  var MAX_RISK_PERCENT       = 2;
  var MAX_TRADES_PER_DAY     = 5;
  var REVENGE_WINDOW_MS      = 10 * 60 * 1000;  // 10 minutes
  var INACTIVITY_FAIL_DAYS   = 9;
  var SESSION_START_UTC      = 7;
  var SESSION_END_UTC        = 21;

  // ═══ TRADER SCORE IMPACTS ═══════════════════════════════════════════════
  var SCORE_IMPACT = {
    VALID_CLEAN:       +1,
    MISSING_SCREENSHOT: -2,
    OUTSIDE_SESSION:   -3,
    OVERTRADING:       -5,
    REVENGE_TRADE:     -7,
    RISK_INCONSISTENCY:-5,
    INVALID_MINOR:     -6,
    INVALID_MODERATE:  -8,
    INVALID_SEVERE:    -10,
    INVALID_CRITICAL:  -12
  };

  // ═══ DATA LAYER ═════════════════════════════════════════════════════════
  function load(key, fallback) {
    try { var d = localStorage.getItem(key); return d ? JSON.parse(d) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
  }

  function loadTrades() { return load(TRADES_KEY, { trades: [] }); }
  function loadEngineState() { return load(ENGINE_KEY, null) || getDefaultState(); }
  function loadDrawdown() { return load(DRAWDOWN_KEY, { peakEquity: 10000, currentEquity: 10000, failed: false }); }
  function loadWeekly() { return load(WEEKLY_KEY, { checkins: [] }); }
  function loadProfit() { return load(PROFIT_KEY, { startingBalance: 10000, month1Balance: 0, month2Balance: 0 }); }
  function loadStatement() { return load(STATEMENT_KEY, { submitted: false }); }
  function loadSecondLife() { return load(SECOND_LIFE_KEY, null); }
  function loadDailyLog() { return load(DAILY_LOG_KEY, { entries: {} }); }

  function getDefaultState() {
    return {
      status: 'ACTIVE',
      validatedTradeCount: 0,
      invalidTradeCount: 0,
      warningCount: 0,
      strikeCount: 0,
      traderScore: 100,
      disciplineRating: 'Institutional',
      peakEquity: 10000,
      currentEquity: 10000,
      maxDrawdown: 0,
      netProfitPercent: 0,
      weeklyCheckInsCompleted: 0,
      brokerStatementStatus: 'missing',
      secondLifeUsed: false,
      currentAttemptNumber: 1,
      failedAt: null,
      failureReason: null,
      completedAt: null,
      tradeResults: [],
      strikes: [],
      warnings: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // CLASSIFY SINGLE TRADE — exact rule matrix from spec
  // ═══════════════════════════════════════════════════════════════════════════

  function classifyTrade(trade, index, allTrades) {
    var violations = [];
    var warnings = [];
    var status = 'VALIDATED';
    var isStrike = false;
    var invalidReasons = [];

    // ── STRIKE: SL widening >15% ─────────────────────────────────────
    if (trade.originalStopLoss && trade.stopLoss) {
      var origSL = pf(trade.originalStopLoss);
      var currSL = pf(trade.stopLoss);
      var entry  = pf(trade.entryPrice);
      if (origSL > 0 && currSL > 0 && entry > 0) {
        var origDist = Math.abs(entry - origSL);
        var newDist  = Math.abs(entry - currSL);
        if (origDist > 0 && newDist > origDist * 1.15) {
          isStrike = true;
          violations.push({
            severity: 'STRIKE', category: 'Stop Loss Widening',
            reason: 'Manual widening of stop loss beyond 15% of original distance. Original: ' + origDist.toFixed(1) + ' pts, Current: ' + newDist.toFixed(1) + ' pts.',
            action: 'Strike issued'
          });
        }
      }
    }

    // ── INVALID: No stop loss ─────────────────────────────────────────
    var slValue = pf(trade.stopLoss) || pf(trade.sl);
    if (slValue <= 0) {
      status = 'INVALID';
      invalidReasons.push('No stop loss defined');
      violations.push({ severity: 'INVALID', category: 'Missing Stop Loss', reason: 'No stop loss defined at trade entry.', action: 'Trade not counted' });
    }

    // ── INVALID: Excessive risk >2% ──────────────────────────────────
    var riskPct = calcRiskPercent(trade);
    if (riskPct > MAX_RISK_PERCENT) {
      status = 'INVALID';
      invalidReasons.push('Excessive risk (' + riskPct.toFixed(1) + '%)');
      violations.push({ severity: 'INVALID', category: 'Excessive Risk', reason: 'Risk per trade (' + riskPct.toFixed(1) + '%) exceeds ' + MAX_RISK_PERCENT + '% maximum.', action: 'Trade not counted' });
    }

    // ── INVALID: Missing required fields ─────────────────────────────
    var missing = [];
    if (pf(trade.entryPrice) <= 0) missing.push('entry price');
    if (pf(trade.exitPrice) <= 0 && pf(trade.closePrice) <= 0) missing.push('exit price');
    if (pf(trade.stopLoss) <= 0 && pf(trade.sl) <= 0) missing.push('stop loss');
    if (pf(trade.takeProfit) <= 0 && pf(trade.tp) <= 0) missing.push('take profit');
    if (missing.length > 0) {
      status = 'INVALID';
      invalidReasons.push('Missing fields: ' + missing.join(', '));
      violations.push({ severity: 'INVALID', category: 'Missing Fields', reason: 'Missing required fields: ' + missing.join(', ') + '.', action: 'Trade not counted' });
    }

    // ── INVALID: Execution checklist non-compliance ────────────────
    if (trade.nonCompliantFlag && trade.executionChecklist) {
      var ecData = trade.executionChecklist;
      if (ecData.failedRequiredRules && ecData.failedRequiredRules.length > 0) {
        status = 'INVALID';
        var ruleNames = ecData.failedRequiredRules.map(function(r) { return r.text || r.category || 'Unknown rule'; }).join('; ');
        invalidReasons.push('Strategy requirements not met');
        violations.push({ severity: 'INVALID', category: 'Strategy Non-Compliant', reason: 'Failed required strategy rules: ' + ruleNames, action: 'Trade not counted' });
      }
    }

    // ── INVALID: No framework/strategy ───────────────────────────────
    if (!trade.strategy && !trade.setup && !trade.frameworkType) {
      status = 'INVALID';
      invalidReasons.push('No framework setup selected');
      violations.push({ severity: 'INVALID', category: 'No Framework', reason: 'Trade not linked to any recognized strategy or framework.', action: 'Trade not counted' });
    }

    // ── INVALID: No documentation (no screenshot AND no notes) ───────
    var hasScreenshot = !!(trade.screenshot || trade.screenshotFile || trade.screenshotData || trade.hasScreenshot);
    var hasNotes = trade.notes && trade.notes.trim().length > 0;
    if (!hasScreenshot && !hasNotes) {
      status = 'INVALID';
      invalidReasons.push('Missing documentation');
      violations.push({ severity: 'INVALID', category: 'Incomplete Documentation', reason: 'No screenshot and no trade notes provided.', action: 'Trade not counted' });
    }

    // ── WARNING: Missing screenshot only (notes present) ─────────────
    if (!hasScreenshot && hasNotes && status !== 'INVALID') {
      warnings.push({ category: 'Missing Screenshot', reason: 'Trade screenshot not provided. Notes present — trade counts but discipline score reduced.', impact: SCORE_IMPACT.MISSING_SCREENSHOT });
    }

    // ── WARNING: Outside session window (07:00–21:00 UTC) ────────────
    var entryTime = trade.entryTime || trade.openTime || trade.date || '';
    if (entryTime) {
      var d = new Date(entryTime);
      if (!isNaN(d.getTime())) {
        var h = d.getUTCHours();
        if (h < SESSION_START_UTC || h >= SESSION_END_UTC) {
          warnings.push({ category: 'Outside Session', reason: 'Trade opened at ' + pad2(h) + ':' + pad2(d.getUTCMinutes()) + ' UTC — outside allowed window (07:00–21:00).', impact: SCORE_IMPACT.OUTSIDE_SESSION });
        }
      }
    }

    // ── WARNING: Overtrading (>5 trades same day) ────────────────────
    var dateKey = getDateKey(entryTime);
    if (dateKey && allTrades) {
      var sameDayCount = 0;
      for (var oi = 0; oi < allTrades.length; oi++) {
        var od = getDateKey(allTrades[oi].entryTime || allTrades[oi].openTime || allTrades[oi].date);
        if (od === dateKey) sameDayCount++;
      }
      if (sameDayCount > MAX_TRADES_PER_DAY) {
        warnings.push({ category: 'Overtrading', reason: sameDayCount + ' trades on ' + dateKey + ' — exceeds daily limit of ' + MAX_TRADES_PER_DAY + '.', impact: SCORE_IMPACT.OVERTRADING });
      }
    }

    // ── WARNING: Revenge trading (<10 min after loss) ────────────────
    if (index > 0 && allTrades) {
      var prev = allTrades[index - 1];
      var prevPnl = pf(prev.pnl) || pf(prev.pl) || 0;
      var prevClose = prev.exitTime || prev.closeTime;
      if (prevPnl < 0 && prevClose && entryTime) {
        var timeDiff = new Date(entryTime) - new Date(prevClose);
        if (timeDiff > 0 && timeDiff < REVENGE_WINDOW_MS) {
          warnings.push({ category: 'Revenge Trading', reason: 'Trade entered ' + Math.round(timeDiff / 60000) + ' minutes after a losing trade.', impact: SCORE_IMPACT.REVENGE_TRADE });
        }
      }
    }

    // ── Determine final status ───────────────────────────────────────
    var finalStatus;
    if (isStrike) {
      finalStatus = 'STRIKE ISSUED';
    } else if (status === 'INVALID') {
      finalStatus = 'INVALID';
    } else if (warnings.length > 0) {
      finalStatus = 'VALIDATED WITH WARNINGS';
    } else {
      finalStatus = 'VALIDATED';
    }

    return {
      tradeId: trade.id || ('T' + (index + 1)),
      tradeNumber: index + 1,
      finalStatus: finalStatus,
      isValid: finalStatus === 'VALIDATED' || finalStatus === 'VALIDATED WITH WARNINGS',
      isInvalid: finalStatus === 'INVALID',
      isStrike: isStrike,
      counts: finalStatus === 'VALIDATED' || finalStatus === 'VALIDATED WITH WARNINGS',
      violations: violations,
      warnings: warnings,
      invalidReasons: invalidReasons,
      timestamp: new Date().toISOString()
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // FULL CHALLENGE EVALUATION — all trades at once (deterministic)
  // ═══════════════════════════════════════════════════════════════════════════

  function evaluateChallenge() {
    var tradeData = loadTrades();
    var trades = tradeData.trades || [];
    var dd = loadDrawdown();
    var weekly = loadWeekly();
    var profit = loadProfit();
    var statement = loadStatement();
    var secondLife = loadSecondLife();
    var state = loadEngineState();

    // Preserve attempt number and second life status
    var secondLifeUsed = (secondLife && secondLife.used === true) || state.secondLifeUsed;
    var attemptNumber = state.currentAttemptNumber || 1;

    // ── Classify every trade ─────────────────────────────────────────
    var tradeResults = [];
    var validatedCount = 0, invalidCount = 0, strikeCount = 0, warningCount = 0;
    var strikes = [];
    var allWarnings = [];
    var traderScore = 100;
    var invalidSequence = 0;

    trades.forEach(function (t, i) {
      var result = classifyTrade(t, i, trades);
      tradeResults.push(result);

      if (result.isValid) validatedCount++;
      if (result.isInvalid) {
        invalidCount++;
        invalidSequence++;
        // Escalating invalid penalty: 1st=-6, 2nd=-8, 3rd=-10, 4th+=-12
        var penalty;
        if (invalidSequence === 1) penalty = SCORE_IMPACT.INVALID_MINOR;
        else if (invalidSequence === 2) penalty = SCORE_IMPACT.INVALID_MODERATE;
        else if (invalidSequence === 3) penalty = SCORE_IMPACT.INVALID_SEVERE;
        else penalty = SCORE_IMPACT.INVALID_CRITICAL;
        traderScore += penalty;
      }
      if (result.isStrike) {
        strikeCount++;
        strikes.push({
          tradeId: result.tradeId,
          reason: result.violations.filter(function(v) { return v.severity === 'STRIKE'; }).map(function(v) { return v.reason; }).join('; '),
          timestamp: result.timestamp
        });
      }

      // Warning score impacts
      result.warnings.forEach(function (w) {
        warningCount++;
        traderScore += w.impact;
        allWarnings.push({
          tradeId: result.tradeId,
          category: w.category,
          reason: w.reason,
          impact: w.impact
        });
      });

      // Valid clean trade bonus
      if (result.isValid && result.warnings.length === 0) {
        traderScore += SCORE_IMPACT.VALID_CLEAN;
      }
    });

    // Clamp trader score
    traderScore = Math.max(0, Math.min(100, traderScore));

    // ── Drawdown check ───────────────────────────────────────────────
    var peakEquity = pf(dd.peakEquity) || 10000;
    var currentEquity = pf(dd.currentEquity) || 10000;
    var maxDD = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
    maxDD = Math.max(0, maxDD);
    var drawdownFailed = maxDD >= DRAWDOWN_LIMIT || dd.failed;

    // ── Profit calculation ───────────────────────────────────────────
    var startBal = pf(profit.startingBalance) || 10000;
    var currentBal = pf(profit.month2Balance) || pf(profit.month1Balance) || startBal;
    var netProfitPct = startBal > 0 ? ((currentBal - startBal) / startBal) * 100 : 0;

    // ── Weekly check-ins ─────────────────────────────────────────────
    var weeklyCheckins = (weekly.checkins || []).length;

    // ── Broker statement ─────────────────────────────────────────────
    var statementSubmitted = statement.submitted === true;

    // ── Consecutive inactivity check ─────────────────────────────────
    var consecutiveInactive = getConsecutiveInactiveDays();

    // ── Determine challenge status ───────────────────────────────────
    var challengeStatus;
    var failureReason = null;

    if (drawdownFailed) {
      challengeStatus = 'FAILED';
      failureReason = 'Drawdown exceeded 10% limit.';
    } else if (strikeCount >= STRIKE_THRESHOLD) {
      challengeStatus = 'FAILED';
      failureReason = strikeCount + ' strikes accumulated (' + STRIKE_THRESHOLD + ' = disqualification).';
    } else if (consecutiveInactive >= INACTIVITY_FAIL_DAYS) {
      challengeStatus = 'INVALIDATED';
      failureReason = consecutiveInactive + ' consecutive days without any log entry. Challenge invalidated.';
    } else {
      // Check completion eligibility
      var allComplete = validatedCount >= VALIDATED_TARGET &&
                        weeklyCheckins >= WEEKLY_TARGET &&
                        netProfitPct >= PROFIT_TARGET &&
                        !drawdownFailed &&
                        statementSubmitted &&
                        strikeCount < STRIKE_THRESHOLD;

      if (allComplete) {
        challengeStatus = 'READY FOR FINAL VERIFICATION';
      } else if (validatedCount >= VALIDATED_TARGET) {
        challengeStatus = 'COMPLETED';
      } else if (strikeCount > 0 || warningCount >= 5 || traderScore < 60) {
        challengeStatus = 'AT RISK';
      } else if (validatedCount > 0 && traderScore >= 60) {
        challengeStatus = 'PASSING';
      } else {
        challengeStatus = 'ACTIVE';
      }
    }

    // Handle Second Life
    if (challengeStatus === 'FAILED' || challengeStatus === 'INVALIDATED') {
      if (!secondLifeUsed) {
        challengeStatus = 'SECOND LIFE AVAILABLE';
      }
    }

    // ── Discipline rating ────────────────────────────────────────────
    var disciplineRating;
    if (traderScore >= 90) disciplineRating = 'Institutional';
    else if (traderScore >= 75) disciplineRating = 'Controlled';
    else if (traderScore >= 60) disciplineRating = 'Needs Improvement';
    else if (traderScore >= 40) disciplineRating = 'High Risk';
    else disciplineRating = 'Chaotic';

    // ── Assemble state ───────────────────────────────────────────────
    var engineState = {
      status: challengeStatus,
      validatedTradeCount: validatedCount,
      invalidTradeCount: invalidCount,
      warningCount: warningCount,
      strikeCount: strikeCount,
      traderScore: traderScore,
      disciplineRating: disciplineRating,
      peakEquity: peakEquity,
      currentEquity: currentEquity,
      maxDrawdown: Math.round(maxDD * 100) / 100,
      netProfitPercent: Math.round(netProfitPct * 100) / 100,
      weeklyCheckInsCompleted: weeklyCheckins,
      brokerStatementStatus: statementSubmitted ? 'submitted' : 'missing',
      secondLifeUsed: secondLifeUsed,
      currentAttemptNumber: attemptNumber,
      failedAt: (challengeStatus === 'FAILED' || challengeStatus === 'INVALIDATED' || challengeStatus === 'SECOND LIFE AVAILABLE') ? new Date().toISOString() : null,
      failureReason: failureReason,
      completedAt: challengeStatus === 'READY FOR FINAL VERIFICATION' ? new Date().toISOString() : null,
      tradeResults: tradeResults,
      strikes: strikes,
      warnings: allWarnings,
      consecutiveInactiveDays: consecutiveInactive,
      totalTrades: trades.length,
      createdAt: state.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // ── Persist ──────────────────────────────────────────────────────
    save(ENGINE_KEY, engineState);

    // ── Sync to challenge-score.js ───────────────────────────────────
    syncToChallengeScore(tradeResults, strikes, warningCount);

    // ── Sync to Supabase backend (async, non-blocking) ──────────────
    if (window.AltivorBackend && window.AltivorBackend.saveChallenge) {
      try {
        window.AltivorBackend.saveChallenge({
          status: challengeStatus,
          _status: challengeStatus,
          validatedTradeCount: validatedCount,
          invalidTradeCount: invalidCount,
          warningCount: warningCount,
          strikeCount: strikeCount,
          traderScore: traderScore,
          disciplineRating: disciplineRating,
          secondLifeUsed: secondLifeUsed,
          attemptNumber: attemptNumber
        }).catch(function (e) { console.warn('[ChallengeEngine] Backend sync error:', e); });
      } catch (_) {}
    }

    return engineState;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PROCESS NEW TRADE — called immediately after trade submission
  // ═══════════════════════════════════════════════════════════════════════════

  function processTrade(tradeObj) {
    // 1. Evaluate entire challenge state (deterministic, re-classifies all)
    var state = evaluateChallenge();

    // 2. Find last trade's result
    var lastResult = state.tradeResults.length > 0
      ? state.tradeResults[state.tradeResults.length - 1]
      : null;

    // 3. Generate audit summary
    var audit = generateAuditSummary(lastResult, state);

    return {
      state: state,
      tradeResult: lastResult,
      audit: audit
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT SUMMARY GENERATOR
  // ═══════════════════════════════════════════════════════════════════════════

  function generateAuditSummary(tradeResult, state) {
    if (!tradeResult) return null;

    var correct = [];
    var wrong = [];
    var ruleMatrix = [];
    var nextActions = [];

    // ── A. Trade Result Status ────────────────────────────────────────
    var resultLabel;
    if (state.status === 'FAILED' || state.status === 'SECOND LIFE AVAILABLE') {
      resultLabel = 'CHALLENGE FAILED';
    } else if (tradeResult.isStrike) {
      resultLabel = 'STRIKE ISSUED';
    } else if (tradeResult.isInvalid) {
      resultLabel = 'INVALID / NOT COUNTED';
    } else if (tradeResult.warnings.length > 0) {
      resultLabel = 'VALIDATED WITH WARNINGS';
    } else {
      resultLabel = 'VALIDATED';
    }

    // ── B. Challenge Impact ──────────────────────────────────────────
    var impact = {
      counted: tradeResult.counts,
      progress: state.validatedTradeCount + ' / ' + VALIDATED_TARGET,
      strikes: state.strikeCount + ' / ' + STRIKE_THRESHOLD,
      warnings: state.warningCount,
      status: state.status,
      traderScore: state.traderScore + ' / 100',
      disciplineRating: state.disciplineRating
    };

    // ── C. What was correct ──────────────────────────────────────────
    if (tradeResult.isValid) {
      correct.push('Trade meets all validation requirements.');
    }
    if (tradeResult.violations.length === 0 && tradeResult.warnings.length === 0) {
      correct.push('No rule violations or warnings detected.');
      correct.push('Process discipline maintained.');
    }
    // Check individual positive aspects
    if (!tradeResult.invalidReasons.some(function(r) { return r.indexOf('stop loss') >= 0; })) {
      correct.push('Stop loss defined at entry.');
    }
    if (!tradeResult.invalidReasons.some(function(r) { return r.indexOf('risk') >= 0; })) {
      correct.push('Risk within allowed parameters.');
    }
    if (!tradeResult.invalidReasons.some(function(r) { return r.indexOf('framework') >= 0; })) {
      correct.push('Trade linked to recognized framework.');
    }
    if (!tradeResult.invalidReasons.some(function(r) { return r.indexOf('documentation') >= 0 || r.indexOf('Missing fields') >= 0; })) {
      correct.push('Required documentation provided.');
    }
    // Check warnings not present as positives
    var warnCats = {};
    tradeResult.warnings.forEach(function(w) { warnCats[w.category] = true; });
    if (!warnCats['Outside Session']) {
      correct.push('Trade within allowed session window.');
    }
    if (!warnCats['Overtrading']) {
      correct.push('Trade frequency within daily limits.');
    }
    if (!warnCats['Revenge Trading']) {
      correct.push('No revenge trading pattern detected.');
    }

    // ── D. What was wrong ────────────────────────────────────────────
    tradeResult.violations.forEach(function (v) {
      wrong.push(v.reason);
    });
    tradeResult.warnings.forEach(function (w) {
      wrong.push(w.reason);
    });

    // ── E. Rule Matrix Result ────────────────────────────────────────
    ruleMatrix.push({ rule: 'Valid trade requirements', result: tradeResult.isValid ? 'MET' : 'NOT MET' });
    ruleMatrix.push({ rule: 'Invalid trade conditions', result: tradeResult.isInvalid ? 'TRIGGERED (' + tradeResult.invalidReasons.join('; ') + ')' : 'CLEAR' });
    ruleMatrix.push({ rule: 'Warning conditions', result: tradeResult.warnings.length > 0 ? tradeResult.warnings.length + ' WARNING(S)' : 'CLEAR' });
    ruleMatrix.push({ rule: 'Strike condition', result: tradeResult.isStrike ? 'STRIKE ISSUED' : 'CLEAR' });
    ruleMatrix.push({ rule: 'Instant fail (drawdown)', result: state.maxDrawdown >= DRAWDOWN_LIMIT ? 'TRIGGERED' : 'CLEAR (' + state.maxDrawdown.toFixed(2) + '% / ' + DRAWDOWN_LIMIT + '%)' });

    // ── E2. Strategy Compliance (from Execution Checklist) ───────────
    var hasStratNonCompliance = tradeResult.invalidReasons.some(function(r) { return r.indexOf('Strategy requirements') >= 0; });
    ruleMatrix.push({ rule: 'Strategy compliance', result: hasStratNonCompliance ? 'NON-COMPLIANT' : 'CLEAR' });

    if (hasStratNonCompliance) {
      wrong.push('Trade submitted with unconfirmed strategy requirements.');
    } else if (!tradeResult.invalidReasons.some(function(r) { return r.indexOf('framework') >= 0; })) {
      correct.push('Strategy execution requirements verified.');
    }

    // ── F. Next Action ───────────────────────────────────────────────
    if (state.status === 'FAILED' || state.status === 'SECOND LIFE AVAILABLE') {
      if (state.secondLifeUsed) {
        nextActions.push('Challenge failed. No Second Life available. You must repurchase to restart.');
      } else {
        nextActions.push('Challenge failed. Second Life is available — you may restart once for free.');
      }
    } else if (state.status === 'INVALIDATED') {
      nextActions.push('Challenge invalidated due to prolonged inactivity. Contact support.');
    } else if (state.status === 'READY FOR FINAL VERIFICATION') {
      nextActions.push('All requirements met. Submit for final verification.');
    } else if (state.status === 'COMPLETED') {
      var missingItems = [];
      if (state.weeklyCheckInsCompleted < WEEKLY_TARGET) missingItems.push((WEEKLY_TARGET - state.weeklyCheckInsCompleted) + ' weekly check-ins');
      if (state.netProfitPercent < PROFIT_TARGET) missingItems.push('net profit ≥' + PROFIT_TARGET + '%');
      if (state.brokerStatementStatus !== 'submitted') missingItems.push('broker statement');
      nextActions.push('55 validated trades completed. Missing: ' + (missingItems.length > 0 ? missingItems.join(', ') : 'none') + '.');
    } else {
      if (tradeResult.isInvalid) {
        nextActions.push('Review the invalid trade reasons and correct on next submission.');
        tradeResult.invalidReasons.forEach(function(r) {
          if (r.indexOf('stop loss') >= 0) nextActions.push('Always define a stop loss before execution.');
          if (r.indexOf('documentation') >= 0) nextActions.push('Provide screenshot or trade notes with every trade.');
          if (r.indexOf('framework') >= 0) nextActions.push('Select a strategy before submitting.');
          if (r.indexOf('fields') >= 0) nextActions.push('Fill in all required price fields.');
        });
      } else {
        nextActions.push('Continue logging trades. ' + (VALIDATED_TARGET - state.validatedTradeCount) + ' validated trades remaining.');
      }
      if (tradeResult.warnings.length > 0) {
        tradeResult.warnings.forEach(function(w) {
          if (w.category === 'Missing Screenshot') nextActions.push('Attach a chart screenshot for full documentation.');
          if (w.category === 'Outside Session') nextActions.push('Restrict trading to 07:00–21:00 UTC.');
          if (w.category === 'Overtrading') nextActions.push('Limit to ' + MAX_TRADES_PER_DAY + ' trades per day maximum.');
          if (w.category === 'Revenge Trading') nextActions.push('Wait at least 10 minutes after a losing trade before re-entering.');
        });
      }
    }

    return {
      resultLabel: resultLabel,
      impact: impact,
      correct: correct,
      wrong: wrong,
      ruleMatrix: ruleMatrix,
      nextActions: nextActions
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SECOND LIFE
  // ═══════════════════════════════════════════════════════════════════════════

  function activateSecondLife() {
    // Archive previous state
    var prevState = loadEngineState();
    var archiveKey = 'altivor_challenge_archive_' + (prevState.currentAttemptNumber || 1);
    save(archiveKey, prevState);

    // Mark Second Life as used
    save(SECOND_LIFE_KEY, { used: true, usedAt: new Date().toISOString() });

    // Clear trade data
    save(TRADES_KEY, { trades: [] });

    // Reset engine state
    var newState = getDefaultState();
    newState.secondLifeUsed = true;
    newState.currentAttemptNumber = (prevState.currentAttemptNumber || 1) + 1;
    save(ENGINE_KEY, newState);

    // Clear score
    save(SCORE_KEY, {
      hardFail: null,
      tradeReviews: {},
      overtradingFlags: {},
      ruleBreaks: [],
      behaviorViolations: [],
      perfectTradeCount: 0
    });

    // Clear violation log
    save(VIOLATION_KEY, []);

    // Clear daily log
    save(DAILY_LOG_KEY, { entries: {} });

    // Clear weekly, drawdown, profit, statement for clean restart
    save(WEEKLY_KEY, { checkins: [] });
    save(DRAWDOWN_KEY, { peakEquity: 10000, currentEquity: 10000, failed: false });
    save(PROFIT_KEY, { startingBalance: 10000, month1Balance: 0, month2Balance: 0 });
    save(STATEMENT_KEY, { submitted: false });

    // Backend Second Life activation (async, non-blocking)
    if (window.AltivorBackend && window.AltivorBackend.activateSecondLife) {
      try {
        window.AltivorBackend.activateSecondLife()
          .catch(function (e) { console.warn('[ChallengeEngine] Backend Second Life error:', e); });
      } catch (_) {}
    }

    return newState;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC TO CHALLENGE SCORE
  // ═══════════════════════════════════════════════════════════════════════════

  function syncToChallengeScore(tradeResults, strikes, warningCount) {
    try {
      var csData = load(SCORE_KEY, {
        hardFail: null,
        tradeReviews: {},
        overtradingFlags: {},
        ruleBreaks: [],
        behaviorViolations: [],
        perfectTradeCount: 0
      });

      var validCount = 0;
      tradeResults.forEach(function (r, i) {
        if (r.isValid && r.warnings.length === 0) {
          csData.tradeReviews[String(i)] = 'valid';
          validCount++;
        } else if (r.isValid && r.warnings.length > 0) {
          csData.tradeReviews[String(i)] = 'minor';
        } else {
          csData.tradeReviews[String(i)] = 'invalid';
        }
      });

      csData.perfectTradeCount = validCount;

      // Sync strikes as rule breaks
      csData.ruleBreaks = strikes.map(function (s) {
        return { type: 'Stop Loss Widening', tradeId: s.tradeId, time: s.timestamp };
      });

      // Sync overtrading flags
      var overtradeDays = {};
      tradeResults.forEach(function (r) {
        r.warnings.forEach(function (w) {
          if (w.category === 'Overtrading') {
            var dKey = getDateKey(r.timestamp);
            if (dKey) overtradeDays[dKey] = true;
          }
        });
      });
      csData.overtradingFlags = overtradeDays;

      // Sync behavior violations
      csData.behaviorViolations = [];
      tradeResults.forEach(function (r) {
        r.warnings.forEach(function (w) {
          if (w.category === 'Revenge Trading') {
            csData.behaviorViolations.push({ description: w.reason, time: r.timestamp });
          }
        });
      });

      save(SCORE_KEY, csData);

      // Trigger re-render if ChallengeScore is loaded
      if (window.ChallengeScore && window.ChallengeScore.renderAll) {
        window.ChallengeScore.renderAll();
      }
    } catch (e) {
      console.warn('[ChallengeEngine] Score sync error:', e);
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: POST-TRADE AUDIT SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  function renderAuditSummary(containerId, processResult) {
    var el = document.getElementById(containerId);
    if (!el || !processResult || !processResult.audit) { if (el) el.style.display = 'none'; return; }

    var audit = processResult.audit;
    var state = processResult.state;
    var tr = processResult.tradeResult;

    // Status colors
    var statusColors = {
      'VALIDATED':                { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)',  text: 'rgba(34,197,94,0.9)' },
      'VALIDATED WITH WARNINGS':  { bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.2)',  text: 'rgba(234,179,8,0.9)' },
      'INVALID / NOT COUNTED':    { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.15)', text: 'rgba(239,68,68,0.9)' },
      'STRIKE ISSUED':            { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.2)', text: 'rgba(168,85,247,0.9)' },
      'CHALLENGE FAILED':         { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.25)', text: 'rgba(239,68,68,1)' }
    };
    var sc = statusColors[audit.resultLabel] || statusColors['INVALID / NOT COUNTED'];

    var html = '';

    // ── HEADER ──────────────────────────────────────────────────────
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem;">';
    html += '<div style="display:flex;align-items:center;gap:.5rem;">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(214,190,150,0.7)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    html += '<span style="font-size:.85rem;font-weight:700;color:var(--txt-primary);letter-spacing:.03em;">POST-TRADE AUDIT</span>';
    html += '</div>';
    html += '<span style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;padding:4px 12px;border-radius:100px;background:' + sc.bg + ';color:' + sc.text + ';border:1px solid ' + sc.border + ';">' + audit.resultLabel + '</span>';
    html += '</div>';

    // ── CHALLENGE IMPACT ────────────────────────────────────────────
    html += '<div style="margin-bottom:1rem;padding:.6rem .75rem;background:var(--bg-card);border:1px solid var(--border-default);border-radius:8px;">';
    html += '<div style="font-size:.68rem;font-weight:700;color:var(--txt-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem;">Challenge Impact</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.2rem .75rem;font-size:.72rem;">';
    var impactItems = [
      ['Counts toward 55?', audit.impact.counted ? '<span style="color:rgba(34,197,94,0.9);font-weight:700;">Yes</span>' : '<span style="color:rgba(239,68,68,0.9);font-weight:700;">No</span>'],
      ['Progress', '<span style="font-weight:700;">' + audit.impact.progress + '</span>'],
      ['Strikes', '<span style="font-weight:700;color:' + (state.strikeCount > 0 ? 'rgba(239,68,68,0.9)' : 'var(--txt-primary)') + ';">' + audit.impact.strikes + '</span>'],
      ['Warnings', '<span style="font-weight:700;">' + audit.impact.warnings + '</span>'],
      ['Status', '<span style="font-weight:700;">' + audit.impact.status + '</span>'],
      ['Trader Score', '<span style="font-weight:700;">' + audit.impact.traderScore + '</span>'],
      ['Discipline', '<span style="font-weight:700;">' + audit.impact.disciplineRating + '</span>']
    ];
    impactItems.forEach(function (item) {
      html += '<div style="display:flex;justify-content:space-between;padding:.15rem 0;border-bottom:1px solid rgba(255,255,255,0.03);">';
      html += '<span style="color:var(--txt-muted);">' + item[0] + '</span>' + item[1];
      html += '</div>';
    });
    html += '</div></div>';

    // ── WHAT WAS CORRECT ────────────────────────────────────────────
    if (audit.correct.length > 0) {
      html += '<div style="margin-bottom:.75rem;">';
      html += '<div style="font-size:.68rem;font-weight:700;color:rgba(34,197,94,0.8);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem;">What Was Correct</div>';
      audit.correct.forEach(function (c) {
        html += '<div style="display:flex;align-items:flex-start;gap:.4rem;font-size:.72rem;color:var(--txt-secondary);padding:.1rem 0;">';
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.7)" stroke-width="2.5" style="flex-shrink:0;margin-top:2px;"><polyline points="20 6 9 17 4 12"/></svg>';
        html += '<span>' + esc(c) + '</span></div>';
      });
      html += '</div>';
    }

    // ── WHAT WAS WRONG ──────────────────────────────────────────────
    if (audit.wrong.length > 0) {
      html += '<div style="margin-bottom:.75rem;">';
      html += '<div style="font-size:.68rem;font-weight:700;color:rgba(239,68,68,0.8);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem;">What Was Wrong</div>';
      audit.wrong.forEach(function (w) {
        html += '<div style="display:flex;align-items:flex-start;gap:.4rem;font-size:.72rem;color:var(--txt-secondary);padding:.1rem 0;">';
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.7)" stroke-width="2.5" style="flex-shrink:0;margin-top:2px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        html += '<span>' + esc(w) + '</span></div>';
      });
      html += '</div>';
    }

    // ── RULE MATRIX ─────────────────────────────────────────────────
    html += '<div style="margin-bottom:.75rem;">';
    html += '<div style="font-size:.68rem;font-weight:700;color:rgba(214,190,150,0.8);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem;">Rule Matrix Result</div>';
    html += '<div style="display:flex;flex-direction:column;gap:.15rem;">';
    audit.ruleMatrix.forEach(function (rm) {
      var isClear = rm.result === 'CLEAR' || rm.result === 'MET' || rm.result.indexOf('CLEAR') >= 0;
      var color = isClear ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.8)';
      html += '<div style="display:flex;justify-content:space-between;font-size:.68rem;padding:.15rem .4rem;background:var(--bg-card);border-radius:4px;">';
      html += '<span style="color:var(--txt-muted);">' + esc(rm.rule) + '</span>';
      html += '<span style="font-weight:700;color:' + color + ';">' + esc(rm.result) + '</span>';
      html += '</div>';
    });
    html += '</div></div>';

    // ── NEXT ACTIONS ────────────────────────────────────────────────
    if (audit.nextActions.length > 0) {
      html += '<div style="margin-bottom:.5rem;">';
      html += '<div style="font-size:.68rem;font-weight:700;color:rgba(96,165,250,0.9);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem;">Next Action</div>';
      audit.nextActions.forEach(function (a) {
        html += '<div style="display:flex;align-items:flex-start;gap:.4rem;font-size:.72rem;color:var(--txt-secondary);padding:.1rem 0;">';
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(96,165,250,0.8)" stroke-width="2" style="flex-shrink:0;margin-top:2px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
        html += '<span>' + esc(a) + '</span></div>';
      });
      html += '</div>';
    }

    el.innerHTML = html;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: LIVE CHALLENGE DASHBOARD (inline in verification-trades.html)
  // ═══════════════════════════════════════════════════════════════════════════

  function renderChallengeDashboard(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;

    var state = loadEngineState();
    if (!state || state.totalTrades === 0) { el.style.display = 'none'; return; }

    var statusColors = {
      'ACTIVE':                     'rgba(96,165,250,0.9)',
      'PASSING':                    'rgba(34,197,94,0.9)',
      'AT RISK':                    'rgba(234,179,8,0.9)',
      'FAILED':                     'rgba(239,68,68,0.9)',
      'INVALIDATED':                'rgba(239,68,68,0.9)',
      'COMPLETED':                  'rgba(34,197,94,0.9)',
      'READY FOR FINAL VERIFICATION': 'rgba(34,197,94,0.9)',
      'SECOND LIFE AVAILABLE':      'rgba(168,85,247,0.9)',
      'SECOND LIFE USED':           'rgba(234,179,8,0.9)'
    };
    var statusColor = statusColors[state.status] || 'var(--txt-primary)';

    var html = '';

    // Status header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem;">';
    html += '<span style="font-size:.7rem;font-weight:700;color:var(--txt-muted);text-transform:uppercase;letter-spacing:.08em;">CHALLENGE STATUS</span>';
    html += '<span style="font-size:.6rem;font-weight:700;padding:3px 10px;border-radius:100px;color:' + statusColor + ';background:rgba(0,0,0,0.2);border:1px solid ' + statusColor + ';">' + state.status + '</span>';
    html += '</div>';

    // Progress bar
    var progressPct = Math.min(100, Math.round((state.validatedTradeCount / VALIDATED_TARGET) * 100));
    var progressColor = progressPct >= 80 ? 'rgba(34,197,94,0.8)' : progressPct >= 40 ? 'rgba(234,179,8,0.8)' : 'rgba(96,165,250,0.8)';
    html += '<div style="margin-bottom:.75rem;">';
    html += '<div style="display:flex;justify-content:space-between;font-size:.65rem;color:var(--txt-muted);margin-bottom:.25rem;">';
    html += '<span>Validated Trades</span><span style="font-weight:700;color:var(--txt-primary);">' + state.validatedTradeCount + ' / ' + VALIDATED_TARGET + '</span>';
    html += '</div>';
    html += '<div style="height:6px;background:var(--bg-card);border-radius:3px;overflow:hidden;">';
    html += '<div style="height:100%;width:' + progressPct + '%;background:' + progressColor + ';border-radius:3px;transition:width .3s;"></div>';
    html += '</div></div>';

    // Stats grid
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem;margin-bottom:.75rem;">';
    var stats = [
      [state.totalTrades || 0, 'Total', 'var(--txt-primary)'],
      [state.validatedTradeCount, 'Valid', 'rgba(34,197,94,0.9)'],
      [state.invalidTradeCount, 'Invalid', 'rgba(239,68,68,0.9)'],
      [state.warningCount, 'Warnings', 'rgba(234,179,8,0.9)']
    ];
    stats.forEach(function (s) {
      html += '<div style="text-align:center;padding:.35rem;background:var(--bg-card);border-radius:6px;border:1px solid var(--border-default);">';
      html += '<div style="font-size:.9rem;font-weight:700;color:' + s[2] + ';">' + s[0] + '</div>';
      html += '<div style="font-size:.55rem;color:var(--txt-muted);">' + s[1] + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // Second row
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem;margin-bottom:.75rem;">';
    var row2 = [
      [state.strikeCount + '/' + STRIKE_THRESHOLD, 'Strikes', state.strikeCount > 0 ? 'rgba(239,68,68,0.9)' : 'var(--txt-primary)'],
      [state.traderScore, 'Score', state.traderScore >= 75 ? 'rgba(34,197,94,0.9)' : state.traderScore >= 60 ? 'rgba(234,179,8,0.9)' : 'rgba(239,68,68,0.9)'],
      [state.maxDrawdown.toFixed(1) + '%', 'Drawdown', state.maxDrawdown >= 8 ? 'rgba(239,68,68,0.9)' : 'var(--txt-primary)'],
      [state.weeklyCheckInsCompleted + '/' + WEEKLY_TARGET, 'Check-ins', 'var(--txt-primary)']
    ];
    row2.forEach(function (s) {
      html += '<div style="text-align:center;padding:.35rem;background:var(--bg-card);border-radius:6px;border:1px solid var(--border-default);">';
      html += '<div style="font-size:.9rem;font-weight:700;color:' + s[2] + ';">' + s[0] + '</div>';
      html += '<div style="font-size:.55rem;color:var(--txt-muted);">' + s[1] + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // Discipline rating
    html += '<div style="display:flex;align-items:center;justify-content:space-between;font-size:.7rem;padding:.35rem .5rem;background:var(--bg-card);border-radius:6px;border:1px solid var(--border-default);">';
    html += '<span style="color:var(--txt-muted);">Discipline Rating</span>';
    var drColor = state.disciplineRating === 'Institutional' ? 'rgba(34,197,94,0.9)' : state.disciplineRating === 'Controlled' ? 'rgba(34,197,94,0.8)' : state.disciplineRating === 'Needs Improvement' ? 'rgba(234,179,8,0.9)' : 'rgba(239,68,68,0.9)';
    html += '<span style="font-weight:700;color:' + drColor + ';">' + state.disciplineRating + '</span>';
    html += '</div>';

    el.innerHTML = html;
    el.style.display = 'block';
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════════════════════════════════════════

  function pf(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function getDateKey(timeStr) {
    if (!timeStr) return '';
    var d = new Date(timeStr);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }

  function calcRiskPercent(trade) {
    // Direct riskPercent field
    if (trade.riskPercent !== undefined && pf(trade.riskPercent) > 0) return pf(trade.riskPercent);
    // Calculate from lot, entry, SL
    var entry = pf(trade.entryPrice);
    var sl = pf(trade.stopLoss) || pf(trade.sl);
    var lot = pf(trade.lotSize) || pf(trade.positionSize) || pf(trade.volume);
    var balance = pf(trade.accountEquity);
    if (balance <= 0) {
      var ddData = loadDrawdown();
      balance = pf(ddData.currentEquity) || 10000;
    }
    if (entry > 0 && sl > 0 && lot > 0 && balance > 0) {
      var riskPips = Math.abs(entry - sl);
      var riskDollar = lot * riskPips;
      return Math.round((riskDollar / balance) * 10000) / 100;
    }
    return 0;
  }

  function getConsecutiveInactiveDays() {
    var log = loadDailyLog();
    var entries = log.entries || {};
    var count = 0;
    var d = new Date();
    for (var i = 0; i < 30; i++) {
      var key = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      var dow = d.getDay();
      if (dow !== 0 && dow !== 6) {
        if (entries[key]) break;
        count++;
      }
      d.setDate(d.getDate() - 1);
    }
    return count;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  window.ChallengeEngine = {
    processTrade:            processTrade,
    evaluateChallenge:       evaluateChallenge,
    classifyTrade:           classifyTrade,
    activateSecondLife:      activateSecondLife,
    renderAuditSummary:      renderAuditSummary,
    renderChallengeDashboard: renderChallengeDashboard,
    loadState:               loadEngineState,
    getDefaultState:         getDefaultState,

    // Constants
    VALIDATED_TARGET:   VALIDATED_TARGET,
    STRIKE_THRESHOLD:   STRIKE_THRESHOLD,
    DRAWDOWN_LIMIT:     DRAWDOWN_LIMIT,
    PROFIT_TARGET:      PROFIT_TARGET,
    WEEKLY_TARGET:      WEEKLY_TARGET,
    MAX_TRADES_PER_DAY: MAX_TRADES_PER_DAY
  };

})();
