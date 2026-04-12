/**
 * ALTIVOR INSTITUTE — Trade Evaluation & Scoring Engine
 * Behavioral execution validation system
 * 
 * Evaluates: process quality, rule adherence, behavioral consistency
 * Does NOT evaluate: profit as primary metric
 * All scoring derived from execution correctness relative to defined process rules
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTANTS & CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  const ENGINE_VERSION = '1.0.0';
  const STORAGE_KEY = 'altivor_scoring_engine_v1';
  const ROLLING_WINDOW = 25;
  const MIN_TRADES_FOR_TIER = 10;

  // Allowed trading windows (UTC hours)
  const TRADING_WINDOWS = [
    { name: 'NY Core', startHour: 13, endHour: 16 },
    { name: 'NY Continuation', startHour: 16, endHour: 19 }
  ];

  // Penalty table (points deducted from 100 base)
  const PENALTIES = {
    NO_STOP_LOSS:          { points: 40, code: 'NO_SL',          label: 'No Stop Loss',                    severity: 'CRITICAL' },
    NO_M5_BIAS:            { points: 25, code: 'NO_M5_BIAS',     label: 'No M5 bias confirmation',         severity: 'MAJOR' },
    NO_PULLBACK_ENTRY:     { points: 20, code: 'NO_PULLBACK',    label: 'Entry without pullback',          severity: 'MAJOR' },
    OUTSIDE_SESSION:       { points: 30, code: 'OUT_SESSION',    label: 'Trade outside allowed session',   severity: 'CRITICAL' },
    OVERTRADING:           { points: 15, code: 'OVERTRADE',      label: 'Overtrading',                     severity: 'MODERATE' },
    RISK_CHANGED:          { points: 20, code: 'RISK_CHANGE',    label: 'Risk changed mid-trade',          severity: 'MAJOR' },
    NO_BOS:                { points: 20, code: 'NO_BOS',         label: 'No BOS confirmation',             severity: 'MAJOR' },
    M1_AS_BIAS:            { points: 15, code: 'M1_BIAS',        label: 'M1 used as bias (not trigger)',   severity: 'MODERATE' },
    SL_STRUCTURALLY_INVALID: { points: 15, code: 'SL_INVALID',   label: 'SL not structurally valid',       severity: 'MODERATE' }
  };

  // Weighted scoring model
  const WEIGHTS = {
    RISK_GOVERNANCE: 0.40,
    DISCIPLINE:      0.30,
    CONSISTENCY:     0.15,
    PERFORMANCE:     0.15
  };

  // Readiness tiers
  const TIERS = [
    { id: 'UNVERIFIED',          label: 'Unverified',           minScore: 0,  maxScore: 100, minTrades: 0,             maxTrades: MIN_TRADES_FOR_TIER - 1 },
    { id: 'UNSTABLE',            label: 'Unstable',             minScore: 0,  maxScore: 39,  minTrades: MIN_TRADES_FOR_TIER },
    { id: 'STRUCTURED',          label: 'Structured',           minScore: 40, maxScore: 64,  minTrades: MIN_TRADES_FOR_TIER },
    { id: 'FUNDABLE',            label: 'Fundable',             minScore: 65, maxScore: 84,  minTrades: MIN_TRADES_FOR_TIER },
    { id: 'INSTITUTIONAL_READY', label: 'Institutional Ready',  minScore: 85, maxScore: 100, minTrades: MIN_TRADES_FOR_TIER }
  ];

  // Behavioral pattern detection thresholds
  const BEHAVIOR = {
    REVENGE_TRADE_WINDOW_MS:  15 * 60 * 1000,   // 15 minutes
    MAX_TRADES_PER_DAY:       2,
    LATE_ENTRY_THRESHOLD_MIN: 45                 // minutes after session open
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // TRADE EVALUATION — SINGLE TRADE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Evaluate a single trade.
   * @param {Object} trade - Trade object (may include scoring metadata fields)
   * @param {Object} context - { trades: [...allTrades], index: number }
   * @returns {Object} evaluation result
   */
  function evaluateTrade(trade, context) {
    const penalties = [];
    const strengths = [];
    const issues = [];
    const flags = [];
    let baseScore = 100;
    const meta = trade._scoring || {};

    // ── Stop Loss ────────────────────────────────────────────────────────
    const hasSL = trade.stopLoss && parseFloat(trade.stopLoss) > 0;
    if (!hasSL) {
      penalties.push(PENALTIES.NO_STOP_LOSS);
      issues.push('Trade executed without Stop Loss');
    } else {
      // SL structural validity
      const slValid = meta.slStructurallyValid !== false;
      if (hasSL && !slValid && meta.slStructurallyValid === false) {
        penalties.push(PENALTIES.SL_STRUCTURALLY_INVALID);
        issues.push('Stop Loss placement not structurally valid');
      } else if (hasSL && slValid) {
        strengths.push('Proper SL placement');
      }
    }

    // ── M5 Bias ──────────────────────────────────────────────────────────
    if (meta.m5Bias === false) {
      penalties.push(PENALTIES.NO_M5_BIAS);
      issues.push('No M5 bias confirmation before entry');
    } else if (meta.m5Bias === true) {
      strengths.push('Valid M5 bias confirmed');
    }

    // ── Pullback entry ───────────────────────────────────────────────────
    if (meta.pullbackEntry === false) {
      penalties.push(PENALTIES.NO_PULLBACK_ENTRY);
      issues.push('Entry on impulse (no pullback)');
    } else if (meta.pullbackEntry === true) {
      strengths.push('Entry on pullback confirmed');
    }

    // ── BOS confirmation ─────────────────────────────────────────────────
    if (meta.bosConfirmation === false) {
      penalties.push(PENALTIES.NO_BOS);
      issues.push('No Break of Structure confirmation');
    } else if (meta.bosConfirmation === true) {
      strengths.push('Correct BOS confirmation');
    }

    // ── M1 usage ─────────────────────────────────────────────────────────
    if (meta.m1AsBias === true) {
      penalties.push(PENALTIES.M1_AS_BIAS);
      issues.push('M1 timeframe used as bias instead of trigger only');
    } else if (meta.m1TriggerOnly === true) {
      strengths.push('M1 used correctly as trigger');
    }

    // ── Trading window ───────────────────────────────────────────────────
    const withinWindow = checkTradingWindow(trade);
    if (withinWindow === false) {
      penalties.push(PENALTIES.OUTSIDE_SESSION);
      issues.push('Trade executed outside allowed session window');
    } else if (withinWindow === true) {
      strengths.push('Trade within allowed session window');
    }

    // ── Risk changed mid-trade ───────────────────────────────────────────
    if (meta.riskChangedMidTrade === true) {
      penalties.push(PENALTIES.RISK_CHANGED);
      issues.push('Risk parameters modified mid-trade');
    }

    // ── Overtrading check (contextual) ───────────────────────────────────
    if (context && context.trades) {
      const tradeDate = getTradeDate(trade);
      const sameDayTrades = context.trades.filter(t => {
        const d = getTradeDate(t);
        return d === tradeDate;
      });
      if (sameDayTrades.length > BEHAVIOR.MAX_TRADES_PER_DAY) {
        penalties.push(PENALTIES.OVERTRADING);
        issues.push('More than ' + BEHAVIOR.MAX_TRADES_PER_DAY + ' trades on this day');
        flags.push('OVERTRADING');
      }
    }

    // ── Calculate trade score ────────────────────────────────────────────
    let totalPenalty = 0;
    penalties.forEach(p => { totalPenalty += p.points; });
    const tradeScore = Math.max(0, baseScore - totalPenalty);

    // ── Grade assignment ─────────────────────────────────────────────────
    let grade;
    if (tradeScore >= 90) {
      grade = 'A+';
    } else if (tradeScore >= 75) {
      grade = 'A';
    } else if (tradeScore >= 50) {
      grade = 'B';
    } else {
      grade = 'F';
    }

    // ── Setup validity ───────────────────────────────────────────────────
    const hasCritical = penalties.some(p => p.severity === 'CRITICAL');
    const setupValid = !hasCritical;

    // ── Determine completeness ───────────────────────────────────────────
    const scoringFieldCount = ['m5Bias', 'pullbackEntry', 'bosConfirmation',
      'm1TriggerOnly', 'slStructurallyValid', 'riskChangedMidTrade'].filter(k => meta[k] !== undefined).length;
    const completeness = Math.round((scoringFieldCount / 6) * 100);

    // ── R-multiple ───────────────────────────────────────────────────────
    const rMultiple = calculateRMultiple(trade);

    // ── Build feedback ───────────────────────────────────────────────────
    const feedback = {
      executionGrade: grade,
      setupValid: setupValid ? 'VALID' : 'INVALID',
      issues: issues,
      strengths: strengths,
      score: tradeScore,
      completeness: completeness
    };

    return {
      tradeId: trade.id,
      tradeNumber: trade.tradeNumber,
      date: trade.date,
      setupValid: setupValid,
      grade: grade,
      score: tradeScore,
      rMultiple: rMultiple,
      penalties: penalties.map(p => ({ code: p.code, points: p.points, label: p.label, severity: p.severity })),
      flags: flags,
      strengths: strengths,
      issues: issues,
      feedback: feedback,
      completeness: completeness
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // BEHAVIORAL ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyze behavioral patterns across all trades.
   * @param {Array} trades - All trade objects
   * @returns {Object} { patterns: [...], flags: [...], summary: {} }
   */
  function analyzeBehavior(trades) {
    if (!trades || trades.length === 0) {
      return { patterns: [], flags: [], summary: {} };
    }

    const patterns = [];
    const flags = [];
    const sorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));

    // ── Overtrading detection ────────────────────────────────────────────
    const dayGroups = groupByDay(sorted);
    let overtradeDays = 0;
    Object.entries(dayGroups).forEach(([day, dayTrades]) => {
      if (dayTrades.length > BEHAVIOR.MAX_TRADES_PER_DAY) {
        overtradeDays++;
        patterns.push({
          type: 'OVERTRADING',
          severity: 'MODERATE',
          date: day,
          detail: dayTrades.length + ' trades on ' + day + ' (max: ' + BEHAVIOR.MAX_TRADES_PER_DAY + ')'
        });
      }
    });
    if (overtradeDays > 0) flags.push('OVERTRADING');

    // ── Revenge trading detection ────────────────────────────────────────
    let revengeCount = 0;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const prevPnl = parseFloat(prev.pnl) || 0;
      const timeDiff = new Date(curr.date) - new Date(prev.date);

      if (prevPnl < 0 && timeDiff > 0 && timeDiff < BEHAVIOR.REVENGE_TRADE_WINDOW_MS) {
        revengeCount++;
        patterns.push({
          type: 'REVENGE_TRADE',
          severity: 'CRITICAL',
          date: curr.date,
          detail: 'Trade entered ' + Math.round(timeDiff / 60000) + 'min after loss'
        });
      }
    }
    if (revengeCount > 0) flags.push('REVENGE_TRADING');

    // ── Late entries detection ────────────────────────────────────────────
    let lateEntries = 0;
    sorted.forEach(t => {
      const meta = t._scoring || {};
      if (meta.lateEntry === true) {
        lateEntries++;
        patterns.push({
          type: 'LATE_ENTRY',
          severity: 'MODERATE',
          date: t.date,
          detail: 'Entry after move completion'
        });
      }
    });
    if (lateEntries > 0) flags.push('LATE_ENTRIES');

    // ── Impatience detection ─────────────────────────────────────────────
    let impatienceCount = 0;
    sorted.forEach(t => {
      const meta = t._scoring || {};
      if (meta.bosConfirmation === false) {
        impatienceCount++;
        patterns.push({
          type: 'IMPATIENCE',
          severity: 'MODERATE',
          date: t.date,
          detail: 'Entry before BOS confirmation'
        });
      }
    });
    if (impatienceCount > 0) flags.push('LACK_OF_PATIENCE');

    // ── Bias persistence detection ───────────────────────────────────────
    let biasPersistence = 0;
    for (let i = 2; i < sorted.length; i++) {
      const t0 = sorted[i - 2];
      const t1 = sorted[i - 1];
      const t2 = sorted[i];
      if (t0.direction === t1.direction && t1.direction === t2.direction) {
        const pnl0 = parseFloat(t0.pnl) || 0;
        const pnl1 = parseFloat(t1.pnl) || 0;
        if (pnl0 < 0 && pnl1 < 0) {
          biasPersistence++;
          patterns.push({
            type: 'BIAS_PERSISTENCE',
            severity: 'MAJOR',
            date: t2.date,
            detail: '3 consecutive same-direction trades after 2 losses — bias not reset'
          });
        }
      }
    }
    if (biasPersistence > 0) flags.push('BIAS_PERSISTENCE');

    // ── Session violation frequency ──────────────────────────────────────
    let sessionViolations = 0;
    sorted.forEach(t => {
      if (checkTradingWindow(t) === false) sessionViolations++;
    });
    if (sessionViolations > 0) flags.push('SESSION_VIOLATIONS');

    return {
      patterns: patterns,
      flags: [...new Set(flags)],
      summary: {
        totalPatterns: patterns.length,
        overtradeDays: overtradeDays,
        revengeTrades: revengeCount,
        lateEntries: lateEntries,
        impatienceEvents: impatienceCount,
        biasPersistence: biasPersistence,
        sessionViolations: sessionViolations
      }
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL SCORING — WEIGHTED MODEL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute the global Trader Score from evaluated trades.
   * Uses a rolling window of the last N trades.
   * @param {Array} evaluations - Array of evaluateTrade() results
   * @param {Object} behaviorAnalysis - analyzeBehavior() result
   * @returns {Object} { traderScore, components, tier, gradeDistribution, scoreHistory }
   */
  function computeGlobalScore(evaluations, behaviorAnalysis) {
    if (!evaluations || evaluations.length === 0) {
      return {
        traderScore: 0,
        components: { riskGovernance: 0, discipline: 0, consistency: 0, performance: 0 },
        tier: getTier(0, 0),
        gradeDistribution: { 'A+': 0, A: 0, B: 0, F: 0 },
        scoreHistory: []
      };
    }

    // Use rolling window
    const window = evaluations.slice(-ROLLING_WINDOW);
    const total = window.length;

    // ── Grade distribution ───────────────────────────────────────────────
    const gradeDistribution = { 'A+': 0, A: 0, B: 0, F: 0 };
    window.forEach(e => {
      if (gradeDistribution.hasOwnProperty(e.grade)) {
        gradeDistribution[e.grade]++;
      }
    });

    // ── Risk Governance (40%) ────────────────────────────────────────────
    // Based on: SL presence, SL validity, session compliance, no risk changes
    let riskPoints = 0;
    window.forEach(e => {
      let tradeRisk = 100;
      e.penalties.forEach(p => {
        if (['NO_SL', 'SL_INVALID', 'OUT_SESSION', 'RISK_CHANGE'].includes(p.code)) {
          tradeRisk -= p.points;
        }
      });
      riskPoints += Math.max(0, tradeRisk);
    });
    const riskGovernance = total > 0 ? riskPoints / total : 0;

    // ── Discipline (30%) ─────────────────────────────────────────────────
    // Based on: overtrading avoidance, M5 bias, BOS, pullback
    let disciplinePoints = 0;
    window.forEach(e => {
      let tradeDiscipline = 100;
      e.penalties.forEach(p => {
        if (['OVERTRADE', 'NO_M5_BIAS', 'NO_BOS', 'NO_PULLBACK', 'M1_BIAS'].includes(p.code)) {
          tradeDiscipline -= p.points;
        }
      });
      disciplinePoints += Math.max(0, tradeDiscipline);
    });
    const discipline = total > 0 ? disciplinePoints / total : 0;

    // ── Consistency (15%) ────────────────────────────────────────────────
    // Based on: grade stability, absence of behavioral flags, streak analysis
    const scores = window.map(e => e.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / total;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / total;
    const stdDev = Math.sqrt(variance);
    const stabilityScore = Math.max(0, 100 - stdDev * 2);

    const behaviorPenalty = behaviorAnalysis ? behaviorAnalysis.flags.length * 8 : 0;
    const consistency = Math.max(0, stabilityScore - behaviorPenalty);

    // ── Performance (15%) — R-based, NOT PnL ─────────────────────────────
    const rMultiples = window.map(e => e.rMultiple).filter(r => r !== null && !isNaN(r));
    let performance = 50; // neutral baseline
    if (rMultiples.length > 0) {
      const avgR = rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length;
      const positiveR = rMultiples.filter(r => r > 0).length;
      const winRate = positiveR / rMultiples.length;

      // R-expectancy scaled to 0-100
      performance = Math.min(100, Math.max(0,
        50 + (avgR * 20) + ((winRate - 0.4) * 60)
      ));
    }

    // ── Weighted composite ───────────────────────────────────────────────
    let traderScore = Math.round(
      riskGovernance * WEIGHTS.RISK_GOVERNANCE +
      discipline * WEIGHTS.DISCIPLINE +
      consistency * WEIGHTS.CONSISTENCY +
      performance * WEIGHTS.PERFORMANCE
    );

    // ── Hard cap: poor risk control cannot exceed 50 ─────────────────────
    if (riskGovernance < 50) {
      traderScore = Math.min(traderScore, 50);
    }

    // ── Score history (cumulative after each trade) ──────────────────────
    const scoreHistory = buildScoreHistory(evaluations);

    return {
      traderScore: Math.min(100, Math.max(0, traderScore)),
      components: {
        riskGovernance: Math.round(riskGovernance),
        discipline: Math.round(discipline),
        consistency: Math.round(consistency),
        performance: Math.round(performance)
      },
      tier: getTier(traderScore, evaluations.length),
      gradeDistribution: gradeDistribution,
      scoreHistory: scoreHistory,
      rollingWindow: ROLLING_WINDOW,
      tradesInWindow: total
    };
  }

  /**
   * Build cumulative score history for charting.
   */
  function buildScoreHistory(evaluations) {
    const history = [];
    for (let i = 0; i < evaluations.length; i++) {
      const windowStart = Math.max(0, i + 1 - ROLLING_WINDOW);
      const slice = evaluations.slice(windowStart, i + 1);
      const avg = slice.reduce((s, e) => s + e.score, 0) / slice.length;
      history.push({
        tradeIndex: i + 1,
        tradeId: evaluations[i].tradeId,
        score: Math.round(avg),
        grade: evaluations[i].grade
      });
    }
    return history;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // READINESS TIER
  // ═══════════════════════════════════════════════════════════════════════════

  function getTier(score, tradeCount) {
    if (tradeCount < MIN_TRADES_FOR_TIER) {
      return { ...TIERS[0] }; // UNVERIFIED
    }
    // Iterate from highest to lowest
    for (let i = TIERS.length - 1; i >= 1; i--) {
      const t = TIERS[i];
      if (score >= t.minScore && (t.minTrades === undefined || tradeCount >= t.minTrades)) {
        return { ...t };
      }
    }
    return { ...TIERS[1] }; // UNSTABLE
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // FULL EVALUATION PIPELINE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Run the complete evaluation pipeline on all trades.
   * @param {Array} trades - All trade objects from challengeData.trades
   * @returns {Object} Complete evaluation result
   */
  function evaluateAll(trades) {
    if (!trades || trades.length === 0) {
      return {
        evaluations: [],
        globalScore: computeGlobalScore([], null),
        behavior: { patterns: [], flags: [], summary: {} },
        summary: {
          totalTrades: 0,
          evaluatedTrades: 0,
          averageScore: 0,
          averageCompleteness: 0
        }
      };
    }

    // Evaluate each trade
    const evaluations = trades.map((trade, idx) => {
      return evaluateTrade(trade, { trades: trades, index: idx });
    });

    // Behavioral analysis
    const behavior = analyzeBehavior(trades);

    // Global score
    const globalScore = computeGlobalScore(evaluations, behavior);

    // Summary
    const scores = evaluations.map(e => e.score);
    const completeness = evaluations.map(e => e.completeness);

    return {
      evaluations: evaluations,
      globalScore: globalScore,
      behavior: behavior,
      summary: {
        totalTrades: trades.length,
        evaluatedTrades: evaluations.length,
        averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        averageCompleteness: Math.round(completeness.reduce((a, b) => a + b, 0) / completeness.length)
      }
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  function checkTradingWindow(trade) {
    const entryTime = trade.entryTime || trade.date;
    if (!entryTime) return null; // unknown

    const d = new Date(entryTime);
    if (isNaN(d.getTime())) return null;

    const utcHour = d.getUTCHours();
    for (const w of TRADING_WINDOWS) {
      if (utcHour >= w.startHour && utcHour < w.endHour) return true;
    }
    return false;
  }

  function getTradeDate(trade) {
    const d = new Date(trade.date || trade.entryTime);
    if (isNaN(d.getTime())) return 'unknown';
    return d.toISOString().slice(0, 10);
  }

  function groupByDay(trades) {
    const groups = {};
    trades.forEach(t => {
      const day = getTradeDate(t);
      if (!groups[day]) groups[day] = [];
      groups[day].push(t);
    });
    return groups;
  }

  function calculateRMultiple(trade) {
    const entry = parseFloat(trade.entryPrice);
    const exit = parseFloat(trade.exitPrice);
    const sl = parseFloat(trade.stopLoss);

    if (!entry || !exit || !sl || entry === sl) return null;

    const risk = Math.abs(entry - sl);
    const reward = trade.direction === 'long'
      ? exit - entry
      : entry - exit;

    return Math.round((reward / risk) * 100) / 100;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════════

  function saveEvaluation(result) {
    try {
      const toSave = {
        timestamp: new Date().toISOString(),
        version: ENGINE_VERSION,
        traderScore: result.globalScore.traderScore,
        tier: result.globalScore.tier.id,
        gradeDistribution: result.globalScore.gradeDistribution,
        components: result.globalScore.components,
        behaviorFlags: result.behavior.flags,
        scoreHistory: result.globalScore.scoreHistory,
        summary: result.summary
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn('[ScoringEngine] Failed to save evaluation:', e);
    }
  }

  function loadEvaluation() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  window.AltivorScoringEngine = {
    VERSION: ENGINE_VERSION,

    // Core evaluation
    evaluateTrade: evaluateTrade,
    evaluateAll: evaluateAll,
    analyzeBehavior: analyzeBehavior,
    computeGlobalScore: computeGlobalScore,

    // Tier & classification
    getTier: getTier,
    TIERS: TIERS,

    // Persistence
    saveEvaluation: saveEvaluation,
    loadEvaluation: loadEvaluation,

    // Configuration (read-only)
    PENALTIES: Object.freeze(PENALTIES),
    WEIGHTS: Object.freeze(WEIGHTS),
    TRADING_WINDOWS: TRADING_WINDOWS,
    ROLLING_WINDOW: ROLLING_WINDOW,
    MIN_TRADES_FOR_TIER: MIN_TRADES_FOR_TIER,
    BEHAVIOR: BEHAVIOR,

    // Utilities
    calculateRMultiple: calculateRMultiple,
    checkTradingWindow: checkTradingWindow
  };

})();
