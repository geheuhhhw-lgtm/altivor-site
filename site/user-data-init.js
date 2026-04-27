/* ═══════════════════════════════════════════════════════════════════════
   ALTIVOR — Full Demo Data for brzozowskioff12@gmail.com
   Populates ALL localStorage keys so every tool shows realistic data.
   NO version guard — always overwrites to stay in sync.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  try {
    var s = JSON.parse(localStorage.getItem('altivor_session'));
    if (!s || !s.user || !s.user.email) return;
    if (s.user.email.toLowerCase() !== 'brzozowskioff12@gmail.com') return;

    var DAY = 86400000;
    var now = Date.now();
    var csDate = new Date(now - 21 * DAY);
    csDate.setUTCHours(8, 0, 0, 0);
    var csMs = csDate.getTime();

    function md(dayOff, h, m) {
      return new Date(csMs + dayOff * DAY + (h - 8) * 3600000 + (m || 0) * 60000).toISOString();
    }
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function dayKey(dayOff) {
      var d = new Date(csMs + dayOff * DAY);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    /* ══════════════════════════════════════════════════════════════════════
       16 TRADES — All times UTC 13-19 (NY Core + Continuation)
       Grade targets: 4×A+, 5×A, 3×B, 4×F
       Losing trades: RR ≤ 1.0 = within SL, RR > 1.0 = SL exceeded → F
       Net PnL = +240 → 2.4% on $10,000
       ══════════════════════════════════════════════════════════════════════ */
    var SC = {
      perfect:  { m5Bias:true, pullbackEntry:true, bosConfirmation:true, m1TriggerOnly:true, slStructurallyValid:true, riskChangedMidTrade:false },
      noPull:   { m5Bias:true, pullbackEntry:false, bosConfirmation:true, m1TriggerOnly:true, slStructurallyValid:true, riskChangedMidTrade:false },
      noM5:     { m5Bias:false, pullbackEntry:true, bosConfirmation:true, m1TriggerOnly:true, slStructurallyValid:true, riskChangedMidTrade:false },
      m1bias:   { m5Bias:true, pullbackEntry:true, bosConfirmation:true, m1AsBias:true, slStructurallyValid:true, riskChangedMidTrade:false },
      riskSL:   { m5Bias:true, pullbackEntry:true, bosConfirmation:true, riskChangedMidTrade:true, slStructurallyValid:false },
      m1slBad:  { m5Bias:true, pullbackEntry:true, bosConfirmation:true, m1AsBias:true, slStructurallyValid:false },
      noM5sl:   { m5Bias:false, pullbackEntry:true, bosConfirmation:true, slStructurallyValid:false, riskChangedMidTrade:false },
      impulsF:  { m5Bias:false, pullbackEntry:false, bosConfirmation:false, m1AsBias:true, slStructurallyValid:false, riskChangedMidTrade:false },
      randomF:  { m5Bias:false, pullbackEntry:false, bosConfirmation:false, slStructurallyValid:false, riskChangedMidTrade:false },
      totalF:   { m5Bias:false, pullbackEntry:false, bosConfirmation:false, slStructurallyValid:false, riskChangedMidTrade:true }
    };

    var D = [
      // T1: A+ — perfect execution, BOS retest, within SL
      { d:1,  eH:13,eM:30, xH:14,xM:15, dir:'LONG',  en:18520, ex:18558, sl:18490, tp:18580, pnl:38,  lot:1.0,
        setup:'Structural Break & Retest', notes:'Clean bullish BOS on M15. Retest with FVG confluence. Confirmation candle close entry.',
        ss:true, comp:true, sc:SC.perfect },
      // T2: A — no pullback entry (-20pts → 80)
      { d:2,  eH:14,eM:15, xH:15,xM:0,  dir:'LONG',  en:18545, ex:18590, sl:18515, tp:18600, pnl:45,  lot:1.0,
        setup:'Fair Value Gap', notes:'M15 FVG fill. Strong reaction off equilibrium. Entered on impulse, no pullback wait.',
        ss:true, comp:true, sc:SC.noPull },
      // T3: B — no m5Bias + SL invalid (-25-15=40pts → 60) [INVALID: no screenshot, non-compliant]
      { d:4,  eH:15,eM:0,  xH:15,xM:45, dir:'SHORT', en:18610, ex:18632, sl:18640, tp:18570, pnl:-22, lot:0.8,
        setup:'Order Block Retest', notes:null,
        ss:false, comp:false, sc:SC.noM5sl },
      // T4: A+ — perfect, sweep setup
      { d:5,  eH:13,eM:45, xH:14,xM:30, dir:'LONG',  en:18555, ex:18587, sl:18525, tp:18595, pnl:32,  lot:1.2,
        setup:'Liquidity Sweep', notes:'Sweep of session low into bullish OB. Partials at 1:1, runner to 1.07R.',
        ss:true, comp:true, sc:SC.perfect },
      // T5: A — no M5 bias (-25pts → 75)
      { d:6,  eH:17,eM:0,  xH:17,xM:50, dir:'SHORT', en:18640, ex:18595, sl:18670, tp:18580, pnl:45,  lot:1.0,
        setup:'Structural Break & Retest', notes:'Bearish BOS M15. Clean displacement into supply. Skipped M5 bias check.',
        ss:true, comp:true, sc:SC.noM5 },
      // T6: F — impulsive, no BOS/pullback/M5, M1 as bias, no SL doc [INVALID: non-compliant]
      { d:8,  eH:14,eM:5,  xH:14,xM:35, dir:'LONG',  en:18570, ex:18548, sl:18540, tp:18610, pnl:-22, lot:1.5,
        setup:'Fair Value Gap', notes:null,
        ss:false, comp:false, sc:SC.impulsF, noSL:true },
      // T7: A — M1 used as bias (-15pts → 85)
      { d:9,  eH:17,eM:0,  xH:18,xM:10, dir:'SHORT', en:18680, ex:18645, sl:18710, tp:18620, pnl:35,  lot:0.8,
        setup:'Liquidity Sweep', notes:'PM sweep of daily high. Clean displacement. Used M1 as bias not trigger.',
        ss:true, comp:true, sc:SC.m1bias },
      // T8: F — no framework, no BOS/pullback/SL invalid, no SL doc [INVALID: no setup]
      { d:10, eH:13,eM:15, xH:14,xM:0,  dir:'LONG',  en:18640, ex:18615, sl:18610, tp:18680, pnl:-25, lot:1.0,
        setup:null, notes:null,
        ss:false, comp:false, sc:SC.randomF, noSL:true },
      // T9: B — risk changed + SL invalid (-20-15=35 → 65) [non-compliant: risk changed]
      { d:12, eH:15,eM:30, xH:16,xM:20, dir:'SHORT', en:18700, ex:18672, sl:18730, tp:18650, pnl:28,  lot:1.0,
        setup:'Structural Break & Retest', notes:'Bearish BOS M15. Moved SL mid-trade. SL placement questionable.',
        ss:true, comp:false, sc:SC.riskSL },
      // T10: F — SL EXCEEDED (exit 18625 < SL 18630, RR=1.17>1) [INVALID: no docs, no SL doc]
      { d:13, eH:14,eM:0,  xH:14,xM:25, dir:'LONG',  en:18660, ex:18625, sl:18630, tp:18700, pnl:-35, lot:1.2,
        setup:'Fair Value Gap', notes:null,
        ss:false, comp:false, sc:SC.totalF, noSL:true },
      // T11: A+ — perfect execution
      { d:15, eH:17,eM:30, xH:18,xM:15, dir:'SHORT', en:18720, ex:18688, sl:18750, tp:18680, pnl:32,  lot:0.8,
        setup:'Liquidity Sweep', notes:'NY continuation sweep. Clean entry after displacement. Perfect process.',
        ss:true, comp:true, sc:SC.perfect },
      // T12: F — SL EXCEEDED (exit 18662 < SL 18665, RR=1.1>1) [INVALID: oversized+non-compliant+no SL doc]
      { d:16, eH:13,eM:30, xH:14,xM:10, dir:'LONG',  en:18695, ex:18662, sl:18665, tp:18735, pnl:-33, lot:2.0,
        setup:'Order Block Retest', notes:'Oversized 2 lots. OB failed. SL exceeded. Risk management violation.',
        ss:false, comp:false, sc:SC.totalF, noSL:true },
      // T13: A+ — best trade, perfect execution
      { d:17, eH:15,eM:0,  xH:16,xM:15, dir:'SHORT', en:18760, ex:18718, sl:18790, tp:18700, pnl:42,  lot:1.0,
        setup:'Structural Break & Retest', notes:'M15 bearish break. Institutional displacement. Best trade — 1.4R.',
        ss:true, comp:true, sc:SC.perfect },
      // T14: B — M1 as bias + SL invalid (-15-15=30 → 70)
      { d:18, eH:18,eM:15, xH:18,xM:40, dir:'LONG',  en:18720, ex:18738, sl:18700, tp:18760, pnl:18,  lot:0.5,
        setup:'Fair Value Gap', notes:'Small position. Conservative FVG. Quick partials 0.9R. Used M1 as bias.',
        ss:true, comp:true, sc:SC.m1slBad },
      // T15: A — no pullback (-20 → 80) [INVALID: missing screenshot]
      { d:20, eH:14,eM:45, xH:15,xM:30, dir:'SHORT', en:18780, ex:18750, sl:18810, tp:18740, pnl:30,  lot:1.0,
        setup:'Liquidity Sweep', notes:'Sweep prev day high into OB. 1R exit. Browser crashed — no screenshot saved.',
        ss:false, comp:true, sc:SC.noPull },
      // T16: A — no pullback (-20 → 80)
      { d:21, eH:17,eM:0,  xH:18,xM:0,  dir:'LONG',  en:18740, ex:18772, sl:18710, tp:18790, pnl:32,  lot:1.0,
        setup:'Structural Break & Retest', notes:'Bullish BOS M15, FVG confluence. Good momentum. Entered on impulse.',
        ss:true, comp:true, sc:SC.noPull }
    ];
    // Net: +38+45-22+32+45-22+35-25+28-35+32-33+42+18+30+32 = +240 ✓

    var trades = [];
    var bal = 10000;
    var peak = 10000;
    for (var i = 0; i < D.length; i++) {
      var t = D[i];
      var risk = Math.abs(t.en - t.sl);
      var actualPts = Math.abs(t.ex - t.en);
      var rr = risk > 0 ? parseFloat((actualPts / risk).toFixed(2)) : 0;
      var pnlPct = parseFloat(((t.pnl / bal) * 100).toFixed(2));
      bal += t.pnl;
      if (bal > peak) peak = bal;
      trades.push({
        id: 'T' + (i + 1), tradeNumber: i + 1,
        date: md(t.d, t.eH, t.eM), entryTime: md(t.d, t.eH, t.eM), exitTime: md(t.d, t.xH, t.xM),
        direction: t.dir, positionSize: t.lot, lotSize: t.lot,
        entryPrice: t.en, exitPrice: t.ex, stopLoss: t.noSL ? 0 : t.sl, takeProfit: t.tp, sl: t.sl, tp: t.tp,
        pnl: t.pnl, pl: t.pnl, pnlPercent: pnlPct, rr: rr,
        hasScreenshot: t.ss, screenshot: t.ss ? 'trade_' + (i + 1) + '.png' : null,
        screenshotFile: t.ss ? 'trade_' + (i + 1) + '.png' : null,
        notes: t.notes || '', compliant: t.comp,
        setup: t.setup || undefined, frameworkType: t.setup || undefined, strategy: t.setup || undefined,
        instrument: 'US100', session: 'new_york',
        _scoring: t.sc
      });
    }

    /* ── VERIFICATION STORES ──────────────────────────────────────────── */
    // One-time wipe of old mock trades, then never touch again
    if (!localStorage.getItem('altivor_trades_clean_v2')) {
      localStorage.setItem('altivor_verification_trades_v1', JSON.stringify({ trades: [] }));
      localStorage.setItem('altivor_trades_clean_v2', '1');
    }

    var checkins = [
      { id: 'W1', date: md(7, 18, 0), weekNumber: 1, equityValue: 10116, equity: 10116, equityScreenshot: null, notes: 'Week 1 done. 6 trades, 4W/2L. Screenshot discipline needs work.' },
      { id: 'W2', date: md(14, 18, 0), weekNumber: 2, equityValue: 10139, equity: 10139, equityScreenshot: null, notes: 'Week 2. Win rate improving. T8 was random — must fix process.' }
    ];
    localStorage.setItem('altivor_verification_weekly_v1', JSON.stringify({ checkins: checkins }));

    localStorage.setItem('altivor_verification_drawdown_v1', JSON.stringify({
      startingEquity: 10000, peakEquity: 10450, currentEquity: 10240, failed: false, history: []
    }));

    localStorage.setItem('altivor_verification_profit_v1', JSON.stringify({
      startingBalance: 10000, month1Balance: 10240, month2Balance: null
    }));

    localStorage.setItem('altivor_verification_statement_v1', JSON.stringify({ submitted: false }));

    /* ── CHALLENGE STATE ──────────────────────────────────────────────── */
    localStorage.setItem('altivor_challenge_state_v1', JSON.stringify({
      status: 'ACTIVE', failedAt: null, failReason: null, failTradeId: null,
      tradeClassifications: {}, lastUpdated: new Date().toISOString()
    }));
    localStorage.setItem('altivor_challenge_ack_v1', '1');

    /* ── CHALLENGE V1 (verification-app.js dashboard) ─────────────────── */
    var endDate = new Date(csMs + 60 * DAY);
    localStorage.setItem('altivor_challenge_v1', JSON.stringify({
      status: 'active', startDate: new Date(csMs).toISOString(), endDate: endDate.toISOString(),
      initialBalance: 10000, currentBalance: 10240, highWaterMark: peak,
      maxDrawdown: parseFloat((((peak - 10240) / peak) * 100).toFixed(2)),
      currentProfit: 2.4, daysRemaining: 39,
      weeklyCheckins: checkins, trades: [], brokerStatements: [],
      failReason: null, passedDate: null
    }));

    /* ── CHALLENGE SCORE (challenge-score.js) ─────────────────────────── */
    localStorage.setItem('altivor_challenge_score_v1', JSON.stringify({
      hardFail: null,
      tradeReviews: {
        '0': 'valid',   '1': 'valid',   '2': 'invalid',
        '3': 'valid',   '4': 'valid',   '5': 'invalid',
        '6': 'valid',   '7': 'invalid', '8': 'invalid',
        '9': 'invalid', '10': 'valid',  '11': 'invalid',
        '12': 'valid',  '13': 'valid',  '14': 'minor',
        '15': 'valid'
      },
      overtradingFlags: {},
      ruleBreaks: [],
      behaviorViolations: [],
      perfectTradeCount: 9
    }));

    /* ── DAILY LOG (behavioral system) ────────────────────────────────── */
    var dailyLog = { entries: {} };
    var tradeDays = [1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 15, 16, 17, 18, 20, 21];
    for (var j = 0; j < tradeDays.length; j++) {
      dailyLog.entries[dayKey(tradeDays[j])] = { type: 'trade', time: md(tradeDays[j], 13, 0) };
    }
    var noTradeDays = [3, 7, 11, 14, 19];
    for (var k = 0; k < noTradeDays.length; k++) {
      dailyLog.entries[dayKey(noTradeDays[k])] = { type: 'no_trade', time: md(noTradeDays[k], 18, 0) };
    }
    localStorage.setItem('altivor_daily_log_v1', JSON.stringify(dailyLog));

    /* ── STRATEGIES (execution-checklist + strategy-builder) ──────────── */
    // Merge: seed demo strategies without overwriting user-created ones
    var seedStrategies = [
      { id: 'strat-1', name: 'NY BOS Retest', type: 'core', description: 'Wait for M15 structural break during NY session, then enter on pullback into FVG. Confirmation candle close required. SL below/above structure.', rules: ['Wait for BOS on M15','Identify FVG in retest zone','Enter on confirmation candle close','SL behind structure','TP at next liquidity pool'], winRate: 64, avgRR: 1.4, tradesUsed: 8 },
      { id: 'strat-2', name: 'NY Liquidity Sweep', type: 'sniper', description: 'Wait for NY session to sweep key liquidity level (prev day H/L, session H/L). Enter on displacement into OB/FVG. Tight SL above/below sweep.', rules: ['Identify key liquidity levels pre-session','Wait for sweep + displacement','Enter at OB/FVG after displacement','SL above/below sweep','TP at opposing liquidity'], winRate: 58, avgRR: 1.8, tradesUsed: 5 },
      { id: 'strat-3', name: 'FVG Fill Scalp', type: 'scalp', description: 'Quick entries on M5 FVG fills during NY continuation. Small targets, tight stops. High win rate, lower RR.', rules: ['M5 FVG in trending market','Enter on 50% FVG fill','SL below/above FVG','TP at FVG origin','Max 15 min hold'], winRate: 72, avgRR: 0.8, tradesUsed: 3 }
    ];
    var existingStrats = [];
    try { existingStrats = JSON.parse(localStorage.getItem('altivor_strategies_v1')) || []; } catch(e) {}
    var existingIds = {};
    existingStrats.forEach(function(s) { existingIds[s.id] = true; });
    seedStrategies.forEach(function(s) {
      if (!existingIds[s.id]) existingStrats.push(s);
    });
    localStorage.setItem('altivor_strategies_v1', JSON.stringify(existingStrats));

    /* ── BACKTEST DATA (strategy-builder) ─────────────────────────────── */
    var btTrades = [];
    var btSetups = ['bos','fvg_fill','liquidity_sweep','ob_tap'];
    var btSessions = ['new_york','new_york'];
    var btDays = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
    for (var bi = 0; bi < 12; bi++) {
      var bDay = new Date(csMs + (bi + 1) * DAY);
      var bWin = bi % 3 !== 2;
      var bPnl = bWin ? (15 + Math.floor((bi * 7) % 30)) : -(10 + Math.floor((bi * 5) % 20));
      btTrades.push({
        id: 'bt-' + (bi + 1), strategyId: existingStrats[bi % existingStrats.length].id,
        date: bDay.toISOString().split('T')[0], entryTime: bDay.toISOString(),
        day: btDays[bi % 5], session: 'new_york',
        direction: bi % 2 === 0 ? 'long' : 'short', setup: btSetups[bi % 4],
        instrument: 'US100',
        entry: 18500 + bi * 20,
        sl: 18500 + bi * 20 + (bi % 2 === 0 ? -30 : 30),
        tp: 18500 + bi * 20 + (bi % 2 === 0 ? 60 : -60),
        exit: 18500 + bi * 20 + (bWin ? (bi % 2 === 0 ? 40 : -40) : (bi % 2 === 0 ? -25 : 25)),
        rr: bWin ? parseFloat((1.0 + (bi % 5) * 0.2).toFixed(1)) : parseFloat((-0.5 - (bi % 3) * 0.2).toFixed(1)),
        result: bWin ? 'win' : 'loss', pnl: bPnl,
        notes: bWin ? 'Clean execution, followed rules.' : 'Setup invalidated, loss accepted.',
        compliance: { direction: true, session: bi % 4 !== 3, setup: true, sl_defined: true, rr_minimum: bWin, entry_method: true }
      });
    }
    var existingBT = [];
    try { existingBT = JSON.parse(localStorage.getItem('altivor_backtest_v1')) || []; } catch(e) {}
    if (existingBT.length === 0) {
      localStorage.setItem('altivor_backtest_v1', JSON.stringify(btTrades));
    }

    /* ── CLEANUP ──────────────────────────────────────────────────────── */
    localStorage.removeItem('altivor_bzdata_v1');
    localStorage.removeItem('altivor_bzdata_v2');
    localStorage.removeItem('altivor_bzdata_v3');
    localStorage.removeItem('altivor_bzdata_v4');
    localStorage.removeItem('altivor_violation_log_v1');
    localStorage.removeItem('altivor_scoring_evaluation_v1');
    localStorage.removeItem('altivor_scoring_engine_v1');
    localStorage.removeItem('altivor_challenge_completed_brzozowskioff12@gmail.com');
    localStorage.removeItem('altivor_completion_modal_shown_brzozowskioff12@gmail.com');
    localStorage.removeItem('altivor_wot_entries_v1');

    console.log('[UserDataInit] v5 — 16 trades (A+×4, A×5, B×3, F×4), 2/8 weeks, 2.4% profit, 39d remaining');

  } catch (e) {
    console.warn('[UserDataInit] Error:', e);
  }
})();
