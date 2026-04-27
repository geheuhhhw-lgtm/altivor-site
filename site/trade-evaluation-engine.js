/**
 * ALTIVOR INSTITUTE — Trade Evaluation Engine v2
 * Deterministic, process-quality evaluation system.
 *
 * Evaluates PROCESS, not profit.
 * A losing trade can be VALID. A profitable trade can be INVALID.
 *
 * Categories: Setup Validity, Risk Management, Execution Discipline,
 *             Session Compliance, Trade Management, Documentation Quality
 *
 * Statuses: VALID (+1% bonus) / MINOR (−2% to −4%) / INVALID (−6% to −12%)
 * Violation tags assigned per trade.
 * Post-trade analysis generated for every submission.
 */
(function () {
  'use strict';

  var ENGINE_KEY = 'altivor_trade_evaluations_v1';

  // ═══ ALLOWED SESSION WINDOWS (UTC) ═══════════════════════════════════════
  var SESSION_WINDOWS = [
    { name: 'London',          startHour: 7,  endHour: 11 },
    { name: 'NY Pre-Market',   startHour: 12, endHour: 13 },
    { name: 'NY Core',         startHour: 13, endHour: 16 },
    { name: 'NY Continuation', startHour: 16, endHour: 19 }
  ];

  // ═══ CATEGORY WEIGHTS (for per-trade score out of 100) ══════════════════
  var CATEGORY_WEIGHTS = {
    setupValidity:       0.25,
    riskManagement:      0.25,
    executionDiscipline: 0.20,
    sessionCompliance:   0.10,
    tradeManagement:     0.10,
    documentationQuality:0.10
  };

  // ═══ THRESHOLDS ═════════════════════════════════════════════════════════
  var MAX_RISK_PERCENT  = 2;    // max risk per trade
  var MIN_RR            = 1;    // minimum acceptable RR
  var MAX_TRADES_PER_DAY = 3;
  var REVENGE_WINDOW_MS = 15 * 60 * 1000;

  // ═══════════════════════════════════════════════════════════════════════════
  // SINGLE TRADE EVALUATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Evaluate a single trade.
   * @param {Object} trade — trade data object
   * @param {Object} ctx   — { allTrades: [...], index: n, accountBalance: n }
   * @returns {Object} full evaluation result
   */
  function evaluateTrade(trade, ctx) {
    ctx = ctx || {};
    var allTrades = ctx.allTrades || [];
    var balance   = ctx.accountBalance || 10000;

    var violations = [];
    var positives  = [];

    // ── Parsed values ─────────────────────────────────────────────────────
    var entry     = pf(trade.entryPrice);
    var exit      = pf(trade.exitPrice) || pf(trade.closePrice);
    var sl        = pf(trade.stopLoss) || pf(trade.sl);
    var tp        = pf(trade.takeProfit) || pf(trade.tp);
    var pnl       = pf(trade.pnl) || pf(trade.pl);
    var lot       = pf(trade.lotSize) || pf(trade.positionSize) || pf(trade.volume);
    var dir       = (trade.direction || '').toLowerCase();
    var strategy  = trade.strategy || trade.setup || trade.frameworkType || '';
    var notes     = (trade.notes || trade.note || '').trim();
    var hasScreenshot = !!(trade.screenshot || trade.screenshotFile || trade.screenshotData || trade.hasScreenshot);
    var entryTime = trade.entryTime || trade.openTime || trade.date || '';
    var exitTime  = trade.exitTime || trade.closeTime || '';

    // ── Risk calculations ─────────────────────────────────────────────────
    var riskPips = (entry && sl) ? Math.abs(entry - sl) : 0;
    var rewardPips = 0;
    if (entry && exit) {
      rewardPips = dir === 'long' ? (exit - entry) : (entry - exit);
    }
    var plannedReward = 0;
    if (entry && tp) {
      plannedReward = dir === 'long' ? (tp - entry) : (entry - tp);
    }
    var realizedRR = riskPips > 0 ? Math.round((rewardPips / riskPips) * 100) / 100 : 0;
    var plannedRR  = riskPips > 0 && plannedReward > 0 ? Math.round((plannedReward / riskPips) * 100) / 100 : 0;
    var riskPercent = 0;
    if (lot && riskPips && balance > 0) {
      // Approximate risk in $ for index CFDs: lot * riskPips
      var riskDollar = lot * riskPips;
      riskPercent = Math.round((riskDollar / balance) * 10000) / 100;
    }

    // ══════════════════════════════════════════════════════════════════════
    // CATEGORY 1: SETUP VALIDITY (0–100)
    // ══════════════════════════════════════════════════════════════════════
    var setupScore = 100;

    // Strategy defined?
    if (!strategy) {
      setupScore -= 40;
      violations.push({ tag: 'No Strategy', category: 'setup', severity: 'CRITICAL', detail: 'Trade executed without linking to a defined strategy.' });
    } else {
      positives.push({ category: 'setup', text: 'Trade linked to strategy: ' + strategy });
    }

    // Entry + Exit present?
    if (!entry || isNaN(entry)) {
      setupScore -= 20;
      violations.push({ tag: 'Missing Entry', category: 'setup', severity: 'MAJOR', detail: 'Entry price not provided.' });
    }
    if (!exit || isNaN(exit)) {
      setupScore -= 10;
      violations.push({ tag: 'Missing Exit', category: 'setup', severity: 'MINOR', detail: 'Exit price not provided.' });
    }

    // Direction?
    if (!dir || (dir !== 'long' && dir !== 'short')) {
      setupScore -= 15;
      violations.push({ tag: 'Invalid Setup', category: 'setup', severity: 'MAJOR', detail: 'Trade direction not specified or invalid.' });
    } else {
      positives.push({ category: 'setup', text: 'Direction clearly defined (' + dir.toUpperCase() + ').' });
    }

    // RR acceptable?
    if (plannedRR > 0 && plannedRR < MIN_RR) {
      setupScore -= 15;
      violations.push({ tag: 'Low RR', category: 'setup', severity: 'MINOR', detail: 'Planned RR (' + plannedRR + ') below minimum requirement (' + MIN_RR + ').' });
    } else if (plannedRR >= MIN_RR) {
      positives.push({ category: 'setup', text: 'Acceptable RR setup (' + plannedRR + ':1).' });
    }

    setupScore = clamp(setupScore);

    // ══════════════════════════════════════════════════════════════════════
    // CATEGORY 2: RISK MANAGEMENT (0–100)
    // ══════════════════════════════════════════════════════════════════════
    var riskScore = 100;

    // Stop Loss present?
    if (!sl || isNaN(sl) || sl <= 0) {
      riskScore -= 50;
      violations.push({ tag: 'No Stop Loss', category: 'risk', severity: 'CRITICAL', detail: 'Trade executed without a Stop Loss. This is a critical process failure.' });
    } else {
      positives.push({ category: 'risk', text: 'Stop Loss defined at ' + sl + '.' });

      // SL direction sanity check
      if (dir === 'long' && sl >= entry) {
        riskScore -= 15;
        violations.push({ tag: 'Invalid SL Placement', category: 'risk', severity: 'MAJOR', detail: 'Stop Loss placed above entry for a long trade.' });
      } else if (dir === 'short' && sl <= entry) {
        riskScore -= 15;
        violations.push({ tag: 'Invalid SL Placement', category: 'risk', severity: 'MAJOR', detail: 'Stop Loss placed below entry for a short trade.' });
      } else {
        positives.push({ category: 'risk', text: 'Stop Loss correctly placed relative to entry.' });
      }
    }

    // TP present?
    if (!tp || isNaN(tp) || tp <= 0) {
      riskScore -= 10;
      violations.push({ tag: 'No Take Profit', category: 'risk', severity: 'MINOR', detail: 'No Take Profit level defined.' });
    } else {
      positives.push({ category: 'risk', text: 'Take Profit defined at ' + tp + '.' });
    }

    // Risk percentage
    if (riskPercent > MAX_RISK_PERCENT) {
      riskScore -= 25;
      violations.push({ tag: 'Excessive Risk', category: 'risk', severity: 'CRITICAL', detail: 'Risk per trade (' + riskPercent + '%) exceeds maximum allowed (' + MAX_RISK_PERCENT + '%).' });
    } else if (riskPercent > 0) {
      positives.push({ category: 'risk', text: 'Risk within limits (' + riskPercent + '% of account).' });
    }

    // Lot size present?
    if (!lot || isNaN(lot) || lot <= 0) {
      riskScore -= 10;
      violations.push({ tag: 'Missing Lot Size', category: 'risk', severity: 'MINOR', detail: 'Position size not specified.' });
    }

    riskScore = clamp(riskScore);

    // ══════════════════════════════════════════════════════════════════════
    // CATEGORY 3: EXECUTION DISCIPLINE (0–100)
    // ══════════════════════════════════════════════════════════════════════
    var execScore = 100;

    // Overtrading check
    var tradeDate = getDateKey(entryTime);
    if (tradeDate && allTrades.length > 0) {
      var sameDayCount = 0;
      for (var oi = 0; oi < allTrades.length; oi++) {
        var od = getDateKey(allTrades[oi].entryTime || allTrades[oi].openTime || allTrades[oi].date);
        if (od === tradeDate) sameDayCount++;
      }
      if (sameDayCount > MAX_TRADES_PER_DAY) {
        execScore -= 20;
        violations.push({ tag: 'Overtrading', category: 'execution', severity: 'MAJOR', detail: sameDayCount + ' trades on ' + tradeDate + ' (maximum: ' + MAX_TRADES_PER_DAY + ').' });
      } else {
        positives.push({ category: 'execution', text: 'Trade frequency within limits (' + sameDayCount + '/' + MAX_TRADES_PER_DAY + ').' });
      }
    }

    // Revenge trade detection
    if (allTrades.length > 1 && ctx.index > 0) {
      var prevTrade = allTrades[ctx.index - 1];
      var prevPnl = pf(prevTrade.pnl) || pf(prevTrade.pl) || 0;
      if (prevPnl < 0 && entryTime && prevTrade.exitTime) {
        var timeDiff = new Date(entryTime) - new Date(prevTrade.exitTime);
        if (timeDiff > 0 && timeDiff < REVENGE_WINDOW_MS) {
          execScore -= 25;
          violations.push({ tag: 'Revenge Trade', category: 'execution', severity: 'CRITICAL', detail: 'Trade entered ' + Math.round(timeDiff / 60000) + ' minutes after a losing trade. Possible revenge behavior.' });
        }
      }
    }

    // Impulsive entry detection (no strategy + low RR = likely impulse)
    if (!strategy && plannedRR < MIN_RR) {
      execScore -= 20;
      violations.push({ tag: 'Impulsive Entry', category: 'execution', severity: 'MAJOR', detail: 'No strategy and sub-minimum RR suggest an impulsive, unplanned entry.' });
    }

    execScore = clamp(execScore);

    // ══════════════════════════════════════════════════════════════════════
    // CATEGORY 4: SESSION COMPLIANCE (0–100)
    // ══════════════════════════════════════════════════════════════════════
    var sessionScore = 100;
    var sessionResult = checkSession(entryTime);

    if (sessionResult.status === 'outside') {
      sessionScore = 20;
      violations.push({ tag: 'Outside Session', category: 'session', severity: 'CRITICAL', detail: 'Trade executed outside all allowed session windows (UTC ' + sessionResult.hour + ':00). Allowed: London 07–11, NY 12–19.' });
    } else if (sessionResult.status === 'inside') {
      positives.push({ category: 'session', text: 'Trade within allowed session (' + sessionResult.window + ', UTC ' + sessionResult.hour + ':00).' });
    } else {
      // Unknown — partial penalty
      sessionScore = 60;
      violations.push({ tag: 'Unknown Session', category: 'session', severity: 'MINOR', detail: 'Entry time not provided or invalid. Session compliance cannot be verified.' });
    }

    sessionScore = clamp(sessionScore);

    // ══════════════════════════════════════════════════════════════════════
    // CATEGORY 5: TRADE MANAGEMENT (0–100)
    // ══════════════════════════════════════════════════════════════════════
    var mgmtScore = 100;

    // Did trade hit TP or SL, or manual exit?
    if (entry && exit && sl && tp) {
      var hitTP = false, hitSL = false;
      if (dir === 'long') {
        hitTP = exit >= tp;
        hitSL = exit <= sl;
      } else {
        hitTP = exit <= tp;
        hitSL = exit >= sl;
      }
      if (hitTP) {
        positives.push({ category: 'management', text: 'Trade reached Take Profit target.' });
      } else if (hitSL) {
        positives.push({ category: 'management', text: 'Trade exited at Stop Loss — risk parameters honored.' });
      } else {
        // Manual exit — check if early exit was reasonable
        if (pnl > 0) {
          mgmtScore -= 5;
          positives.push({ category: 'management', text: 'Manual exit in profit before TP.' });
        } else if (pnl < 0 && !hitSL) {
          mgmtScore -= 10;
          violations.push({ tag: 'Poor Management', category: 'management', severity: 'MINOR', detail: 'Exited at a loss before Stop Loss was hit. Possible premature exit.' });
        }
      }
    }

    // Entry/Exit time provided?
    if (!entryTime) {
      mgmtScore -= 15;
      violations.push({ tag: 'Missing Entry Time', category: 'management', severity: 'MINOR', detail: 'Entry timestamp not recorded.' });
    }
    if (!exitTime) {
      mgmtScore -= 10;
      violations.push({ tag: 'Missing Exit Time', category: 'management', severity: 'MINOR', detail: 'Exit timestamp not recorded.' });
    }

    mgmtScore = clamp(mgmtScore);

    // ══════════════════════════════════════════════════════════════════════
    // CATEGORY 6: DOCUMENTATION QUALITY (0–100)
    // ══════════════════════════════════════════════════════════════════════
    var docScore = 100;

    if (!hasScreenshot && !notes) {
      docScore = 10;
      violations.push({ tag: 'Incomplete Documentation', category: 'documentation', severity: 'MAJOR', detail: 'No screenshot and no trade notes provided. Trade documentation is incomplete.' });
    } else if (!hasScreenshot) {
      docScore -= 30;
      violations.push({ tag: 'Missing Screenshot', category: 'documentation', severity: 'MINOR', detail: 'Trade screenshot not provided. Notes are present but visual evidence is missing.' });
    } else if (!notes) {
      docScore -= 20;
      violations.push({ tag: 'Missing Notes', category: 'documentation', severity: 'MINOR', detail: 'No trade notes or reasoning documented.' });
    } else {
      positives.push({ category: 'documentation', text: 'Trade fully documented with screenshot and notes.' });
      // Quality of notes
      if (notes.length >= 30) {
        positives.push({ category: 'documentation', text: 'Detailed trade notes provided (' + notes.length + ' characters).' });
      } else {
        docScore -= 10;
      }
    }

    docScore = clamp(docScore);

    // ══════════════════════════════════════════════════════════════════════
    // CATEGORY 7: EXECUTION CHECKLIST COMPLIANCE
    // ══════════════════════════════════════════════════════════════════════
    if (trade.nonCompliantFlag && trade.executionChecklist) {
      var ecFailed = trade.executionChecklist.failedRequiredRules || [];
      if (ecFailed.length > 0) {
        setupScore = Math.max(0, setupScore - 30);
        var ruleNames = ecFailed.map(function(r) { return r.text || r.category || 'Unknown'; }).join('; ');
        violations.push({ tag: 'Strategy Non-Compliant', category: 'setup', severity: 'CRITICAL', detail: 'Failed required strategy execution rules: ' + ruleNames });
      }
    } else if (trade.executionChecklist && !trade.nonCompliantFlag) {
      positives.push({ category: 'setup', text: 'All strategy execution checklist requirements verified.' });
    }

    // ══════════════════════════════════════════════════════════════════════
    // COMPOSITE SCORE & CLASSIFICATION
    // ══════════════════════════════════════════════════════════════════════
    var categories = {
      setupValidity:        setupScore,
      riskManagement:       riskScore,
      executionDiscipline:  execScore,
      sessionCompliance:    sessionScore,
      tradeManagement:      mgmtScore,
      documentationQuality: docScore
    };

    var compositeScore = Math.round(
      setupScore   * CATEGORY_WEIGHTS.setupValidity +
      riskScore    * CATEGORY_WEIGHTS.riskManagement +
      execScore    * CATEGORY_WEIGHTS.executionDiscipline +
      sessionScore * CATEGORY_WEIGHTS.sessionCompliance +
      mgmtScore    * CATEGORY_WEIGHTS.tradeManagement +
      docScore     * CATEGORY_WEIGHTS.documentationQuality
    );

    // Hard caps
    var hasCritical = violations.some(function(v) { return v.severity === 'CRITICAL'; });
    var critCount   = violations.filter(function(v) { return v.severity === 'CRITICAL'; }).length;
    var majorCount  = violations.filter(function(v) { return v.severity === 'MAJOR'; }).length;

    if (hasCritical) {
      compositeScore = Math.min(compositeScore, 45);
    }

    // ── Classification ────────────────────────────────────────────────────
    var status;
    if (critCount >= 2 || compositeScore < 40) {
      status = 'INVALID';
    } else if (critCount === 1 || majorCount >= 2 || compositeScore < 65) {
      status = 'MINOR';
    } else {
      status = 'VALID';
    }

    // ── Violation tags (deduplicated) ─────────────────────────────────────
    var tags = [];
    violations.forEach(function(v) {
      if (tags.indexOf(v.tag) === -1) tags.push(v.tag);
    });

    // ══════════════════════════════════════════════════════════════════════
    // POST-TRADE ANALYSIS
    // ══════════════════════════════════════════════════════════════════════
    var analysis = generateAnalysis(trade, {
      status: status,
      score: compositeScore,
      categories: categories,
      violations: violations,
      positives: positives,
      tags: tags,
      realizedRR: realizedRR,
      plannedRR: plannedRR,
      riskPercent: riskPercent,
      pnl: pnl,
      strategy: strategy,
      dir: dir,
      sessionResult: sessionResult
    });

    // ══════════════════════════════════════════════════════════════════════
    // COMPLIANCE CHECKLIST
    // ══════════════════════════════════════════════════════════════════════
    var compliance = {
      slPresent:       !!(sl && sl > 0),
      riskValid:       riskPercent <= MAX_RISK_PERCENT && riskPercent > 0,
      sessionValid:    sessionResult.status === 'inside',
      strategyMatched: !!strategy,
      triggerPresent:  !!strategy && !!entry,
      rrAcceptable:    plannedRR >= MIN_RR,
      documentationComplete: hasScreenshot && !!notes
    };

    return {
      tradeId:      trade.id || null,
      tradeNumber:  trade.tradeNumber || null,
      status:       status,
      score:        compositeScore,
      categories:   categories,
      violations:   violations,
      positives:    positives,
      tags:         tags,
      compliance:   compliance,
      analysis:     analysis,
      coreData: {
        strategy:    strategy || '—',
        direction:   dir ? dir.toUpperCase() : '—',
        entry:       entry || '—',
        sl:          sl || '—',
        tp:          tp || '—',
        riskPercent: riskPercent,
        plannedRR:   plannedRR,
        realizedRR:  realizedRR,
        pnl:         pnl,
        session:     sessionResult.window || '—',
        entryTime:   entryTime || '—',
        exitTime:    exitTime || '—'
      },
      counts:       !!(status === 'VALID' || status === 'MINOR'),
      timestamp:    new Date().toISOString()
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYSIS GENERATOR
  // ═══════════════════════════════════════════════════════════════════════════

  function generateAnalysis(trade, data) {
    var correct = [];
    var wrong   = [];
    var processViolations = [];
    var improvements = [];

    // ── What was done correctly ─────────────────────────────────────
    data.positives.forEach(function(p) {
      correct.push(p.text);
    });

    if (data.riskPercent > 0 && data.riskPercent <= MAX_RISK_PERCENT) {
      correct.push('Risk was controlled within defined limits (' + data.riskPercent + '%).');
    }
    if (data.realizedRR > 0 && data.pnl > 0) {
      correct.push('Positive outcome with ' + data.realizedRR + 'R realized return.');
    }
    if (data.pnl < 0 && data.status !== 'INVALID') {
      correct.push('Losing trade executed within process parameters — loss accepted as process-compliant.');
    }

    // ── What was done wrong ─────────────────────────────────────────
    data.violations.forEach(function(v) {
      wrong.push(v.detail);
    });

    // ── Process violations ──────────────────────────────────────────
    data.violations.forEach(function(v) {
      if (v.severity === 'CRITICAL' || v.severity === 'MAJOR') {
        processViolations.push(v.tag + ': ' + v.detail);
      }
    });

    // ── Improvement actions ─────────────────────────────────────────
    var tagSet = {};
    data.tags.forEach(function(t) { tagSet[t] = true; });

    if (tagSet['No Stop Loss']) {
      improvements.push('Always define a Stop Loss before execution. No trade should be entered without predefined risk parameters.');
    }
    if (tagSet['No Strategy']) {
      improvements.push('Link every trade to a predefined strategy. Unstructured entries indicate lack of preparation.');
    }
    if (tagSet['Outside Session']) {
      improvements.push('Restrict trading to allowed session windows. Off-session trades indicate discipline issues.');
    }
    if (tagSet['Excessive Risk']) {
      improvements.push('Reduce position size to ensure risk per trade stays within the ' + MAX_RISK_PERCENT + '% limit.');
    }
    if (tagSet['Low RR']) {
      improvements.push('Ensure planned RR meets minimum requirement (' + MIN_RR + ':1) before entering.');
    }
    if (tagSet['Overtrading']) {
      improvements.push('Limit to maximum ' + MAX_TRADES_PER_DAY + ' trades per day. Quality over quantity.');
    }
    if (tagSet['Revenge Trade']) {
      improvements.push('After a loss, pause execution. Do not re-enter within ' + Math.round(REVENGE_WINDOW_MS / 60000) + ' minutes.');
    }
    if (tagSet['Impulsive Entry']) {
      improvements.push('Wait for confirmed structure before entry. Do not trade on impulse without a clear setup.');
    }
    if (tagSet['Incomplete Documentation']) {
      improvements.push('Document every trade with both a screenshot and written reasoning. Incomplete documentation compromises trade validation.');
    }
    if (tagSet['Missing Screenshot']) {
      improvements.push('Attach a TradingView screenshot for visual verification of the setup.');
    }
    if (tagSet['Poor Management']) {
      improvements.push('Allow trades to reach either Stop Loss or Take Profit. Premature manual exits undermine the trading system.');
    }

    if (improvements.length === 0 && data.status === 'VALID') {
      improvements.push('Maintain current execution standards. Continue logging with full documentation.');
    }

    // ── Verdict ─────────────────────────────────────────────────────
    var verdict = '';
    if (data.status === 'VALID') {
      verdict = 'Trade accepted as process-compliant. Execution aligned with the selected strategy and risk parameters.';
      if (data.violations.length > 0) {
        verdict += ' Minor areas for improvement identified in documentation or trade management.';
      }
    } else if (data.status === 'MINOR') {
      var minorTags = data.tags.slice(0, 3).join(', ');
      verdict = 'Trade classified as Minor violation. Issues detected: ' + minorTags + '. This trade counts toward the cycle but reduces the Challenge Score.';
    } else {
      var invalidTags = data.tags.slice(0, 3).join(', ');
      verdict = 'Trade marked as Invalid. Critical process failures detected: ' + invalidTags + '. This trade does not count toward the challenge target. Execution protocol was not followed.';
    }

    return {
      correct:           correct,
      wrong:             wrong,
      processViolations: processViolations,
      improvements:      improvements,
      verdict:           verdict
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH EVALUATION — ALL TRADES
  // ═══════════════════════════════════════════════════════════════════════════

  function evaluateAllTrades(trades, accountBalance) {
    if (!trades || trades.length === 0) {
      return { evaluations: [], summary: defaultSummary(), cycleStatus: 'No Trades' };
    }

    var evals = [];
    for (var i = 0; i < trades.length; i++) {
      var ev = evaluateTrade(trades[i], {
        allTrades: trades,
        index: i,
        accountBalance: accountBalance || 10000
      });
      evals.push(ev);
    }

    var summary = buildSummary(evals);
    var cycleStatus = getCycleStatus(summary);

    return {
      evaluations: evals,
      summary: summary,
      cycleStatus: cycleStatus
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY & CYCLE STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  function defaultSummary() {
    return {
      totalTrades: 0, validCount: 0, minorCount: 0, invalidCount: 0,
      averageScore: 0, totalPenalty: 0, totalBonus: 0,
      categoryAverages: {
        setupValidity: 0, riskManagement: 0, executionDiscipline: 0,
        sessionCompliance: 0, tradeManagement: 0, documentationQuality: 0
      },
      tagFrequency: {},
      strategyDistribution: {}
    };
  }

  function buildSummary(evals) {
    var valid = 0, minor = 0, invalid = 0;
    var totalScore = 0;
    var catTotals = {
      setupValidity: 0, riskManagement: 0, executionDiscipline: 0,
      sessionCompliance: 0, tradeManagement: 0, documentationQuality: 0
    };
    var tagFreq = {};
    var stratDist = {};

    evals.forEach(function(ev) {
      if (ev.status === 'VALID')   valid++;
      else if (ev.status === 'MINOR') minor++;
      else invalid++;

      totalScore += ev.score;

      Object.keys(ev.categories).forEach(function(k) {
        catTotals[k] += ev.categories[k];
      });

      ev.tags.forEach(function(t) {
        tagFreq[t] = (tagFreq[t] || 0) + 1;
      });

      var s = ev.coreData.strategy || '—';
      stratDist[s] = (stratDist[s] || 0) + 1;
    });

    var n = evals.length;
    var catAvg = {};
    Object.keys(catTotals).forEach(function(k) {
      catAvg[k] = n > 0 ? Math.round(catTotals[k] / n) : 0;
    });

    return {
      totalTrades: n,
      validCount: valid,
      minorCount: minor,
      invalidCount: invalid,
      averageScore: n > 0 ? Math.round(totalScore / n) : 0,
      categoryAverages: catAvg,
      tagFrequency: tagFreq,
      strategyDistribution: stratDist
    };
  }

  function getCycleStatus(summary) {
    if (summary.totalTrades === 0) return 'No Trades';
    var invalidRatio = summary.invalidCount / summary.totalTrades;
    if (summary.averageScore >= 70 && invalidRatio < 0.1) return 'On Track';
    if (summary.averageScore >= 55 && invalidRatio < 0.25) return 'Needs Discipline Improvement';
    if (summary.averageScore >= 40) return 'High Risk Pattern';
    return 'Failed';
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // CHALLENGE SCORE INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * After evaluating all trades, sync results to ChallengeScore system.
   * Maps: VALID → 'valid', MINOR → 'minor', INVALID → 'invalid'
   * Also registers overtrading, rule breaks, behavior violations.
   */
  function syncToChallengeScore(result) {
    if (!window.ChallengeScore) return;

    var evals = result.evaluations || [];
    evals.forEach(function(ev, i) {
      var csStatus = ev.status === 'VALID' ? 'valid' : ev.status === 'MINOR' ? 'minor' : 'invalid';
      window.ChallengeScore.setTradeReview(i, csStatus);
    });

    // Register overtrading
    var overtradeDays = {};
    evals.forEach(function(ev) {
      ev.violations.forEach(function(v) {
        if (v.tag === 'Overtrading') {
          var dateKey = getDateKey(ev.coreData.entryTime);
          if (dateKey && !overtradeDays[dateKey]) {
            overtradeDays[dateKey] = true;
            window.ChallengeScore.flagOvertrading(dateKey);
          }
        }
      });
    });

    // Register behavior violations (revenge trades)
    evals.forEach(function(ev) {
      ev.violations.forEach(function(v) {
        if (v.tag === 'Revenge Trade') {
          window.ChallengeScore.addBehaviorViolation('Revenge trade detected: ' + v.detail);
        }
      });
    });

    // Register rule breaks (no SL, outside session)
    evals.forEach(function(ev) {
      ev.violations.forEach(function(v) {
        if (v.tag === 'No Stop Loss' || v.tag === 'Outside Session') {
          window.ChallengeScore.addRuleBreak(v.tag + ': ' + v.detail);
        }
      });
    });

    window.ChallengeScore.onTradeLogged();
    if (window.ChallengeScore.renderAll) window.ChallengeScore.renderAll();
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: POST-TRADE ANALYSIS PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Render a full post-trade analysis into a container element.
   * Preserves existing UI styles — uses inline styles matching the platform.
   */
  function renderAnalysis(containerId, evaluation) {
    var el = document.getElementById(containerId);
    if (!el || !evaluation) return;

    var ev = evaluation;
    var an = ev.analysis;
    var statusColors = {
      VALID:   { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)',  text: 'rgba(34,197,94,0.9)' },
      MINOR:   { bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.2)',  text: 'rgba(234,179,8,0.9)' },
      INVALID: { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.15)', text: 'rgba(239,68,68,0.9)' }
    };
    var sc = statusColors[ev.status] || statusColors.INVALID;

    var html = '';

    // ── HEADER ──────────────────────────────────────────────────────
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem;">';
    html += '<div style="display:flex;align-items:center;gap:.6rem;">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(214,190,150,0.7)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    html += '<span style="font-size:.85rem;font-weight:700;color:var(--txt-primary);letter-spacing:.03em;">TRADE EVALUATION RESULT</span>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:.6rem;">';
    html += '<span style="font-size:.85rem;font-weight:700;color:var(--txt-primary);">' + ev.score + '/100</span>';
    html += '<span style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;padding:3px 10px;border-radius:100px;background:' + sc.bg + ';color:' + sc.text + ';border:1px solid ' + sc.border + ';">' + ev.status + '</span>';
    html += '</div></div>';

    // ── CATEGORY SCORES ─────────────────────────────────────────────
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-bottom:1rem;">';
    var catNames = {
      setupValidity: 'Setup Validity',
      riskManagement: 'Risk Management',
      executionDiscipline: 'Execution Discipline',
      sessionCompliance: 'Session Compliance',
      tradeManagement: 'Trade Management',
      documentationQuality: 'Documentation'
    };
    Object.keys(catNames).forEach(function(key) {
      var val = ev.categories[key];
      var catColor = val >= 70 ? 'rgba(34,197,94,0.8)' : val >= 50 ? 'rgba(234,179,8,0.8)' : 'rgba(239,68,68,0.7)';
      html += '<div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:8px;padding:.5rem .6rem;text-align:center;">';
      html += '<div style="font-size:.95rem;font-weight:700;color:' + catColor + ';">' + val + '</div>';
      html += '<div style="font-size:.6rem;color:var(--txt-muted);margin-top:.15rem;">' + catNames[key] + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // ── CORE DATA ───────────────────────────────────────────────────
    html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.3rem .75rem;font-size:.72rem;margin-bottom:1rem;padding:.6rem .75rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--border-default);">';
    var coreItems = [
      ['Strategy', ev.coreData.strategy],
      ['Direction', ev.coreData.direction],
      ['Entry', ev.coreData.entry],
      ['Stop Loss', ev.coreData.sl],
      ['Take Profit', ev.coreData.tp],
      ['Risk', ev.coreData.riskPercent > 0 ? ev.coreData.riskPercent + '%' : '—'],
      ['Planned RR', ev.coreData.plannedRR > 0 ? ev.coreData.plannedRR + ':1' : '—'],
      ['Realized RR', ev.coreData.realizedRR !== 0 ? ev.coreData.realizedRR + ':1' : '—'],
      ['P/L', ev.coreData.pnl !== null && !isNaN(ev.coreData.pnl) ? (ev.coreData.pnl >= 0 ? '+' : '') + '$' + ev.coreData.pnl.toFixed(2) : '—'],
      ['Session', ev.coreData.session]
    ];
    coreItems.forEach(function(item) {
      html += '<div style="display:flex;justify-content:space-between;padding:.2rem 0;border-bottom:1px solid rgba(255,255,255,0.03);">';
      html += '<span style="color:var(--txt-muted);">' + item[0] + '</span>';
      html += '<span style="color:var(--txt-primary);font-weight:600;">' + item[1] + '</span>';
      html += '</div>';
    });
    html += '</div>';

    // ── COMPLIANCE CHECKLIST ────────────────────────────────────────
    html += '<div style="margin-bottom:1rem;">';
    html += '<div style="font-size:.7rem;font-weight:700;color:var(--txt-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.4rem;">Compliance Check</div>';
    var checks = [
      ['SL Present', ev.compliance.slPresent],
      ['Risk Valid', ev.compliance.riskValid],
      ['Session Valid', ev.compliance.sessionValid],
      ['Strategy Matched', ev.compliance.strategyMatched],
      ['Trigger Present', ev.compliance.triggerPresent],
      ['RR Acceptable', ev.compliance.rrAcceptable],
      ['Documentation Complete', ev.compliance.documentationComplete]
    ];
    html += '<div style="display:flex;flex-wrap:wrap;gap:.3rem;">';
    checks.forEach(function(chk) {
      var pass = chk[1];
      var icon = pass
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.8)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.7)" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      var bg = pass ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)';
      var border = pass ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)';
      var color = pass ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.7)';
      html += '<span style="display:inline-flex;align-items:center;gap:.25rem;font-size:.65rem;font-weight:600;padding:2px 8px;border-radius:100px;background:' + bg + ';border:1px solid ' + border + ';color:' + color + ';">' + icon + chk[0] + '</span>';
    });
    html += '</div></div>';

    // ── VIOLATION TAGS ──────────────────────────────────────────────
    if (ev.tags.length > 0) {
      html += '<div style="margin-bottom:1rem;">';
      html += '<div style="font-size:.7rem;font-weight:700;color:var(--txt-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.4rem;">Violation Tags</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:.3rem;">';
      ev.tags.forEach(function(tag) {
        html += '<span style="display:inline-block;font-size:.62rem;font-weight:700;padding:2px 8px;border-radius:100px;background:rgba(239,68,68,0.08);color:rgba(239,68,68,0.8);border:1px solid rgba(239,68,68,0.15);">' + tag + '</span>';
      });
      html += '</div></div>';
    }

    // ── TRADE ANALYSIS ──────────────────────────────────────────────
    html += '<div style="border-top:1px solid var(--border-default);padding-top:1rem;">';
    html += '<div style="font-size:.8rem;font-weight:700;color:var(--txt-primary);margin-bottom:.75rem;letter-spacing:.03em;">Trade Analysis</div>';

    // Correct
    if (an.correct.length > 0) {
      html += '<div style="margin-bottom:.75rem;">';
      html += '<div style="font-size:.68rem;font-weight:700;color:rgba(34,197,94,0.8);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem;">What Was Done Correctly</div>';
      an.correct.forEach(function(c) {
        html += '<div style="display:flex;align-items:flex-start;gap:.4rem;font-size:.72rem;color:var(--txt-secondary);padding:.15rem 0;">';
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.7)" stroke-width="2.5" style="flex-shrink:0;margin-top:2px;"><polyline points="20 6 9 17 4 12"/></svg>';
        html += '<span>' + c + '</span></div>';
      });
      html += '</div>';
    }

    // Wrong
    if (an.wrong.length > 0) {
      html += '<div style="margin-bottom:.75rem;">';
      html += '<div style="font-size:.68rem;font-weight:700;color:rgba(239,68,68,0.8);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem;">What Was Done Wrong</div>';
      an.wrong.forEach(function(w) {
        html += '<div style="display:flex;align-items:flex-start;gap:.4rem;font-size:.72rem;color:var(--txt-secondary);padding:.15rem 0;">';
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.7)" stroke-width="2.5" style="flex-shrink:0;margin-top:2px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        html += '<span>' + w + '</span></div>';
      });
      html += '</div>';
    }

    // Process violations
    if (an.processViolations.length > 0) {
      html += '<div style="margin-bottom:.75rem;">';
      html += '<div style="font-size:.68rem;font-weight:700;color:rgba(234,179,8,0.9);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem;">Process Violations</div>';
      an.processViolations.forEach(function(p) {
        html += '<div style="display:flex;align-items:flex-start;gap:.4rem;font-size:.72rem;color:var(--txt-secondary);padding:.15rem 0;">';
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(234,179,8,0.8)" stroke-width="2" style="flex-shrink:0;margin-top:2px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        html += '<span>' + p + '</span></div>';
      });
      html += '</div>';
    }

    // Improvements
    if (an.improvements.length > 0) {
      html += '<div style="margin-bottom:.75rem;">';
      html += '<div style="font-size:.68rem;font-weight:700;color:rgba(96,165,250,0.9);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem;">Required Improvements</div>';
      an.improvements.forEach(function(imp) {
        html += '<div style="display:flex;align-items:flex-start;gap:.4rem;font-size:.72rem;color:var(--txt-secondary);padding:.15rem 0;">';
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(96,165,250,0.8)" stroke-width="2" style="flex-shrink:0;margin-top:2px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        html += '<span>' + imp + '</span></div>';
      });
      html += '</div>';
    }

    // Verdict
    html += '<div style="margin-top:.75rem;padding:.6rem .75rem;border-radius:8px;background:' + sc.bg + ';border:1px solid ' + sc.border + ';">';
    html += '<div style="font-size:.65rem;font-weight:700;color:' + sc.text + ';text-transform:uppercase;letter-spacing:.06em;margin-bottom:.25rem;">Verdict</div>';
    html += '<div style="font-size:.72rem;color:var(--txt-secondary);line-height:1.5;">' + an.verdict + '</div>';
    html += '</div>';

    html += '</div>'; // end analysis section

    el.innerHTML = html;
    el.style.display = 'block';
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: DASHBOARD SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  function renderDashboard(containerId, result) {
    var el = document.getElementById(containerId);
    if (!el || !result) return;

    var s = result.summary;
    var cs = getCycleStatus(s);
    var csColor = cs === 'On Track' ? 'rgba(34,197,94,0.9)' : cs === 'Needs Discipline Improvement' ? 'rgba(234,179,8,0.9)' : 'rgba(239,68,68,0.9)';

    var html = '';

    // Status row
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;">';
    html += '<span style="font-size:.7rem;font-weight:700;color:var(--txt-muted);text-transform:uppercase;letter-spacing:.08em;">EVALUATION SUMMARY</span>';
    html += '<span style="font-size:.65rem;font-weight:700;padding:3px 10px;border-radius:100px;color:' + csColor + ';background:rgba(0,0,0,0.2);border:1px solid ' + csColor + ';">' + cs + '</span>';
    html += '</div>';

    // Stats grid
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;margin-bottom:.75rem;">';
    var stats = [
      [s.totalTrades, 'Total', 'var(--txt-primary)'],
      [s.validCount, 'Valid', 'rgba(34,197,94,0.9)'],
      [s.minorCount, 'Minor', 'rgba(234,179,8,0.9)'],
      [s.invalidCount, 'Invalid', 'rgba(239,68,68,0.9)']
    ];
    stats.forEach(function(st) {
      html += '<div style="text-align:center;padding:.4rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--border-default);">';
      html += '<div style="font-size:1rem;font-weight:700;color:' + st[2] + ';">' + st[0] + '</div>';
      html += '<div style="font-size:.6rem;color:var(--txt-muted);">' + st[1] + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // Average score
    html += '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">';
    html += '<span style="font-size:.7rem;color:var(--txt-muted);">Avg Score:</span>';
    html += '<span style="font-size:.85rem;font-weight:700;color:var(--txt-primary);">' + s.averageScore + '/100</span>';
    html += '</div>';

    // Category averages bar
    var catNames = {
      setupValidity: 'Setup', riskManagement: 'Risk', executionDiscipline: 'Execution',
      sessionCompliance: 'Session', tradeManagement: 'Management', documentationQuality: 'Docs'
    };
    html += '<div style="display:flex;flex-direction:column;gap:.25rem;">';
    Object.keys(catNames).forEach(function(key) {
      var val = s.categoryAverages[key];
      var barColor = val >= 70 ? 'rgba(34,197,94,0.7)' : val >= 50 ? 'rgba(234,179,8,0.7)' : 'rgba(239,68,68,0.6)';
      html += '<div style="display:flex;align-items:center;gap:.5rem;">';
      html += '<span style="font-size:.6rem;color:var(--txt-muted);width:70px;text-align:right;">' + catNames[key] + '</span>';
      html += '<div style="flex:1;height:5px;background:var(--bg-card);border-radius:3px;overflow:hidden;"><div style="height:100%;width:' + val + '%;background:' + barColor + ';border-radius:3px;transition:width .3s;"></div></div>';
      html += '<span style="font-size:.6rem;font-weight:600;color:var(--txt-secondary);width:25px;">' + val + '</span>';
      html += '</div>';
    });
    html += '</div>';

    // Top violation tags
    var tagKeys = Object.keys(s.tagFrequency).sort(function(a, b) { return s.tagFrequency[b] - s.tagFrequency[a]; }).slice(0, 5);
    if (tagKeys.length > 0) {
      html += '<div style="margin-top:.75rem;">';
      html += '<div style="font-size:.65rem;font-weight:700;color:var(--txt-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem;">Top Violations</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:.25rem;">';
      tagKeys.forEach(function(t) {
        html += '<span style="font-size:.6rem;font-weight:600;padding:2px 7px;border-radius:100px;background:rgba(239,68,68,0.06);color:rgba(239,68,68,0.7);border:1px solid rgba(239,68,68,0.12);">' + t + ' (' + s.tagFrequency[t] + ')</span>';
      });
      html += '</div></div>';
    }

    el.innerHTML = html;
    el.style.display = 'block';
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════════

  function saveEvaluations(result) {
    try {
      localStorage.setItem(ENGINE_KEY, JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: result.summary,
        cycleStatus: result.cycleStatus,
        evaluations: result.evaluations.map(function(ev) {
          return {
            tradeId: ev.tradeId,
            status: ev.status,
            score: ev.score,
            tags: ev.tags,
            categories: ev.categories,
            counts: ev.counts
          };
        })
      }));
    } catch (e) { /* quota exceeded — ignore */ }
  }

  function loadEvaluations() {
    try {
      var d = localStorage.getItem(ENGINE_KEY);
      return d ? JSON.parse(d) : null;
    } catch (e) { return null; }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════════════════════════════════════════

  function pf(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function clamp(v) { return Math.max(0, Math.min(100, v)); }

  function getDateKey(timeStr) {
    if (!timeStr) return '';
    var d = new Date(timeStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  function checkSession(entryTime) {
    if (!entryTime) return { status: 'unknown', hour: null, window: null };
    var d = new Date(entryTime);
    if (isNaN(d.getTime())) return { status: 'unknown', hour: null, window: null };
    var h = d.getUTCHours();
    for (var i = 0; i < SESSION_WINDOWS.length; i++) {
      if (h >= SESSION_WINDOWS[i].startHour && h < SESSION_WINDOWS[i].endHour) {
        return { status: 'inside', hour: h, window: SESSION_WINDOWS[i].name };
      }
    }
    return { status: 'outside', hour: h, window: null };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  window.TradeEvaluation = {
    evaluateTrade:        evaluateTrade,
    evaluateAllTrades:    evaluateAllTrades,
    syncToChallengeScore: syncToChallengeScore,
    renderAnalysis:       renderAnalysis,
    renderDashboard:      renderDashboard,
    saveEvaluations:      saveEvaluations,
    loadEvaluations:      loadEvaluations,

    // Config (read-only)
    SESSION_WINDOWS:      SESSION_WINDOWS,
    CATEGORY_WEIGHTS:     CATEGORY_WEIGHTS,
    MAX_RISK_PERCENT:     MAX_RISK_PERCENT,
    MIN_RR:               MIN_RR,
    MAX_TRADES_PER_DAY:   MAX_TRADES_PER_DAY
  };

})();
