/**
 * ALTIVOR INSTITUTE — Challenge Score Engine
 * Core scoring system for 55 Trade Cycle evaluation
 *
 * Score: 100% → PASS ≥60% / FAIL <60%
 * Hard Fails: DD≥10%, Fraud, 9-day total inactivity
 * Penalties: Invalid trades, minor violations, behavior, inactivity, overtrading, rule breaks
 * Bonuses: Perfect (valid) trades (+1%, max +5% total)
 */
(function () {
  'use strict';

  var SCORE_KEY = 'altivor_challenge_score_v1';
  var TRADES_KEY = 'altivor_verification_trades_v1';
  var DAILY_LOG_KEY = 'altivor_daily_log_v1';
  var DRAWDOWN_KEY = 'altivor_verification_drawdown_v1';
  var VIOLATION_LOG_KEY = 'altivor_violation_log_v1';

  // ═══ DATA LAYER ═══════════════════════════════════════════════════════
  function loadScoreData() {
    try {
      return JSON.parse(localStorage.getItem(SCORE_KEY)) || defaultScoreData();
    } catch (e) { return defaultScoreData(); }
  }
  function saveScoreData(data) {
    localStorage.setItem(SCORE_KEY, JSON.stringify(data));
  }
  function defaultScoreData() {
    return {
      hardFail: null,
      tradeReviews: {},
      overtradingFlags: {},
      ruleBreaks: [],
      behaviorViolations: [],
      perfectTradeCount: 0
    };
  }
  function loadTrades() {
    try { return JSON.parse(localStorage.getItem(TRADES_KEY)) || { trades: [] }; }
    catch (e) { return { trades: [] }; }
  }
  function loadDailyLog() {
    try { return JSON.parse(localStorage.getItem(DAILY_LOG_KEY)) || { entries: {} }; }
    catch (e) { return { entries: {} }; }
  }
  function loadDrawdown() {
    try { return JSON.parse(localStorage.getItem(DRAWDOWN_KEY)) || { failed: false }; }
    catch (e) { return { failed: false }; }
  }
  function loadViolations() {
    try { return JSON.parse(localStorage.getItem(VIOLATION_LOG_KEY)) || []; }
    catch (e) { return []; }
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ═══ HARD FAIL CHECKS ════════════════════════════════════════════════
  function checkHardFails() {
    var sd = loadScoreData();

    // Already failed
    if (sd.hardFail) return sd.hardFail;

    // 1. Drawdown ≥ 10%
    var dd = loadDrawdown();
    if (dd.failed) {
      sd.hardFail = { type: 'DRAWDOWN', reason: 'Drawdown exceeded 10% limit', time: new Date().toISOString() };
      saveScoreData(sd);
      return sd.hardFail;
    }

    // 2. Fraud — checked manually via setHardFail()

    // 3. Total Inactivity — 9 consecutive weekdays without log
    var consecutiveMissed = getConsecutiveMissedDays();
    if (consecutiveMissed >= 9) {
      sd.hardFail = { type: 'INACTIVITY', reason: '9 consecutive days without any log entry', time: new Date().toISOString() };
      saveScoreData(sd);
      return sd.hardFail;
    }

    return null;
  }

  function setHardFail(type, reason) {
    var sd = loadScoreData();
    sd.hardFail = { type: type, reason: reason, time: new Date().toISOString() };
    saveScoreData(sd);
  }

  function getConsecutiveMissedDays() {
    var log = loadDailyLog();
    var entries = log.entries;
    var count = 0;
    var d = new Date();

    for (var i = 0; i < 30; i++) {
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var dow = d.getDay();
      if (dow !== 0 && dow !== 6) {
        if (entries[key]) {
          break;
        }
        count++;
      }
      d.setDate(d.getDate() - 1);
    }
    return count;
  }

  // ═══ TRADE REVIEWS ═══════════════════════════════════════════════════
  // Each trade can be: 'valid', 'minor', 'invalid'
  function setTradeReview(tradeIndex, status) {
    var sd = loadScoreData();
    sd.tradeReviews[String(tradeIndex)] = status;
    if (status === 'valid') {
      // Count total perfect trades (capped at bonus limit during calc)
      var validCount = 0;
      Object.keys(sd.tradeReviews).forEach(function (k) {
        if (sd.tradeReviews[k] === 'valid') validCount++;
      });
      sd.perfectTradeCount = validCount;
    }
    saveScoreData(sd);
  }

  function getTradeReview(tradeIndex) {
    var sd = loadScoreData();
    return sd.tradeReviews[String(tradeIndex)] || null;
  }

  // ═══ OVERTRADING ═════════════════════════════════════════════════════
  function checkOvertrading(dateKey) {
    var trades = loadTrades().trades;
    var dayTrades = trades.filter(function (t) {
      if (!t.entryTime) return false;
      var tDate = t.entryTime.substring(0, 10);
      return tDate === dateKey;
    });
    return dayTrades.length > 3;
  }

  function flagOvertrading(dateKey) {
    var sd = loadScoreData();
    if (!sd.overtradingFlags[dateKey]) {
      sd.overtradingFlags[dateKey] = true;
      saveScoreData(sd);
    }
  }

  // ═══ RULE BREAKS ═════════════════════════════════════════════════════
  function addRuleBreak(description) {
    var sd = loadScoreData();
    sd.ruleBreaks.push({ description: description, time: new Date().toISOString() });
    saveScoreData(sd);
  }

  // ═══ BEHAVIOR VIOLATIONS ═════════════════════════════════════════════
  function addBehaviorViolation(description) {
    var sd = loadScoreData();
    sd.behaviorViolations.push({ description: description, time: new Date().toISOString() });
    saveScoreData(sd);
  }

  // ═══ SCORE CALCULATION ═══════════════════════════════════════════════
  function calculateScore() {
    var sd = loadScoreData();
    var trades = loadTrades().trades;
    var log = loadDailyLog();
    var entries = log.entries;

    var score = 100;
    var breakdown = {
      base: 100,
      invalidPenalty: 0,
      minorPenalty: 0,
      behaviorPenalty: 0,
      inactivityPenalty: 0,
      overtradingPenalty: 0,
      ruleBreakPenalty: 0,
      perfectBonus: 0,
      validTrades: 0,
      invalidTrades: 0,
      minorTrades: 0,
      unreviewedTrades: 0,
      behaviorViolations: sd.behaviorViolations.length,
      overtradingDays: Object.keys(sd.overtradingFlags).length,
      ruleBreaks: sd.ruleBreaks.length,
      inactiveDays: 0,
      consecutiveInactive: getConsecutiveMissedDays(),
      totalLoggedDays: 0,
      totalTradeDays: 0,
      totalNoTradeDays: 0,
      totalTrades: trades.length,
      hardFail: sd.hardFail,
      passed: false,
      failed: false,
      score: 100,
      alerts: []
    };

    // Count trade statuses
    var invalidCount = 0;
    var minorCount = 0;
    var validCount = 0;
    var unreviewedCount = 0;
    trades.forEach(function (t, i) {
      var review = sd.tradeReviews[String(i)];
      if (review === 'invalid') invalidCount++;
      else if (review === 'minor') minorCount++;
      else if (review === 'valid') validCount++;
      else unreviewedCount++;
    });
    breakdown.invalidTrades = invalidCount;
    breakdown.minorTrades = minorCount;
    breakdown.validTrades = validCount;
    breakdown.unreviewedTrades = unreviewedCount;

    // ── INVALID TRADE PENALTY ──
    // 1x→-6%, 2x→-8%, 3x→-10%, 4x+→-12%
    var invalidPenalty = 0;
    for (var inv = 1; inv <= invalidCount; inv++) {
      if (inv === 1) invalidPenalty += 6;
      else if (inv === 2) invalidPenalty += 8;
      else if (inv === 3) invalidPenalty += 10;
      else invalidPenalty += 12;
    }
    breakdown.invalidPenalty = invalidPenalty;
    score -= invalidPenalty;

    // ── MINOR VIOLATION PENALTY ──
    // 1-2→-2% each, 3-5→-3% each, 6+→-4% each
    var minorPenalty = 0;
    for (var mn = 1; mn <= minorCount; mn++) {
      if (mn <= 2) minorPenalty += 2;
      else if (mn <= 5) minorPenalty += 3;
      else minorPenalty += 4;
    }
    breakdown.minorPenalty = minorPenalty;
    score -= minorPenalty;

    // ── BEHAVIOR VIOLATION PENALTY ──
    // 1x→-4%, 2x→-6%, 3x+→-8%
    var behaviorCount = sd.behaviorViolations.length;
    var behaviorPenalty = 0;
    for (var bv = 1; bv <= behaviorCount; bv++) {
      if (bv === 1) behaviorPenalty += 4;
      else if (bv === 2) behaviorPenalty += 6;
      else behaviorPenalty += 8;
    }
    breakdown.behaviorPenalty = behaviorPenalty;
    score -= behaviorPenalty;

    // ── INACTIVITY PENALTY ──
    // Count missed weekdays (no entry at all)
    var missedDays = getMissedDaysArray();
    var inactivityPenalty = 0;
    // Consecutive missed days get escalating penalties
    // Day 1-2: 0%, Day 3: -3%, Day 4: -4%, ..., Day 8: -8%, Day 9: FAIL
    var consecutiveRuns = getConsecutiveInactiveRuns(entries);
    consecutiveRuns.forEach(function (runLength) {
      for (var day = 1; day <= runLength; day++) {
        if (day <= 2) continue; // 0% for days 1-2
        if (day >= 9) continue; // hard fail handled separately
        inactivityPenalty += day; // day 3→-3%, day 4→-4%, etc.
      }
    });
    breakdown.inactivityPenalty = inactivityPenalty;
    breakdown.inactiveDays = missedDays.length;
    score -= inactivityPenalty;

    // ── OVERTRADING PENALTY ──
    // 1x→0%(warning), 2x→-5%, 3x+→-10%
    var otCount = Object.keys(sd.overtradingFlags).length;
    var otPenalty = 0;
    for (var ot = 1; ot <= otCount; ot++) {
      if (ot === 1) otPenalty += 0; // warning
      else if (ot === 2) otPenalty += 5;
      else otPenalty += 10;
    }
    breakdown.overtradingPenalty = otPenalty;
    score -= otPenalty;

    // ── RULE BREAK PENALTY ──
    // 1x→0%(warning), 2x→-5%, 3x→-10%, 4x+→-15%
    var rbCount = sd.ruleBreaks.length;
    var rbPenalty = 0;
    for (var rb = 1; rb <= rbCount; rb++) {
      if (rb === 1) rbPenalty += 0;
      else if (rb === 2) rbPenalty += 5;
      else if (rb === 3) rbPenalty += 10;
      else rbPenalty += 15;
    }
    breakdown.ruleBreakPenalty = rbPenalty;
    score -= rbPenalty;

    // ── PERFECT TRADE BONUS ──
    // +1% per valid trade, max +5%
    var perfectBonus = Math.min(5, validCount);
    breakdown.perfectBonus = perfectBonus;
    score += perfectBonus;

    // Clamp
    score = Math.max(0, Math.min(100, Math.round(score)));
    breakdown.score = score;

    // Day counts
    var entryKeys = Object.keys(entries);
    breakdown.totalLoggedDays = entryKeys.length;
    breakdown.totalTradeDays = entryKeys.filter(function (k) { return entries[k].type === 'trade'; }).length;
    breakdown.totalNoTradeDays = entryKeys.filter(function (k) { return entries[k].type === 'no_trade'; }).length;

    // ── PASS / FAIL ──
    var hardFail = checkHardFails();
    if (hardFail) {
      breakdown.hardFail = hardFail;
      breakdown.failed = true;
      breakdown.score = 0;
    } else if (score < 60) {
      breakdown.failed = true;
    } else {
      breakdown.passed = true;
    }

    // ── END-OF-CHALLENGE PROGRESS ALERTS ──
    if (breakdown.totalLoggedDays < 10) {
      breakdown.alerts.push({ type: 'warning', text: 'Less than 10 logged days — aim for consistent daily activity.' });
    }
    if (trades.length < 55 && trades.length > 0) {
      var remaining = 55 - trades.length;
      breakdown.alerts.push({ type: 'info', text: remaining + ' trades remaining in your 55 Trade Cycle.' });
    }
    if (validCount < Math.ceil(trades.length * 0.5) && trades.length >= 10) {
      breakdown.alerts.push({ type: 'warning', text: 'Less than 50% of your trades are marked as Valid — review your trade quality.' });
    }

    // Dynamic alerts
    if (score >= 60 && score < 70) {
      breakdown.alerts.push({ type: 'danger', text: 'Your score is close to the 60% passing threshold. Avoid further violations.' });
    }
    if (invalidCount >= 2) {
      breakdown.alerts.push({ type: 'danger', text: invalidCount + ' invalid trades detected — each additional costs ' + (invalidCount >= 3 ? '12%' : '10%') + '.' });
    }
    var consInactive = getConsecutiveMissedDays();
    if (consInactive >= 2 && consInactive < 9) {
      breakdown.alerts.push({ type: 'warning', text: 'You have ' + consInactive + ' consecutive days without activity.' + (consInactive >= 5 ? ' Risk of Challenge invalidation at 9.' : '') });
    }
    if (behaviorCount >= 2) {
      breakdown.alerts.push({ type: 'warning', text: 'Repeated behavior violations detected — penalties escalating.' });
    }
    if (otCount >= 1) {
      breakdown.alerts.push({ type: otCount === 1 ? 'info' : 'warning', text: 'Overtrading detected on ' + otCount + ' day(s).' + (otCount === 1 ? ' This is a warning.' : ' Penalty applied.') });
    }

    return breakdown;
  }

  // ═══ INACTIVITY HELPERS ══════════════════════════════════════════════
  function getMissedDaysArray() {
    var log = loadDailyLog();
    var entries = log.entries;
    var keys = Object.keys(entries).sort();
    if (keys.length === 0) return [];

    var missed = [];
    var start = new Date(keys[0]);
    var end = new Date(todayKey());
    var current = new Date(start);

    while (current <= end) {
      var key = current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0') + '-' + String(current.getDate()).padStart(2, '0');
      var dow = current.getDay();
      if (dow !== 0 && dow !== 6 && !entries[key]) {
        missed.push(key);
      }
      current.setDate(current.getDate() + 1);
    }
    return missed;
  }

  function getConsecutiveInactiveRuns(entries) {
    var keys = Object.keys(entries).sort();
    if (keys.length === 0) return [];

    var runs = [];
    var start = new Date(keys[0]);
    var end = new Date(todayKey());
    var current = new Date(start);
    var currentRun = 0;

    while (current <= end) {
      var key = current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0') + '-' + String(current.getDate()).padStart(2, '0');
      var dow = current.getDay();
      if (dow !== 0 && dow !== 6) {
        if (!entries[key]) {
          currentRun++;
        } else {
          if (currentRun > 0) {
            runs.push(currentRun);
            currentRun = 0;
          }
        }
      }
      current.setDate(current.getDate() + 1);
    }
    if (currentRun > 0) runs.push(currentRun);
    return runs;
  }

  // ═══ AUTO-CHECK OVERTRADING ON TRADE SUBMIT ══════════════════════════
  function onTradeLogged() {
    var trades = loadTrades().trades;
    if (trades.length === 0) return;

    var lastTrade = trades[trades.length - 1];
    if (lastTrade.entryTime) {
      var dateKey = lastTrade.entryTime.substring(0, 10);
      if (checkOvertrading(dateKey)) {
        flagOvertrading(dateKey);
      }
    }
  }

  // ═══ UI RENDERERS ════════════════════════════════════════════════════
  function renderScoreBar(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var b = calculateScore();
    var scoreColor = b.hardFail ? 'rgba(239,68,68,0.9)' : b.score >= 70 ? 'rgba(34,197,94,0.9)' : b.score >= 60 ? 'rgba(234,179,8,0.9)' : 'rgba(239,68,68,0.9)';
    var statusLabel = b.hardFail ? 'FAILED' : b.score >= 60 ? 'PASSING' : 'FAILING';
    var statusClass = b.hardFail ? 'cs-status--fail' : b.score >= 60 ? 'cs-status--pass' : 'cs-status--fail';

    el.innerHTML =
      '<div class="cs-bar">' +
        '<div class="cs-bar-header">' +
          '<div class="cs-bar-left">' +
            '<span class="cs-bar-label">CHALLENGE SCORE</span>' +
            '<span class="cs-bar-score" style="color:' + scoreColor + ';">' + (b.hardFail ? '0' : b.score) + '%</span>' +
          '</div>' +
          '<div class="cs-bar-right">' +
            '<span class="cs-bar-status ' + statusClass + '">' + statusLabel + '</span>' +
            '<span class="cs-bar-threshold">Pass: ≥60%</span>' +
          '</div>' +
        '</div>' +
        '<div class="cs-bar-track">' +
          '<div class="cs-bar-threshold-marker"></div>' +
          '<div class="cs-bar-fill" style="width:' + Math.min(100, b.hardFail ? 0 : b.score) + '%;background:' + scoreColor + ';"></div>' +
        '</div>' +
      '</div>';

    if (b.hardFail) {
      el.innerHTML += '<div class="cs-hard-fail">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
        '<div><strong>CHALLENGE FAILED</strong><br><span>' + b.hardFail.reason + '</span></div>' +
      '</div>';
    }
  }

  function renderBreakdown(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var b = calculateScore();

    var html = '<div class="cs-breakdown">';

    // Score summary row
    html += '<div class="cs-summary-grid">' +
      '<div class="cs-summary-item"><span class="cs-summary-val" style="color:rgba(34,197,94,0.9);">' + b.validTrades + '</span><span class="cs-summary-lbl">Valid</span></div>' +
      '<div class="cs-summary-item"><span class="cs-summary-val" style="color:rgba(234,179,8,0.9);">' + b.minorTrades + '</span><span class="cs-summary-lbl">Minor</span></div>' +
      '<div class="cs-summary-item"><span class="cs-summary-val" style="color:rgba(239,68,68,0.9);">' + b.invalidTrades + '</span><span class="cs-summary-lbl">Invalid</span></div>' +
      '<div class="cs-summary-item"><span class="cs-summary-val" style="color:rgba(168,85,247,0.9);">' + b.behaviorViolations + '</span><span class="cs-summary-lbl">Behavior</span></div>' +
      '<div class="cs-summary-item"><span class="cs-summary-val" style="color:rgba(96,165,250,0.9);">' + b.inactiveDays + '</span><span class="cs-summary-lbl">Inactive</span></div>' +
      '<div class="cs-summary-item"><span class="cs-summary-val">' + b.totalTrades + '</span><span class="cs-summary-lbl">Total Trades</span></div>' +
    '</div>';

    // Penalty/bonus breakdown
    html += '<div class="cs-penalty-grid">';
    html += csRow('Base Score', '+100%', 'neutral');
    if (b.invalidPenalty > 0) html += csRow('Invalid Trades (' + b.invalidTrades + ')', '-' + b.invalidPenalty + '%', 'negative');
    if (b.minorPenalty > 0) html += csRow('Minor Issues (' + b.minorTrades + ')', '-' + b.minorPenalty + '%', 'negative');
    if (b.behaviorPenalty > 0) html += csRow('Behavior Violations (' + b.behaviorViolations + ')', '-' + b.behaviorPenalty + '%', 'negative');
    if (b.inactivityPenalty > 0) html += csRow('Inactivity Penalty', '-' + b.inactivityPenalty + '%', 'negative');
    if (b.overtradingPenalty > 0) html += csRow('Overtrading (' + b.overtradingDays + ' days)', '-' + b.overtradingPenalty + '%', 'negative');
    if (b.ruleBreakPenalty > 0) html += csRow('Rule Breaks (' + b.ruleBreaks + ')', '-' + b.ruleBreakPenalty + '%', 'negative');
    if (b.perfectBonus > 0) html += csRow('Perfect Trades (' + Math.min(5, b.validTrades) + ')', '+' + b.perfectBonus + '%', 'positive');
    html += csRow('Final Score', b.score + '%', b.score >= 60 ? 'positive' : 'negative', true);
    html += '</div>';

    html += '</div>';
    el.innerHTML = html;
  }

  function csRow(label, value, type, isTotal) {
    var cls = isTotal ? ' cs-row--total' : '';
    var valCls = type === 'positive' ? 'cs-val--positive' : type === 'negative' ? 'cs-val--negative' : 'cs-val--neutral';
    return '<div class="cs-row' + cls + '"><span class="cs-row-label">' + label + '</span><span class="cs-row-value ' + valCls + '">' + value + '</span></div>';
  }

  function renderAlerts(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var b = calculateScore();
    if (b.alerts.length === 0) { el.innerHTML = ''; return; }

    var html = '<div class="cs-alerts">';
    b.alerts.forEach(function (a) {
      var icon = a.type === 'danger'
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        : a.type === 'warning'
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
      html += '<div class="cs-alert cs-alert--' + a.type + '">' + icon + '<span>' + a.text + '</span></div>';
    });
    html += '</div>';
    el.innerHTML = html;
  }

  // ═══ TRADE INSIGHTS (unique to 55 Trade Cycle page) ═════════════════
  function renderTradeInsights(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;

    var b = calculateScore();
    var trades = loadTrades().trades;
    var total = 55;
    var count = trades.length;

    // Calculate pace
    var log = loadDailyLog();
    var loggedDays = Object.keys(log.entries || {}).length;
    var activeDays = Math.max(1, loggedDays);
    var pace = (count / activeDays).toFixed(1);
    var daysNeeded = count >= total ? 0 : Math.ceil((total - count) / 2);
    var projDate = new Date();
    projDate.setDate(projDate.getDate() + daysNeeded);
    var projStr = daysNeeded > 0 ? projDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Complete';

    // Quality counts
    var valid = b.validTrades;
    var minor = b.minorTrades;
    var invalid = b.invalidTrades;
    var pending = count - valid - minor - invalid;
    var validPct = count > 0 ? Math.round(valid / count * 100) : 0;
    var minorPct = count > 0 ? Math.round(minor / count * 100) : 0;
    var invalidPct = count > 0 ? Math.round(invalid / count * 100) : 0;
    var pendingPct = count > 0 ? Math.round(pending / count * 100) : 0;

    // Pace status
    var paceVal = parseFloat(pace);
    var paceColor = paceVal >= 2 ? 'rgba(34,197,94,0.9)' : paceVal >= 1 ? 'rgba(234,179,8,0.9)' : 'rgba(239,68,68,0.9)';
    var paceLabel = paceVal >= 2 ? 'On Track' : paceVal >= 1 ? 'Slightly Behind' : 'Behind Schedule';

    var html = '<div class="cs-insights">';

    // Header
    html += '<div class="cs-insights-header">';
    html += '<span class="cs-insights-title">TRADE QUALITY & PACE</span>';
    html += '<span class="cs-insights-rec">Recommended: 2 trades / day</span>';
    html += '</div>';

    // Quality distribution bar
    html += '<div class="cs-quality-section">';
    html += '<div class="cs-quality-label">Quality Distribution</div>';
    html += '<div class="cs-quality-bar">';
    if (count > 0) {
      if (validPct > 0) html += '<div class="cs-quality-seg cs-quality-seg--valid" style="width:' + validPct + '%;" title="Valid: ' + valid + '"></div>';
      if (minorPct > 0) html += '<div class="cs-quality-seg cs-quality-seg--minor" style="width:' + minorPct + '%;" title="Minor: ' + minor + '"></div>';
      if (invalidPct > 0) html += '<div class="cs-quality-seg cs-quality-seg--invalid" style="width:' + invalidPct + '%;" title="Invalid: ' + invalid + '"></div>';
      if (pendingPct > 0) html += '<div class="cs-quality-seg cs-quality-seg--pending" style="width:' + pendingPct + '%;" title="Pending: ' + pending + '"></div>';
    } else {
      html += '<div class="cs-quality-seg cs-quality-seg--empty" style="width:100%;"></div>';
    }
    html += '</div>';
    html += '<div class="cs-quality-legend">';
    html += '<span class="cs-legend-item"><span class="cs-legend-dot cs-legend-dot--valid"></span>' + valid + ' Valid</span>';
    html += '<span class="cs-legend-item"><span class="cs-legend-dot cs-legend-dot--minor"></span>' + minor + ' Minor</span>';
    html += '<span class="cs-legend-item"><span class="cs-legend-dot cs-legend-dot--invalid"></span>' + invalid + ' Invalid</span>';
    html += '<span class="cs-legend-item"><span class="cs-legend-dot cs-legend-dot--pending"></span>' + pending + ' Pending</span>';
    html += '</div>';
    html += '</div>';

    // Stats grid
    html += '<div class="cs-insights-grid">';
    html += '<div class="cs-insights-stat">';
    html += '<span class="cs-insights-stat-val" style="color:' + paceColor + ';">' + pace + '</span>';
    html += '<span class="cs-insights-stat-lbl">Trades / Day</span>';
    html += '</div>';
    html += '<div class="cs-insights-stat">';
    html += '<span class="cs-insights-stat-val">' + activeDays + '</span>';
    html += '<span class="cs-insights-stat-lbl">Active Days</span>';
    html += '</div>';
    html += '<div class="cs-insights-stat">';
    html += '<span class="cs-insights-stat-val">' + projStr + '</span>';
    html += '<span class="cs-insights-stat-lbl">Est. Completion</span>';
    html += '</div>';
    html += '<div class="cs-insights-stat">';
    html += '<span class="cs-insights-stat-val" style="color:' + paceColor + ';">' + paceLabel + '</span>';
    html += '<span class="cs-insights-stat-lbl">Pace Status</span>';
    html += '</div>';
    html += '</div>';

    // Tip
    html += '<div class="cs-insights-tip">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    html += '<span>Complete 55 trades with quality setups and achieve minimum +6% profit over 2 months to pass the challenge.</span>';
    html += '</div>';

    html += '</div>';
    el.innerHTML = html;
  }

  // ═══ TRADE REVIEW INJECTION INTO HISTORY ════════════════════════════
  function injectReviewControls() {
    var historyList = document.getElementById('tradesHistoryList');
    if (!historyList) return;

    var items = historyList.querySelectorAll('.verif-history-item');
    items.forEach(function (item, i) {
      // Skip if already has review controls
      if (item.querySelector('.cs-review-actions')) return;

      // Add data-trade-index
      item.setAttribute('data-trade-index', i);

      // Add badge to header area (first line)
      var numEl = item.querySelector('.verif-history-num');
      var review = getTradeReview(i);
      var badge = document.createElement('span');
      updateBadge(badge, review);
      if (numEl) {
        numEl.parentNode.insertBefore(badge, numEl.nextSibling);
      } else {
        item.insertBefore(badge, item.firstChild);
      }

      // Add review buttons
      var actions = document.createElement('div');
      actions.className = 'cs-review-actions';
      actions.innerHTML =
        '<button class="cs-review-btn cs-review-btn--valid' + (review === 'valid' ? ' active' : '') + '" data-status="valid" data-idx="' + i + '">✓ Valid</button>' +
        '<button class="cs-review-btn cs-review-btn--minor' + (review === 'minor' ? ' active' : '') + '" data-status="minor" data-idx="' + i + '">⚠ Minor</button>' +
        '<button class="cs-review-btn cs-review-btn--invalid' + (review === 'invalid' ? ' active' : '') + '" data-status="invalid" data-idx="' + i + '">✕ Invalid</button>';

      actions.addEventListener('click', function (e) {
        var btn = e.target.closest('.cs-review-btn');
        if (!btn) return;
        var status = btn.getAttribute('data-status');
        var idx = parseInt(btn.getAttribute('data-idx'));
        setTradeReview(idx, status);
        // Update buttons in this group
        var btns = actions.querySelectorAll('.cs-review-btn');
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        // Update badge
        updateBadge(badge, status);
        // Re-render score
        renderScoreBar('csScoreBar');
        renderBreakdown('csBreakdown');
        renderAlerts('csAlerts');
        renderTradeInsights('csTradeInsights');
      });

      item.appendChild(actions);
    });
  }

  function updateBadge(badge, review) {
    if (review === 'valid') {
      badge.className = 'cs-trade-badge cs-badge--valid';
      badge.textContent = 'VALID';
    } else if (review === 'minor') {
      badge.className = 'cs-trade-badge cs-badge--minor';
      badge.textContent = 'MINOR';
    } else if (review === 'invalid') {
      badge.className = 'cs-trade-badge cs-badge--invalid';
      badge.textContent = 'INVALID';
    } else {
      badge.className = 'cs-trade-badge cs-badge--unreviewed';
      badge.textContent = 'PENDING';
    }
  }

  // ═══ MUTATION OBSERVER FOR TRADE HISTORY ════════════════════════════
  var _lastTradeCount = 0;
  function observeTradeHistory() {
    var historyList = document.getElementById('tradesHistoryList');
    if (!historyList) return;

    var observer = new MutationObserver(function () {
      injectReviewControls();
      // Check if a new trade was added
      var trades = loadTrades().trades;
      if (trades.length > _lastTradeCount && _lastTradeCount > 0) {
        onTradeLogged();
        renderScoreBar('csScoreBar');
        renderBreakdown('csBreakdown');
        renderAlerts('csAlerts');
        renderTradeInsights('csTradeInsights');
      }
      _lastTradeCount = trades.length;
    });

    observer.observe(historyList, { childList: true, subtree: true });
    _lastTradeCount = loadTrades().trades.length;
  }

  // ═══ RENDER ALL ══════════════════════════════════════════════════════
  function renderAll() {
    renderScoreBar('csScoreBar');
    renderBreakdown('csBreakdown');
    renderAlerts('csAlerts');
    renderTradeInsights('csTradeInsights');
    injectReviewControls();
  }

  // ═══ INIT ════════════════════════════════════════════════════════════
  function init() {
    renderAll();
    observeTradeHistory();
  }

  // ═══ PUBLIC API ══════════════════════════════════════════════════════
  window.ChallengeScore = {
    init: init,
    renderAll: renderAll,
    calculateScore: calculateScore,
    setTradeReview: setTradeReview,
    getTradeReview: getTradeReview,
    addRuleBreak: addRuleBreak,
    addBehaviorViolation: addBehaviorViolation,
    flagOvertrading: flagOvertrading,
    onTradeLogged: onTradeLogged,
    setHardFail: setHardFail,
    checkHardFails: checkHardFails,
    renderScoreBar: renderScoreBar,
    renderBreakdown: renderBreakdown,
    renderAlerts: renderAlerts,
    renderTradeInsights: renderTradeInsights,
    injectReviewControls: injectReviewControls
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
