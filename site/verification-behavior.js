/**
 * ALTIVOR INSTITUTE — Behavioral Control System
 * Integrates with 55 Trade Cycle and Challenge Status
 * Tracks daily activity, discipline score, streaks, and system messages
 */
(function () {
  'use strict';

  var DAILY_LOG_KEY = 'altivor_daily_log_v1';
  var TRADES_KEY = 'altivor_verification_trades_v1';
  var CHALLENGE_STATE_KEY = 'altivor_challenge_state_v1';
  var VIOLATION_LOG_KEY = 'altivor_violation_log_v1';

  // ═══ HELPERS ══════════════════════════════════════════════════════════
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function yesterdayKey() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function formatDate(dateStr) {
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ═══ DATA LAYER ═══════════════════════════════════════════════════════
  function loadDailyLog() {
    try { return JSON.parse(localStorage.getItem(DAILY_LOG_KEY)) || { entries: {} }; }
    catch (e) { return { entries: {} }; }
  }
  function saveDailyLog(log) {
    localStorage.setItem(DAILY_LOG_KEY, JSON.stringify(log));
  }
  function loadTrades() {
    try { return JSON.parse(localStorage.getItem(TRADES_KEY)) || { trades: [] }; }
    catch (e) { return { trades: [] }; }
  }
  function loadViolations() {
    try { return JSON.parse(localStorage.getItem(VIOLATION_LOG_KEY)) || []; }
    catch (e) { return []; }
  }

  function hasTradedToday() {
    var log = loadDailyLog();
    return !!log.entries[todayKey()];
  }
  function getTodayEntry() {
    var log = loadDailyLog();
    return log.entries[todayKey()] || null;
  }

  function logTradeDay() {
    var log = loadDailyLog();
    log.entries[todayKey()] = { type: 'trade', time: new Date().toISOString() };
    saveDailyLog(log);
  }
  function logNoTradeDay() {
    var log = loadDailyLog();
    log.entries[todayKey()] = { type: 'no_trade', time: new Date().toISOString(), reason: 'No valid setup' };
    saveDailyLog(log);
  }

  // ═══ DISCIPLINE CONSISTENCY SCORE ═════════════════════════════════════
  function calculateDiscipline() {
    var log = loadDailyLog();
    var trades = loadTrades().trades || [];
    var violations = loadViolations();
    var entries = log.entries;
    var keys = Object.keys(entries).sort();

    var totalDays = keys.length;
    var tradeDays = keys.filter(function (k) { return entries[k].type === 'trade'; }).length;
    var noTradeDays = keys.filter(function (k) { return entries[k].type === 'no_trade'; }).length;
    var violationCount = violations.filter(function (v) { return v.severity === 'BREACH' || v.severity === 'INVALID'; }).length;

    // Count missed days (gaps in the log since first entry)
    var missedDays = 0;
    if (keys.length > 0) {
      var start = new Date(keys[0]);
      var end = new Date(todayKey());
      var current = new Date(start);
      while (current <= end) {
        var key = current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0') + '-' + String(current.getDate()).padStart(2, '0');
        // Skip weekends (Sat=6, Sun=0)
        var dow = current.getDay();
        if (dow !== 0 && dow !== 6 && !entries[key]) {
          missedDays++;
        }
        current.setDate(current.getDate() + 1);
      }
    }

    // Calculate streak
    var streak = calculateStreak(entries);

    // Score calculation (0-100)
    var score = 100;
    // Penalty for missed days: -5 per missed day
    score -= missedDays * 5;
    // Penalty for violations: -8 per violation
    score -= violationCount * 8;
    // Bonus for consistency: +1 per consecutive active day (max 15)
    score += Math.min(15, streak.current * 1.5);
    // Bonus for no-trade discipline: +0.5 per declared no-trade day
    score += Math.min(5, noTradeDays * 0.5);

    score = Math.round(Math.max(0, Math.min(100, score)));

    return {
      score: score,
      totalDays: totalDays,
      tradeDays: tradeDays,
      noTradeDays: noTradeDays,
      missedDays: missedDays,
      violations: violationCount,
      streak: streak,
      totalTrades: trades.length
    };
  }

  function calculateStreak(entries) {
    var keys = Object.keys(entries).sort().reverse();
    var current = 0;
    var best = 0;
    var today = todayKey();
    var d = new Date(today);

    // Count backwards from today
    for (var i = 0; i < 365; i++) {
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var dow = d.getDay();
      // Skip weekends
      if (dow === 0 || dow === 6) {
        d.setDate(d.getDate() - 1);
        continue;
      }
      if (entries[key]) {
        current++;
      } else {
        break;
      }
      d.setDate(d.getDate() - 1);
    }

    // Calculate best streak from all entries
    var allKeys = Object.keys(entries).sort();
    var tempStreak = 0;
    var prevDate = null;
    allKeys.forEach(function (key) {
      if (prevDate) {
        var prev = new Date(prevDate);
        var curr = new Date(key);
        var diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        // Account for weekends
        var gap = 0;
        var check = new Date(prev);
        check.setDate(check.getDate() + 1);
        while (check < curr) {
          var cdow = check.getDay();
          if (cdow !== 0 && cdow !== 6) gap++;
          check.setDate(check.getDate() + 1);
        }
        if (gap === 0) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }
      if (tempStreak > best) best = tempStreak;
      prevDate = key;
    });

    return { current: current, best: Math.max(best, current) };
  }

  // ═══ SYSTEM MESSAGES ══════════════════════════════════════════════════
  function generateSystemMessages() {
    var messages = [];
    var discipline = calculateDiscipline();
    var trades = loadTrades().trades || [];
    var entry = getTodayEntry();
    var log = loadDailyLog();
    var yKey = yesterdayKey();
    var yesterdayEntry = log.entries[yKey] || null;

    // Incomplete previous day
    if (!yesterdayEntry) {
      var yd = new Date(yKey);
      var dow = yd.getDay();
      if (dow !== 0 && dow !== 6) {
        messages.push({
          type: 'warning',
          title: 'Incomplete Day Detected',
          text: 'Yesterday (' + formatDate(yKey) + ') has no recorded activity. Unlogged days reduce your Discipline Consistency Score.',
          time: 'System audit'
        });
      }
    }

    // Missed days alert
    if (discipline.missedDays > 0) {
      messages.push({
        type: discipline.missedDays >= 3 ? 'danger' : 'warning',
        title: discipline.missedDays >= 3 ? 'Discipline Breakdown Observed' : 'Gaps Detected in Activity Log',
        text: discipline.missedDays + ' weekday(s) without recorded activity since cycle start. Consistent daily logging is required for full qualification assessment.',
        time: 'Behavioral audit'
      });
    }

    // Good discipline
    if (discipline.score >= 85 && discipline.totalDays >= 5) {
      messages.push({
        type: 'positive',
        title: 'Good Discipline Maintained',
        text: 'Your Discipline Consistency Score is ' + discipline.score + '/100. Consistent logging behavior detected across ' + discipline.streak.current + ' consecutive active day(s).',
        time: 'System evaluation'
      });
    }

    // Streak milestone
    if (discipline.streak.current >= 5 && discipline.streak.current % 5 === 0) {
      messages.push({
        type: 'positive',
        title: 'Streak Milestone Reached',
        text: discipline.streak.current + '-day active streak. This level of consistency directly impacts your qualification profile.',
        time: 'Progress tracking'
      });
    }

    // Risk behavior detection (many trades in short time)
    if (trades.length >= 3) {
      var last3 = trades.slice(-3);
      var recentTimes = last3.map(function (t) { return new Date(t.entryTime || t.date).getTime(); }).filter(function (t) { return !isNaN(t); });
      if (recentTimes.length >= 3) {
        var span = recentTimes[recentTimes.length - 1] - recentTimes[0];
        if (span < 3600000) {
          messages.push({
            type: 'danger',
            title: 'Risk Behavior Detected',
            text: 'Multiple trades executed within a short time window. This pattern is associated with impulsive or revenge trading behavior.',
            time: 'Pattern analysis'
          });
        }
      }
    }

    // Losing streak detection
    if (trades.length >= 3) {
      var lastTrades = trades.slice(-3);
      var allLosing = lastTrades.every(function (t) { return parseFloat(t.pl || t.pnl || 0) < 0; });
      if (allLosing) {
        messages.push({
          type: 'warning',
          title: 'Consecutive Loss Pattern',
          text: 'Your last 3 trades resulted in losses. Consider pausing to reassess your execution before continuing.',
          time: 'Performance monitor'
        });
      }
    }

    // Selective logging warning
    if (discipline.totalDays >= 10 && discipline.noTradeDays === 0 && trades.length > 0) {
      var tradeRatio = trades.length / discipline.totalDays;
      if (tradeRatio > 2.5) {
        messages.push({
          type: 'warning',
          title: 'Selective Logging Suspected',
          text: 'High trade volume with zero declared no-trade days. The system expects honest daily declarations to maintain evaluation integrity.',
          time: 'Integrity check'
        });
      }
    }

    // Low discipline score
    if (discipline.score < 50 && discipline.totalDays >= 5) {
      messages.push({
        type: 'danger',
        title: 'Discipline Score Critical',
        text: 'Your Discipline Consistency Score has dropped to ' + discipline.score + '/100. Immediate improvement in daily logging behavior is required to maintain qualification eligibility.',
        time: 'Urgent assessment'
      });
    } else if (discipline.score < 70 && discipline.score >= 50 && discipline.totalDays >= 5) {
      messages.push({
        type: 'warning',
        title: 'Discipline Score Declining',
        text: 'Your Discipline Consistency Score is ' + discipline.score + '/100. Improvement needed to meet qualification standards.',
        time: 'System evaluation'
      });
    }

    // No-trade day confirmation
    if (entry && entry.type === 'no_trade') {
      messages.push({
        type: 'info',
        title: 'No-Trade Day Recorded',
        text: 'Today has been marked as a no-trade day. Disciplined inaction is recognized and does not negatively impact your score.',
        time: formatDate(todayKey())
      });
    }

    // Progress milestone
    if (trades.length > 0 && trades.length % 10 === 0 && trades.length <= 55) {
      messages.push({
        type: 'positive',
        title: 'Cycle Progress: ' + trades.length + ' / 55',
        text: 'You have completed ' + Math.round((trades.length / 55) * 100) + '% of your trade cycle. ' + (55 - trades.length) + ' trades remaining.',
        time: 'Cycle tracker'
      });
    }

    return messages;
  }

  // ═══ LIVE STATUS BAR DATA ═════════════════════════════════════════════
  function getLiveStatusData() {
    var discipline = calculateDiscipline();
    var trades = loadTrades().trades || [];
    var entry = getTodayEntry();

    var todayStatus = 'Not Completed';
    var todayClass = 'vt-val-red';
    var todayDot = 'vt-dot-gray';
    if (entry) {
      if (entry.type === 'trade') {
        todayStatus = 'Completed';
        todayClass = 'vt-val-green';
        todayDot = 'vt-dot-green';
      } else {
        todayStatus = 'No Trade';
        todayClass = 'vt-val-yellow';
        todayDot = 'vt-dot-yellow';
      }
    }

    var statusLabel = 'Clean';
    var statusDot = 'vt-dot-green';
    var statusClass = 'vt-val-green';
    if (discipline.score < 50) {
      statusLabel = 'Compromised';
      statusDot = 'vt-dot-red';
      statusClass = 'vt-val-red';
    } else if (discipline.score < 70) {
      statusLabel = 'At Risk';
      statusDot = 'vt-dot-yellow';
      statusClass = 'vt-val-yellow';
    }

    return {
      today: { label: todayStatus, css: todayClass, dot: todayDot },
      cycle: { count: trades.length, total: 55 },
      discipline: { score: discipline.score, css: discipline.score >= 70 ? 'vt-val-green' : discipline.score >= 50 ? 'vt-val-yellow' : 'vt-val-red' },
      status: { label: statusLabel, css: statusClass, dot: statusDot }
    };
  }

  // ═══ UI RENDERING ═════════════════════════════════════════════════════

  function renderLiveBar() {
    var el = document.getElementById('vtLiveBar');
    if (!el) return;
    var data = getLiveStatusData();
    el.innerHTML =
      '<div class="vt-live-bar-item">' +
        '<span class="vt-live-bar-label">Today</span>' +
        '<span class="vt-live-bar-value ' + data.today.css + '"><span class="vt-live-bar-dot ' + data.today.dot + '"></span>' + data.today.label + '</span>' +
      '</div>' +
      '<div class="vt-live-bar-item">' +
        '<span class="vt-live-bar-label">Cycle</span>' +
        '<span class="vt-live-bar-value">' + data.cycle.count + ' / ' + data.cycle.total + '</span>' +
      '</div>' +
      '<div class="vt-live-bar-item">' +
        '<span class="vt-live-bar-label">Discipline</span>' +
        '<span class="vt-live-bar-value ' + data.discipline.css + '">' + data.discipline.score + '%</span>' +
      '</div>' +
      '<div class="vt-live-bar-item">' +
        '<span class="vt-live-bar-label">Status</span>' +
        '<span class="vt-live-bar-value ' + data.status.css + '"><span class="vt-live-bar-dot ' + data.status.dot + '"></span>' + data.status.label + '</span>' +
      '</div>';
  }

  function renderDisciplineSection() {
    var el = document.getElementById('vtDisciplineSection');
    if (!el) return;
    var d = calculateDiscipline();
    var barClass = d.score < 50 ? ' fill-warning' : '';
    el.innerHTML =
      '<div class="vt-discipline-header">' +
        '<span class="vt-discipline-title">Discipline Consistency Score</span>' +
        '<span class="vt-discipline-score-badge ' + (d.score >= 70 ? 'vt-val-green' : d.score >= 50 ? 'vt-val-yellow' : 'vt-val-red') + '">' + d.score + '<small>/ 100</small></span>' +
      '</div>' +
      '<div class="vt-discipline-bar"><div class="vt-discipline-bar-fill' + barClass + '" style="width:' + d.score + '%"></div></div>' +
      '<div class="vt-discipline-grid">' +
        '<div class="vt-discipline-metric"><span class="vt-discipline-metric-val">' + d.streak.current + '</span><span class="vt-discipline-metric-label">Active Streak</span></div>' +
        '<div class="vt-discipline-metric"><span class="vt-discipline-metric-val">' + d.missedDays + '</span><span class="vt-discipline-metric-label">Missed Days</span></div>' +
        '<div class="vt-discipline-metric"><span class="vt-discipline-metric-val">' + d.noTradeDays + '</span><span class="vt-discipline-metric-label">No-Trade Days</span></div>' +
        '<div class="vt-discipline-metric"><span class="vt-discipline-metric-val">' + d.violations + '</span><span class="vt-discipline-metric-label">Violations</span></div>' +
      '</div>';
  }

  function renderStreakSection() {
    var el = document.getElementById('vtStreakSection');
    if (!el) return;
    var d = calculateDiscipline();
    el.innerHTML =
      '<div class="vt-streak-item">' +
        '<span class="vt-streak-val">' + d.totalTrades + '</span>' +
        '<span class="vt-streak-label">Trades Logged</span>' +
        '<span class="vt-streak-sub">' + (55 - d.totalTrades) + ' remaining</span>' +
      '</div>' +
      '<div class="vt-streak-item">' +
        '<span class="vt-streak-val">' + d.streak.current + '</span>' +
        '<span class="vt-streak-label">Current Streak</span>' +
        '<span class="vt-streak-sub">Best: ' + d.streak.best + '</span>' +
      '</div>' +
      '<div class="vt-streak-item">' +
        '<span class="vt-streak-val">' + d.score + '%</span>' +
        '<span class="vt-streak-label">Consistency</span>' +
        '<span class="vt-streak-sub">' + d.totalDays + ' days active</span>' +
      '</div>';
  }

  function renderSystemMessages() {
    var el = document.getElementById('vtSysMessages');
    if (!el) return;
    var msgs = generateSystemMessages();
    if (msgs.length === 0) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    var icons = {
      positive: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>',
      warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      danger: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    var html = '';
    msgs.forEach(function (m) {
      html += '<div class="vt-sys-msg vt-sys-msg--' + m.type + '">' +
        '<span class="vt-sys-msg-icon">' + (icons[m.type] || icons.info) + '</span>' +
        '<div class="vt-sys-msg-content">' +
          '<div class="vt-sys-msg-title">' + m.title + '</div>' +
          '<div class="vt-sys-msg-text">' + m.text + '</div>' +
          '<div class="vt-sys-msg-time">' + m.time + '</div>' +
        '</div>' +
      '</div>';
    });
    el.innerHTML = html;
  }

  function renderIncompleteAlert() {
    var el = document.getElementById('vtIncompleteAlert');
    if (!el) return;
    var log = loadDailyLog();
    var yKey = yesterdayKey();
    var yd = new Date(yKey);
    var dow = yd.getDay();
    if (!log.entries[yKey] && dow !== 0 && dow !== 6 && Object.keys(log.entries).length > 0) {
      el.style.display = '';
      el.innerHTML =
        '<span class="vt-incomplete-alert-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></span>' +
        '<div class="vt-incomplete-alert-text">' +
          '<div class="vt-incomplete-alert-title">Previous Day Not Completed</div>' +
          '<div class="vt-incomplete-alert-desc">' + formatDate(yKey) + ' has no recorded activity. Every unlogged weekday reduces your Discipline Consistency Score by 5 points.</div>' +
        '</div>';
    } else {
      el.style.display = 'none';
    }
  }

  function renderNoActivityBanner() {
    var el = document.getElementById('vtNoActivity');
    if (!el) return;
    var entry = getTodayEntry();
    if (!entry) {
      el.style.display = '';
      el.innerHTML =
        '<span class="vt-no-activity-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>' +
        '<div class="vt-no-activity-text">' +
          '<div class="vt-no-activity-title">No activity recorded today</div>' +
          '<div class="vt-no-activity-desc">Log a trade or declare a no-trade day to maintain your Discipline Consistency Score.</div>' +
        '</div>' +
        '<div class="vt-no-activity-actions">' +
          '<button class="vt-no-activity-btn vt-no-activity-btn--log" id="vtBannerLogTrade">Log Trade</button>' +
          '<button class="vt-no-activity-btn" id="vtBannerNoTrade">No Trade</button>' +
        '</div>';
      // Bind banner buttons
      var logBtn = document.getElementById('vtBannerLogTrade');
      var noBtn = document.getElementById('vtBannerNoTrade');
      if (logBtn) logBtn.addEventListener('click', function () {
        el.style.display = 'none';
        var form = document.querySelector('.verif-form-section');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      if (noBtn) noBtn.addEventListener('click', function () {
        logNoTradeDay();
        renderAll();
        showNoTradeConfirmation();
      });
    } else if (entry.type === 'no_trade') {
      el.style.display = 'none';
      showNoTradeConfirmation();
    } else {
      el.style.display = 'none';
    }
  }

  function showNoTradeConfirmation() {
    var el = document.getElementById('vtNoTradeConfirm');
    if (!el) return;
    var entry = getTodayEntry();
    if (entry && entry.type === 'no_trade') {
      el.style.display = '';
      el.innerHTML =
        '<span class="vt-notrade-confirm-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg></span>' +
        '<div class="vt-notrade-confirm-text">' +
          '<div class="vt-notrade-confirm-title">No-Trade Day Confirmed</div>' +
          '<div class="vt-notrade-confirm-desc">Today has been recorded as a no-trade day. Disciplined inaction is recognized and preserves your consistency score.</div>' +
        '</div>';
    } else {
      el.style.display = 'none';
    }
  }

  // ═══ DAILY PROMPT ═════════════════════════════════════════════════════
  function showDailyPrompt() {
    if (hasTradedToday()) return;
    var trades = loadTrades().trades || [];
    // Only show prompt if user has started the cycle (at least 1 entry exists)
    var log = loadDailyLog();
    if (Object.keys(log.entries).length === 0 && trades.length === 0) return;

    var overlay = document.createElement('div');
    overlay.className = 'vt-daily-overlay';
    overlay.id = 'vtDailyOverlay';
    var today = new Date();
    var dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

    overlay.innerHTML =
      '<div class="vt-daily-panel">' +
        '<div class="vt-daily-icon">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
        '</div>' +
        '<div class="vt-daily-title">Daily Activity Check</div>' +
        '<div class="vt-daily-sub">Every day in your evaluation cycle must be accounted for. Did you execute a trade today?</div>' +
        '<div class="vt-daily-date">' + dateStr + '</div>' +
        '<div class="vt-daily-actions">' +
          '<button class="vt-daily-btn vt-daily-btn--primary" id="vtDailyLogTrade">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>' +
            'Yes, I traded — Log trade' +
          '</button>' +
          '<button class="vt-daily-btn vt-daily-btn--muted" id="vtDailyNoTrade">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>' +
            'No valid setup — No trade today' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    document.getElementById('vtDailyLogTrade').addEventListener('click', function () {
      closeDailyPrompt();
      var form = document.querySelector('.verif-form-section');
      if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    document.getElementById('vtDailyNoTrade').addEventListener('click', function () {
      logNoTradeDay();
      closeDailyPrompt();
      renderAll();
    });
  }

  function closeDailyPrompt() {
    var overlay = document.getElementById('vtDailyOverlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.25s ease';
      setTimeout(function () { overlay.remove(); }, 250);
    }
    document.body.style.overflow = '';
  }

  // ═══ TRADE SUBMISSION HOOK ════════════════════════════════════════════
  function onTradeSubmitted() {
    logTradeDay();
    renderAll();
  }

  // ═══ RENDER ALL ═══════════════════════════════════════════════════════
  function renderAll() {
    renderLiveBar();
    renderIncompleteAlert();
    renderNoActivityBanner();
    renderDisciplineSection();
    renderStreakSection();
    renderSystemMessages();
    showNoTradeConfirmation();
  }

  // ═══ DISCIPLINE RULES MODAL ═════════════════════════════════════════
  function openRulesModal() {
    var overlay = document.getElementById('vtRulesOverlay');
    if (!overlay) return;
    renderCurrentScoreInModal();
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeRulesModal() {
    var overlay = document.getElementById('vtRulesOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function renderCurrentScoreInModal() {
    var container = document.getElementById('vtRulesCurrentScore');
    if (!container) return;

    // Use ChallengeScore if available, fallback to discipline
    if (typeof window.ChallengeScore !== 'undefined') {
      var b = window.ChallengeScore.calculateScore();
      var scoreColor = b.hardFail ? 'rgba(239,68,68,0.9)' : b.score >= 70 ? 'rgba(34,197,94,0.9)' : b.score >= 60 ? 'rgba(234,179,8,0.9)' : 'rgba(239,68,68,0.9)';
      var statusLabel = b.hardFail ? 'FAILED' : b.score >= 60 ? 'PASSING' : 'FAILING';

      container.innerHTML =
        '<div class="vt-rules-current-grid">' +
          '<div class="vt-rules-current-item">' +
            '<span class="vt-rules-current-val" style="color:' + scoreColor + ';">' + (b.hardFail ? '0' : b.score) + '%</span>' +
            '<span class="vt-rules-current-lbl">Score</span>' +
          '</div>' +
          '<div class="vt-rules-current-item">' +
            '<span class="vt-rules-current-val" style="color:' + scoreColor + ';">' + statusLabel + '</span>' +
            '<span class="vt-rules-current-lbl">Status</span>' +
          '</div>' +
          '<div class="vt-rules-current-item">' +
            '<span class="vt-rules-current-val">' + b.totalTrades + '</span>' +
            '<span class="vt-rules-current-lbl">Trades</span>' +
          '</div>' +
        '</div>' +
        '<div class="vt-rules-current-breakdown">' +
          '<div><span class="vt-cb-label">Valid</span><span class="vt-cb-val" style="color:rgba(34,197,94,0.85);">' + b.validTrades + '</span></div>' +
          '<div><span class="vt-cb-label">Minor</span><span class="vt-cb-val" style="color:rgba(234,179,8,0.85);">' + b.minorTrades + '</span></div>' +
          '<div><span class="vt-cb-label">Invalid</span><span class="vt-cb-val" style="color:' + (b.invalidTrades > 0 ? 'rgba(239,68,68,0.85)' : 'inherit') + ';">' + b.invalidTrades + '</span></div>' +
          '<div><span class="vt-cb-label">Behavior</span><span class="vt-cb-val" style="color:' + (b.behaviorViolations > 0 ? 'rgba(239,68,68,0.85)' : 'inherit') + ';">' + b.behaviorViolations + '</span></div>' +
          '<div><span class="vt-cb-label">Inactive days</span><span class="vt-cb-val" style="color:' + (b.inactiveDays > 0 ? 'rgba(239,68,68,0.85)' : 'inherit') + ';">' + b.inactiveDays + '</span></div>' +
          '<div><span class="vt-cb-label">Logged days</span><span class="vt-cb-val">' + b.totalLoggedDays + '</span></div>' +
          '<div><span class="vt-cb-label">Perfect bonus</span><span class="vt-cb-val" style="color:rgba(34,197,94,0.85);">+' + b.perfectBonus + '%</span></div>' +
          '<div><span class="vt-cb-label">Total penalty</span><span class="vt-cb-val" style="color:' + ((b.invalidPenalty + b.minorPenalty + b.behaviorPenalty + b.inactivityPenalty + b.overtradingPenalty + b.ruleBreakPenalty) > 0 ? 'rgba(239,68,68,0.85)' : 'inherit') + ';">\u2212' + (b.invalidPenalty + b.minorPenalty + b.behaviorPenalty + b.inactivityPenalty + b.overtradingPenalty + b.ruleBreakPenalty) + '%</span></div>' +
        '</div>';
      return;
    }

    // Fallback to old discipline score
    var d = calculateDiscipline();
    var scoreColor2 = d.score >= 70 ? 'rgba(34,197,94,0.9)' : d.score >= 50 ? 'rgba(234,179,8,0.9)' : 'rgba(239,68,68,0.9)';
    container.innerHTML =
      '<div class="vt-rules-current-grid">' +
        '<div class="vt-rules-current-item">' +
          '<span class="vt-rules-current-val" style="color:' + scoreColor2 + ';">' + d.score + '</span>' +
          '<span class="vt-rules-current-lbl">Discipline</span>' +
        '</div>' +
      '</div>';
  }

  function initRulesModal() {
    var btn = document.getElementById('vtDisciplineRulesBtn');
    var closeBtn = document.getElementById('vtRulesClose');
    var overlay = document.getElementById('vtRulesOverlay');

    if (btn) btn.addEventListener('click', openRulesModal);
    if (closeBtn) closeBtn.addEventListener('click', closeRulesModal);
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeRulesModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeRulesModal();
    });
  }

  // ═══ INIT ═════════════════════════════════════════════════════════════
  function init() {
    renderAll();
    initRulesModal();
    // Show daily prompt after a short delay
    setTimeout(function () {
      showDailyPrompt();
    }, 600);
  }

  // ═══ PUBLIC API ═══════════════════════════════════════════════════════
  window.AltivorBehavior = {
    init: init,
    renderAll: renderAll,
    onTradeSubmitted: onTradeSubmitted,
    logTradeDay: logTradeDay,
    logNoTradeDay: logNoTradeDay,
    calculateDiscipline: calculateDiscipline,
    generateSystemMessages: generateSystemMessages,
    getLiveStatusData: getLiveStatusData,
    hasTradedToday: hasTradedToday,
    openRulesModal: openRulesModal,
    closeRulesModal: closeRulesModal
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
