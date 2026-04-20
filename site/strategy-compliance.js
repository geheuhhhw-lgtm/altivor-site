/* ═══════════════════════════════════════════════════════════════════════════
   STRATEGY COMPLIANCE ENGINE v1.0
   Shared module for Execution Checklist & 55 Trade Cycle
   Reads strategy definitions from localStorage key: altivor_strategies_v1
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var STRAT_KEY = 'altivor_strategies_v1';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function loadStrategies(){ try { return JSON.parse(localStorage.getItem(STRAT_KEY)) || []; } catch(e){ return []; } }
function getStrategy(id){ return loadStrategies().find(function(s){ return s.id === id; }); }

/* ── Human-readable label maps ───────────────────────────────────────────── */
var LABELS = {
  /* Setup */
  pullback:'Pullback / Retracement to POI', bos_continuation:'BOS Continuation',
  choch_reversal:'CHoCH Reversal', sweep_reversal:'Liquidity Sweep & Reversal',
  range_play:'Range Bounce', momentum_entry:'Momentum / Displacement Entry',
  breakout_retest:'Breakout + Retest', mean_reversion:'Mean Reversion',
  trend_continuation:'Trend Continuation', failure_swing:'Failure Swing',
  /* Direction */
  long:'Long', short:'Short',
  /* HTF Bias */
  hh_hl:'HH/HL Bullish', lh_ll:'LH/LL Bearish', bos:'BOS', choch:'CHoCH',
  premium_discount:'Premium/Discount', range_bound:'Range-Bound',
  /* Liquidity */
  bsl_sweep:'BSL Sweep', ssl_sweep:'SSL Sweep', eql_sweep:'EQL Sweep',
  dol_identified:'DOL Identified', inducement:'Inducement',
  /* Displacement */
  displacement:'Displacement', fvg_entry:'FVG Entry', bpr_entry:'BPR Entry',
  ce_entry:'CE Entry', liquidity_void:'Liquidity Void Fill',
  /* Zones */
  ob_entry:'Order Block', bb_entry:'Breaker Block', mitigation:'Mitigation Block',
  reaccumulation:'Reaccumulation', redistribution:'Redistribution',
  /* Cycle */
  accumulation:'Accumulation', manipulation:'Manipulation', expansion:'Expansion',
  judas_swing:'Judas Swing',
  /* Confirmations */
  htf_alignment:'HTF Alignment', ltf_bos:'LTF BOS', ltf_choch:'LTF CHoCH',
  candle_pattern:'Candle Pattern', volume_spike:'Volume Spike',
  displacement_after_sweep:'Displacement After Sweep',
  pullback_to_poi:'Pullback Into POI', smt_divergence:'SMT Divergence',
  market_shift:'Market Structure Shift', pd_array_stack:'PD Array Stacking',
  no_opposing_liq:'No Opposing Liquidity', clean_range:'Clean Price Action',
  time_of_day:'Time Window Match', correlation_aligned:'Correlation Aligned',
  /* Confluences */
  fib_ote:'OTE 70.5-79%', fib_deep:'Fib 62%', fib_eq:'Fib 50% EQ',
  multi_tf_fvg:'Multi-TF FVG', session_timing:'Kill Zone Timing',
  /* Entry methods */
  market_order:'Market Order', limit_order:'Limit Order', stop_order:'Stop Order',
  confirmation_candle:'Confirmation Candle', ltf_entry:'LTF Drill-Down',
  engulfing_close:'Engulfing Close', wick_rejection:'Wick Rejection', break_retest:'Break+Retest',
  /* Pullback depth */
  pb_shallow:'Shallow (38.2%)', pb_equilibrium:'Equilibrium (50%)',
  pb_ote:'OTE (62-79%)', pb_deep:'Deep (79%+)',
  pb_full_body:'Full Body Into POI', pb_wick_only:'Wick-Only Tap', pb_na:'N/A',
  /* POI */
  poi_unmitigated_ob:'Unmitigated OB', poi_unmitigated_fvg:'Unmitigated FVG',
  poi_breaker:'Breaker Block', poi_demand_supply:'Demand/Supply Zone',
  poi_displacement_base:'Displacement Base', poi_htf_level:'HTF Key Level',
  poi_premium_discount:'Premium/Discount Zone', poi_with_liq_above:'Liquidity Resting Near',
  poi_fresh_only:'Fresh POI Only', poi_pd_array_confluence:'PD Array Confluence',
  /* Invalidation */
  inv_bos_against:'BOS Against Direction', inv_close_through_poi:'Candle Close Through POI',
  inv_htf_shift:'HTF Structure Shift', inv_liq_taken_both:'Both Sides Swept',
  inv_news_volatility:'News Spike Volatility', inv_time_expiry:'Time Window Expired',
  inv_poi_mitigated:'POI Already Mitigated', inv_correlation_break:'Correlation Break',
  inv_opposing_displacement:'Opposing Displacement',
  /* Management */
  mgmt_be_after_1r:'Move BE at 1R', mgmt_be_after_structure:'BE After Structure',
  mgmt_trail_structure:'Trail to Structure', mgmt_trail_fvg:'Trail to FVG CE',
  mgmt_close_opposing_bos:'Close on Opposing BOS', mgmt_close_before_news:'Close Before News',
  mgmt_close_session_end:'Close at Session End', mgmt_time_stop:'Apply Time Stop',
  mgmt_no_move_sl_further:'Never Move SL Further', mgmt_let_winner_run:'Let Winners Run',
  mgmt_scale_in:'Scale In Allowed', mgmt_hedge_opposing:'Hedge Allowed',
  /* Sessions */
  london_open:'London Open', ny_am:'NY AM', ny_pm:'NY PM', asia:'Asia',
  lo_ny_overlap:'LO/NY Overlap',
  /* Days */
  mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday',
  /* Filters */
  no_high_impact_news:'No High Impact News', no_monday_open:'Skip Monday Open',
  no_friday_close:'Skip Friday Close', no_nfp:'No NFP', no_fomc:'No FOMC',
  trend_only:'Trend Only', reversal_only:'Reversal Only', adr_above_70:'ADR Above 70%',
  /* Risk */
  no_revenge:'No Revenge Trading', scale_down_after_loss:'Scale Down After Loss',
  max_2_correlated:'Max 2 Correlated Positions', no_add_to_loser:'Never Add to Loser',
  sl_mandatory:'Stop Loss Mandatory', be_after_1r:'Breakeven After 1R',
  /* Market Env */
  env_trending:'Trending', env_ranging:'Ranging', env_expanding:'Expanding',
  env_volatile:'High Volatility', env_low_vol:'Low Volatility', env_reversal:'Reversal',
  env_post_news:'Post-News', env_pre_news_only:'Pre-News Only', env_clean_delivery:'Clean Delivery',
  nogo_choppy:'Choppy', nogo_wide_spread:'Wide Spread', nogo_extreme_vol:'Extreme Volatility',
  nogo_no_displacement:'No Displacement', nogo_end_of_range:'ADR Exhausted',
  nogo_inside_consolidation:'Tight Consolidation', nogo_holiday:'Holiday / Low Liquidity',
  /* Psychology */
  psy_wait_full_setup:'Wait for Full Setup', psy_no_fomo:'No FOMO',
  psy_accept_loss:'Accept the Loss', psy_no_tilt:'No Emotional Tilt',
  psy_journal_before:'Journal Before Entry', psy_screenshot_setup:'Screenshot Setup',
  psy_1_at_a_time:'One Trade at a Time', psy_break_after_win:'Break After Win',
  psy_break_after_loss:'Break After Loss', psy_daily_max_reached:'Respect Daily Max',
  psy_no_overnight:'No Overnight Positions', psy_pre_session_analysis:'Pre-Session Analysis Done',
  /* Instruments */
  us100:'US100', us30:'US30', spx500:'SPX500', xauusd:'XAUUSD',
  eurusd:'EUR/USD', gbpusd:'GBP/USD', usdjpy:'USD/JPY', gbpjpy:'GBP/JPY',
  btcusd:'BTC/USD', ethusd:'ETH/USD'
};
function label(v){ return LABELS[v] || v; }

/* ═══════════════════════════════════════════════════════════════════════════
   EXECUTION CHECKLIST — Generate dynamic checklist from strategy
   Returns an array of { category, items:[ { id, text, critical } ] }
   ═══════════════════════════════════════════════════════════════════════════ */
function generateChecklistFromStrategy(stratId){
  var s = getStrategy(stratId);
  if(!s) return [];
  var sections = [];

  /* 1 — Market Structure & Bias */
  var biasItems = [];
  if(s.htfBias && s.htfBias.length){
    biasItems.push({ id:'htf_bias', text:'HTF bias confirmed: ' + s.htfBias.map(label).join(' or '), critical:true });
  }
  if(s.direction && s.direction.length){
    biasItems.push({ id:'direction', text:'Direction aligns with strategy: ' + s.direction.map(label).join(' / '), critical:true });
  }
  if(s.htfTimeframe){
    biasItems.push({ id:'htf_tf', text:'HTF (' + s.htfTimeframe + ') structure analyzed', critical:false });
  }
  if(biasItems.length) sections.push({ category:'Market Structure & Bias', items:biasItems });

  /* 2 — Setup Model */
  var setupItems = [];
  if(s.setupType && s.setupType.length){
    setupItems.push({ id:'setup_type', text:'Setup matches: ' + s.setupType.map(label).join(' or '), critical:true });
  }
  if(s.narrative){
    setupItems.push({ id:'narrative', text:'Setup narrative confirmed: "' + s.narrative.substring(0,80) + (s.narrative.length > 80 ? '...' : '') + '"', critical:false });
  }
  if(setupItems.length) sections.push({ category:'Setup Model', items:setupItems });

  /* 3 — Multi-TF Analysis */
  var mtfItems = [];
  if(s.htfRole){
    mtfItems.push({ id:'htf_role', text:'HTF role verified: ' + s.htfRole.substring(0,60), critical:true });
  }
  if(s.mtfRole){
    mtfItems.push({ id:'mtf_role', text:'MTF role verified: ' + s.mtfRole.substring(0,60), critical:false });
  }
  if(s.ltfRole){
    mtfItems.push({ id:'ltf_role', text:'LTF role verified: ' + s.ltfRole.substring(0,60), critical:true });
  }
  if(mtfItems.length) sections.push({ category:'Multi-TF Analysis', items:mtfItems });

  /* 4 — Liquidity & Entry Conditions */
  var entryItems = [];
  if(s.entryLiq && s.entryLiq.length){
    s.entryLiq.forEach(function(v){
      entryItems.push({ id:'liq_' + v, text:'Liquidity: ' + label(v) + ' observed', critical:true });
    });
  }
  if(s.entryDisp && s.entryDisp.length){
    s.entryDisp.forEach(function(v){
      entryItems.push({ id:'disp_' + v, text:'Displacement: ' + label(v) + ' present', critical:true });
    });
  }
  if(s.entryZones && s.entryZones.length){
    entryItems.push({ id:'zones', text:'Entry zone identified: ' + s.entryZones.map(label).join(' or '), critical:true });
  }
  if(s.entryCycle && s.entryCycle.length){
    entryItems.push({ id:'cycle', text:'Market cycle phase: ' + s.entryCycle.map(label).join(' or '), critical:false });
  }
  if(entryItems.length) sections.push({ category:'Entry Conditions', items:entryItems });

  /* 5 — POI */
  var poiItems = [];
  if(s.poi && s.poi.length){
    s.poi.forEach(function(v){
      poiItems.push({ id:'poi_' + v, text:'POI valid: ' + label(v), critical:true });
    });
  }
  if(poiItems.length) sections.push({ category:'Point of Interest', items:poiItems });

  /* 6 — Entry Trigger */
  var triggerItems = [];
  if(s.entryMethod && s.entryMethod.length){
    triggerItems.push({ id:'entry_method', text:'Entry method: ' + s.entryMethod.map(label).join(' or '), critical:false });
  }
  if(s.pullbackDepth && s.pullbackDepth.length){
    triggerItems.push({ id:'pullback_depth', text:'Pullback depth: ' + s.pullbackDepth.map(label).join(' or '), critical:false });
  }
  if(triggerItems.length) sections.push({ category:'Entry Trigger', items:triggerItems });

  /* 7 — Confirmations */
  var confItems = [];
  if(s.confirmations && s.confirmations.length){
    s.confirmations.forEach(function(v){
      confItems.push({ id:'conf_' + v, text:label(v) + ' confirmed', critical:true });
    });
  }
  if(confItems.length) sections.push({ category:'Confirmations', items:confItems });

  /* 8 — Invalidation (these are DANGER checks — if checked = do NOT trade) */
  var invItems = [];
  if(s.invalidation && s.invalidation.length){
    s.invalidation.forEach(function(v){
      invItems.push({ id:'inv_' + v, text:label(v), critical:true, danger:true });
    });
  }
  if(invItems.length) sections.push({ category:'Invalidation (if ANY = NO TRADE)', items:invItems, danger:true });

  /* 9 — Session & Timing */
  var timeItems = [];
  if(s.sessions && s.sessions.length){
    timeItems.push({ id:'session', text:'Current session is: ' + s.sessions.map(label).join(' / '), critical:true });
  }
  if(s.days && s.days.length){
    timeItems.push({ id:'day', text:'Current day is allowed: ' + s.days.map(label).join(', '), critical:false });
  }
  if(s.filters && s.filters.length){
    s.filters.forEach(function(v){
      timeItems.push({ id:'filter_' + v, text:'Filter OK: ' + label(v), critical:false });
    });
  }
  if(timeItems.length) sections.push({ category:'Session & Timing', items:timeItems });

  /* 10 — Market Environment */
  var envItems = [];
  if(s.marketEnv && s.marketEnv.length){
    envItems.push({ id:'market_env', text:'Market environment is: ' + s.marketEnv.map(label).join(' or '), critical:false });
  }
  if(s.marketInvalid && s.marketInvalid.length){
    s.marketInvalid.forEach(function(v){
      envItems.push({ id:'nogo_' + v, text:'NO-GO: ' + label(v) + ' not present', critical:true, danger:true });
    });
  }
  if(envItems.length) sections.push({ category:'Market Environment', items:envItems });

  /* 11 — Risk Rules */
  var riskItems = [];
  if(s.minRR){
    riskItems.push({ id:'min_rr', text:'Minimum RR met: ' + s.minRR + 'R', critical:true });
  }
  if(s.riskPct){
    riskItems.push({ id:'risk_pct', text:'Risk per trade: max ' + s.riskPct + '%', critical:true });
  }
  if(s.maxTrades){
    riskItems.push({ id:'max_trades', text:'Daily trade limit not exceeded (' + s.maxTrades + ')', critical:false });
  }
  if(s.riskRules && s.riskRules.length){
    s.riskRules.forEach(function(v){
      riskItems.push({ id:'risk_' + v, text:label(v), critical:false });
    });
  }
  if(riskItems.length) sections.push({ category:'Risk Management', items:riskItems });

  /* 12 — Psychology */
  var psyItems = [];
  if(s.psychology && s.psychology.length){
    s.psychology.forEach(function(v){
      psyItems.push({ id:'psy_' + v, text:label(v), critical:false });
    });
  }
  if(psyItems.length) sections.push({ category:'Psychology & Discipline', items:psyItems });

  /* 13 — Custom Pre-Trade Checklist */
  var custItems = [];
  if(s.checklist && s.checklist.length){
    s.checklist.forEach(function(v, i){
      custItems.push({ id:'custom_' + i, text:v, critical:false });
    });
  }
  if(custItems.length) sections.push({ category:'Custom Pre-Trade Checklist', items:custItems });

  return sections;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRADE COMPLIANCE SCANNER — check a logged trade against strategy rules
   Returns { score:0-100, checks:[ {label, pass, detail} ], verdict }
   ═══════════════════════════════════════════════════════════════════════════ */
function scanTradeCompliance(trade, stratId){
  var s = getStrategy(stratId);
  if(!s) return { score:0, checks:[], verdict:'no_strategy' };

  var checks = [];
  var passed = 0;
  var total = 0;

  /* 1 — Direction check */
  if(s.direction && s.direction.length && trade.direction){
    total++;
    var dirOk = s.direction.indexOf(trade.direction) !== -1;
    checks.push({ label:'Direction', pass:dirOk, detail:dirOk ? trade.direction.toUpperCase() + ' matches strategy' : trade.direction.toUpperCase() + ' not in strategy' });
    if(dirOk) passed++;
  }

  /* 2 — RR check */
  if(s.minRR && trade.entryPrice && trade.exitPrice && trade.sl){
    total++;
    var entry = parseFloat(trade.entryPrice);
    var exit = parseFloat(trade.exitPrice);
    var sl = parseFloat(trade.sl);
    var risk = Math.abs(entry - sl);
    var reward = 0;
    if(risk > 0){
      if(trade.direction === 'long') reward = exit - entry;
      else reward = entry - exit;
    }
    var rr = risk > 0 ? reward / risk : 0;
    var rrOk = rr >= s.minRR;
    checks.push({ label:'Risk:Reward', pass:rrOk, detail:'RR: ' + rr.toFixed(2) + 'R (min: ' + s.minRR + 'R)' });
    if(rrOk) passed++;
  }

  /* 3 — Session check */
  if(s.sessions && s.sessions.length && trade.entryTime){
    total++;
    var hour = new Date(trade.entryTime).getUTCHours();
    var inSession = false;
    var sessionName = '';
    // Approximate session hours (UTC)
    if(s.sessions.indexOf('asia') !== -1 && hour >= 0 && hour < 8){ inSession = true; sessionName = 'Asia'; }
    if(s.sessions.indexOf('london_open') !== -1 && hour >= 7 && hour < 12){ inSession = true; sessionName = 'London'; }
    if(s.sessions.indexOf('ny_am') !== -1 && hour >= 13 && hour < 17){ inSession = true; sessionName = 'NY AM'; }
    if(s.sessions.indexOf('ny_pm') !== -1 && hour >= 17 && hour < 21){ inSession = true; sessionName = 'NY PM'; }
    if(s.sessions.indexOf('lo_ny_overlap') !== -1 && hour >= 12 && hour < 16){ inSession = true; sessionName = 'LO/NY'; }
    checks.push({ label:'Session', pass:inSession, detail:inSession ? 'Trade in ' + sessionName + ' session' : 'Entry at ' + hour + ':00 UTC outside allowed sessions' });
    if(inSession) passed++;
  }

  /* 4 — Day of week check */
  if(s.days && s.days.length && trade.entryTime){
    total++;
    var dayMap = ['sun','mon','tue','wed','thu','fri','sat'];
    var tradeDay = dayMap[new Date(trade.entryTime).getDay()];
    var dayOk = s.days.indexOf(tradeDay) !== -1;
    checks.push({ label:'Day', pass:dayOk, detail:dayOk ? tradeDay.charAt(0).toUpperCase() + tradeDay.slice(1) + ' is allowed' : tradeDay.charAt(0).toUpperCase() + tradeDay.slice(1) + ' not in strategy' });
    if(dayOk) passed++;
  }

  /* 5 — Risk % check (if lot size and account info available) */
  if(s.riskPct && trade.sl && trade.entryPrice){
    total++;
    var entryP = parseFloat(trade.entryPrice);
    var slP = parseFloat(trade.sl);
    var riskPips = Math.abs(entryP - slP);
    // We can only check if SL is set (risk exists)
    var hasRisk = riskPips > 0;
    checks.push({ label:'Risk Control', pass:hasRisk, detail:hasRisk ? 'Stop loss set (' + riskPips.toFixed(1) + ' pts from entry)' : 'No stop loss distance detected' });
    if(hasRisk) passed++;
  }

  /* 6 — Instrument check */
  if(s.instruments && s.instruments.length && trade.symbol){
    total++;
    var sym = trade.symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
    var instrOk = s.instruments.some(function(ins){ return sym.indexOf(ins.toLowerCase().replace(/[^a-z0-9]/g, '')) !== -1; });
    checks.push({ label:'Instrument', pass:instrOk, detail:instrOk ? trade.symbol + ' is in strategy instruments' : trade.symbol + ' not in strategy instruments' });
    if(instrOk) passed++;
  }

  /* 7 — TP set check */
  if(s.tpType && trade.tp){
    total++;
    var tpSet = parseFloat(trade.tp) > 0 || parseFloat(trade.tp) !== parseFloat(trade.entryPrice);
    checks.push({ label:'Take Profit', pass:tpSet, detail:tpSet ? 'TP target set' : 'No TP target' });
    if(tpSet) passed++;
  }

  var score = total > 0 ? Math.round((passed / total) * 100) : 0;
  var verdict = 'no_data';
  if(total > 0){
    if(score >= 80) verdict = 'compliant';
    else if(score >= 50) verdict = 'partial';
    else verdict = 'non_compliant';
  }

  return { score:score, checks:checks, passed:passed, total:total, verdict:verdict };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════════════════════ */
window.AltivorCompliance = {
  loadStrategies: loadStrategies,
  getStrategy: getStrategy,
  label: label,
  generateChecklistFromStrategy: generateChecklistFromStrategy,
  scanTradeCompliance: scanTradeCompliance
};

})();
