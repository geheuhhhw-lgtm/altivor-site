/* ═══════════════════════════════════════════════════════════════════════════
   ALTIVOR INSTITUTE — Execution Checklist Engine v1
   Dynamic strategy-based execution checklist with two-layer gating.

   Layer 1: Strategy-Specific Validation (auto-generated from Strategy Builder)
   Layer 2: Standard 6-Point Execution Checklist (unlocked after Layer 1)

   Reads strategy definitions from AltivorCompliance / altivor_strategies_v1.
   Stores checklist answers with trade for audit trail.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ═══ IMPORTANCE LEVELS ═══════════════════════════════════════════════════
  var REQUIRED = 'REQUIRED';
  var OPTIONAL = 'OPTIONAL';
  var CONTEXT  = 'CONTEXT';

  // ═══ QUESTION TYPES ═════════════════════════════════════════════════════
  var BOOL     = 'boolean';
  var NUMERIC  = 'numeric';
  var CHOICE   = 'choice';
  var SESSION  = 'session';
  var DOC      = 'documentation';

  // ═══ LABEL MAP (reuse from AltivorCompliance if available) ═════════════
  function lbl(v) {
    if (window.AltivorCompliance && window.AltivorCompliance.label) return window.AltivorCompliance.label(v);
    return String(v || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // ═══ HELPERS ════════════════════════════════════════════════════════════
  function getStrategy(id) {
    if (window.AltivorCompliance && window.AltivorCompliance.getStrategy) return window.AltivorCompliance.getStrategy(id);
    try { var all = JSON.parse(localStorage.getItem('altivor_strategies_v1')) || []; return all.find(function (s) { return s.id === id; }); } catch (e) { return null; }
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATE LAYER 1 — Strategy-Specific Validation Questions
  // Returns array of sections, each: { category, items: [...] }
  // Each item: { id, text, type, importance, options?, min?, danger? }
  // ═══════════════════════════════════════════════════════════════════════════

  function generateStrategyQuestions(stratId) {
    var s = getStrategy(stratId);
    if (!s) return [];
    var sections = [];

    // ── STRUCTURE & BIAS ─────────────────────────────────────────────
    var biasQ = [];
    if (s.htfBias && s.htfBias.length) {
      biasQ.push({ id: 'htf_bias', text: 'Is HTF bias confirmed (' + s.htfBias.map(lbl).join(' / ') + ')?', type: BOOL, importance: REQUIRED });
    }
    if (s.direction && s.direction.length) {
      biasQ.push({ id: 'direction_aligned', text: 'Is market structure aligned with trade direction (' + s.direction.map(lbl).join(' / ') + ')?', type: BOOL, importance: REQUIRED });
    }
    if (s.htfTimeframe) {
      biasQ.push({ id: 'htf_tf_analyzed', text: 'Has HTF (' + s.htfTimeframe + ') structure been analyzed?', type: BOOL, importance: OPTIONAL });
    }
    if (s.htfRole) {
      biasQ.push({ id: 'htf_role_verified', text: 'Is HTF role verified: "' + s.htfRole.substring(0, 60) + '"?', type: BOOL, importance: REQUIRED });
    }
    if (s.ltfRole) {
      biasQ.push({ id: 'ltf_role_verified', text: 'Is LTF role verified: "' + s.ltfRole.substring(0, 60) + '"?', type: BOOL, importance: REQUIRED });
    }
    if (s.mtfRole) {
      biasQ.push({ id: 'mtf_role_verified', text: 'Is MTF role verified: "' + s.mtfRole.substring(0, 60) + '"?', type: BOOL, importance: OPTIONAL });
    }
    if (biasQ.length) sections.push({ category: 'Market Structure & Bias', items: biasQ });

    // ── SETUP MODEL ──────────────────────────────────────────────────
    var setupQ = [];
    if (s.setupType && s.setupType.length) {
      if (s.setupType.length === 1) {
        setupQ.push({ id: 'setup_confirmed', text: 'Has ' + lbl(s.setupType[0]) + ' setup been confirmed?', type: BOOL, importance: REQUIRED });
      } else {
        setupQ.push({ id: 'setup_type_match', text: 'Which setup triggered this trade?', type: CHOICE, importance: REQUIRED, options: s.setupType.map(function (v) { return { value: v, label: lbl(v) }; }) });
      }
    }
    if (s.narrative) {
      setupQ.push({ id: 'narrative_confirmed', text: 'Does setup match the defined narrative?', type: BOOL, importance: CONTEXT });
    }
    if (setupQ.length) sections.push({ category: 'Setup Validation', items: setupQ });

    // ── LIQUIDITY ────────────────────────────────────────────────────
    var liqQ = [];
    if (s.entryLiq && s.entryLiq.length) {
      s.entryLiq.forEach(function (v) {
        liqQ.push({ id: 'liq_' + v, text: 'Has liquidity been swept (' + lbl(v) + ')?', type: BOOL, importance: REQUIRED });
      });
    }
    if (liqQ.length) sections.push({ category: 'Liquidity', items: liqQ });

    // ── DISPLACEMENT & ENTRY CONDITIONS ──────────────────────────────
    var dispQ = [];
    if (s.entryDisp && s.entryDisp.length) {
      s.entryDisp.forEach(function (v) {
        var isFVG = v.indexOf('fvg') >= 0;
        dispQ.push({ id: 'disp_' + v, text: isFVG ? 'Is there a valid FVG / imbalance present?' : 'Has ' + lbl(v) + ' been observed?', type: BOOL, importance: REQUIRED });
      });
    }
    if (s.entryZones && s.entryZones.length) {
      s.entryZones.forEach(function (v) {
        dispQ.push({ id: 'zone_' + v, text: 'Is price reacting from a valid ' + lbl(v) + '?', type: BOOL, importance: REQUIRED });
      });
    }
    if (s.entryCycle && s.entryCycle.length) {
      dispQ.push({ id: 'cycle_phase', text: 'Is market in the correct cycle phase (' + s.entryCycle.map(lbl).join(' / ') + ')?', type: BOOL, importance: OPTIONAL });
    }
    if (dispQ.length) sections.push({ category: 'Entry Conditions', items: dispQ });

    // ── POINT OF INTEREST ────────────────────────────────────────────
    var poiQ = [];
    if (s.poi && s.poi.length) {
      s.poi.forEach(function (v) {
        var fresh = v.indexOf('fresh') >= 0;
        poiQ.push({ id: 'poi_' + v, text: fresh ? 'Is the POI fresh and unmitigated?' : 'Is POI valid (' + lbl(v) + ')?', type: BOOL, importance: REQUIRED });
      });
    }
    if (poiQ.length) sections.push({ category: 'Point of Interest', items: poiQ });

    // ── CONFIRMATIONS ────────────────────────────────────────────────
    var confQ = [];
    if (s.confirmations && s.confirmations.length) {
      s.confirmations.forEach(function (v) {
        confQ.push({ id: 'conf_' + v, text: 'Has ' + lbl(v) + ' been confirmed?', type: BOOL, importance: REQUIRED });
      });
    }
    if (confQ.length) sections.push({ category: 'Confirmations', items: confQ });

    // ── CONFLUENCES ──────────────────────────────────────────────────
    var conflQ = [];
    if (s.confluences && s.confluences.length) {
      s.confluences.forEach(function (v) {
        conflQ.push({ id: 'confl_' + v, text: lbl(v) + ' present?', type: BOOL, importance: OPTIONAL });
      });
    }
    if (conflQ.length) sections.push({ category: 'Confluences', items: conflQ });

    // ── ENTRY TRIGGER ────────────────────────────────────────────────
    var trigQ = [];
    if (s.entryMethod && s.entryMethod.length) {
      if (s.entryMethod.length === 1) {
        trigQ.push({ id: 'entry_method', text: 'Was entry taken via ' + lbl(s.entryMethod[0]) + '?', type: BOOL, importance: OPTIONAL });
      } else {
        trigQ.push({ id: 'entry_method', text: 'Entry method used?', type: CHOICE, importance: OPTIONAL, options: s.entryMethod.map(function (v) { return { value: v, label: lbl(v) }; }) });
      }
    }
    if (s.pullbackDepth && s.pullbackDepth.length) {
      trigQ.push({ id: 'pullback_depth', text: 'Was there a pullback before entry (' + s.pullbackDepth.map(lbl).join(' / ') + ')?', type: BOOL, importance: OPTIONAL });
    }
    if (trigQ.length) sections.push({ category: 'Entry Trigger', items: trigQ });

    // ── INVALIDATION (danger — "No" = good, "Yes" = trade invalid) ──
    var invQ = [];
    if (s.invalidation && s.invalidation.length) {
      s.invalidation.forEach(function (v) {
        invQ.push({ id: 'inv_' + v, text: 'Has ' + lbl(v) + ' occurred?', type: BOOL, importance: REQUIRED, danger: true });
      });
    }
    if (invQ.length) sections.push({ category: 'Invalidation Checks', items: invQ, danger: true });

    // ── SESSION & TIMING ─────────────────────────────────────────────
    var timeQ = [];
    if (s.sessions && s.sessions.length) {
      timeQ.push({ id: 'session_allowed', text: 'Is this trade inside the allowed session window (' + s.sessions.map(lbl).join(', ') + ')?', type: BOOL, importance: REQUIRED });
    }
    if (s.days && s.days.length) {
      timeQ.push({ id: 'day_allowed', text: 'Is today an allowed trading day (' + s.days.map(lbl).join(', ') + ')?', type: BOOL, importance: OPTIONAL });
    }
    if (s.filters && s.filters.length) {
      s.filters.forEach(function (v) {
        timeQ.push({ id: 'filter_' + v, text: 'Filter: ' + lbl(v) + ' satisfied?', type: BOOL, importance: OPTIONAL });
      });
    }
    if (timeQ.length) sections.push({ category: 'Session & Timing', items: timeQ });

    // ── MARKET ENVIRONMENT ───────────────────────────────────────────
    var envQ = [];
    if (s.marketEnv && s.marketEnv.length) {
      envQ.push({ id: 'market_env', text: 'Is the market environment correct (' + s.marketEnv.map(lbl).join(' / ') + ')?', type: BOOL, importance: OPTIONAL });
    }
    if (s.marketInvalid && s.marketInvalid.length) {
      s.marketInvalid.forEach(function (v) {
        envQ.push({ id: 'nogo_' + v, text: 'Is NO-GO condition present: ' + lbl(v) + '?', type: BOOL, importance: REQUIRED, danger: true });
      });
    }
    if (envQ.length) sections.push({ category: 'Market Environment', items: envQ });

    // ── RISK MANAGEMENT ──────────────────────────────────────────────
    var riskQ = [];
    if (s.minRR) {
      riskQ.push({ id: 'min_rr', text: 'Does this trade meet the minimum RR requirement (' + s.minRR + 'R)?', type: NUMERIC, importance: REQUIRED, min: parseFloat(s.minRR), unit: 'R' });
    }
    if (s.riskPct) {
      riskQ.push({ id: 'risk_within_limit', text: 'Is risk within the strategy limit (max ' + s.riskPct + '%)?', type: BOOL, importance: REQUIRED });
    }
    if (s.maxTrades) {
      riskQ.push({ id: 'daily_limit', text: 'Is the daily trade limit not exceeded (' + s.maxTrades + ' max)?', type: BOOL, importance: OPTIONAL });
    }
    riskQ.push({ id: 'sl_defined', text: 'Is stop loss defined before entry?', type: BOOL, importance: REQUIRED });
    riskQ.push({ id: 'sl_structural', text: 'Is the stop loss placed at a structural invalidation level?', type: BOOL, importance: OPTIONAL });
    if (s.riskRules && s.riskRules.length) {
      s.riskRules.forEach(function (v) {
        riskQ.push({ id: 'rrule_' + v, text: lbl(v) + '?', type: BOOL, importance: OPTIONAL });
      });
    }
    if (riskQ.length) sections.push({ category: 'Risk Management', items: riskQ });

    // ── TRADE MANAGEMENT ─────────────────────────────────────────────
    var mgmtQ = [];
    if (s.management && s.management.length) {
      s.management.forEach(function (v) {
        mgmtQ.push({ id: 'mgmt_' + v, text: lbl(v) + ' planned?', type: BOOL, importance: CONTEXT });
      });
    }
    if (s.tpType) {
      mgmtQ.push({ id: 'tp_defined', text: 'Is take profit defined before entry?', type: BOOL, importance: REQUIRED });
    }
    if (mgmtQ.length) sections.push({ category: 'Trade Management', items: mgmtQ });

    // ── PSYCHOLOGY ────────────────────────────────────────────────────
    var psyQ = [];
    if (s.psychology && s.psychology.length) {
      s.psychology.forEach(function (v) {
        psyQ.push({ id: 'psy_' + v, text: lbl(v) + '?', type: BOOL, importance: OPTIONAL });
      });
    }
    if (psyQ.length) sections.push({ category: 'Psychology & Discipline', items: psyQ });

    // ── DOCUMENTATION ────────────────────────────────────────────────
    var docQ = [];
    docQ.push({ id: 'screenshot_ready', text: 'Is screenshot or chart capture prepared?', type: BOOL, importance: OPTIONAL });
    docQ.push({ id: 'notes_ready', text: 'Are trade notes / reasoning documented?', type: BOOL, importance: CONTEXT });
    sections.push({ category: 'Documentation', items: docQ });

    // ── CUSTOM PRE-TRADE CHECKLIST ───────────────────────────────────
    var custQ = [];
    if (s.checklist && s.checklist.length) {
      s.checklist.forEach(function (v, i) {
        custQ.push({ id: 'custom_' + i, text: v, type: BOOL, importance: OPTIONAL });
      });
    }
    if (custQ.length) sections.push({ category: 'Custom Pre-Trade Rules', items: custQ });

    return sections;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // STANDARD 6-POINT EXECUTION CHECKLIST (Layer 2)
  // ═══════════════════════════════════════════════════════════════════════════

  function getStandard6Point() {
    return [
      { id: 'std_strategy', text: 'Strategy / framework selected', importance: REQUIRED },
      { id: 'std_sl',       text: 'Stop loss defined at entry', importance: REQUIRED },
      { id: 'std_tp',       text: 'Take profit defined at entry', importance: REQUIRED },
      { id: 'std_risk',     text: 'Risk within allowed limit (≤2%)', importance: REQUIRED },
      { id: 'std_entry',    text: 'Entry confirmed — not impulsive', importance: REQUIRED },
      { id: 'std_docs',     text: 'Screenshot or notes prepared', importance: REQUIRED }
    ];
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // EVALUATE ANSWERS
  // ═══════════════════════════════════════════════════════════════════════════

  function evaluateLayer1(sections, answers) {
    var requiredTotal = 0, requiredPassed = 0;
    var optionalTotal = 0, optionalPassed = 0;
    var contextTotal = 0, contextAnswered = 0;
    var failedRequired = [];
    var optionalWarnings = [];
    var contextNotes = [];
    var dangerTriggered = [];

    sections.forEach(function (sec) {
      sec.items.forEach(function (item) {
        var ans = answers[item.id];
        var answered = ans !== undefined && ans !== null && ans !== '';

        if (item.importance === REQUIRED) {
          requiredTotal++;
          if (item.danger) {
            // Danger items: "Yes" = FAIL (invalidation present)
            if (ans === true || ans === 'yes') {
              dangerTriggered.push({ id: item.id, text: item.text, category: sec.category });
            } else if (ans === false || ans === 'no') {
              requiredPassed++;
            }
            // unanswered danger = not passed
          } else if (item.type === NUMERIC) {
            if (answered && item.min !== undefined && parseFloat(ans) >= item.min) {
              requiredPassed++;
            } else {
              failedRequired.push({ id: item.id, text: item.text, category: sec.category, reason: answered ? 'Value ' + ans + ' below minimum ' + item.min + (item.unit || '') : 'Not answered' });
            }
          } else if (item.type === CHOICE) {
            if (answered && ans !== '') {
              requiredPassed++;
            } else {
              failedRequired.push({ id: item.id, text: item.text, category: sec.category, reason: 'No selection made' });
            }
          } else {
            // Boolean
            if (ans === true || ans === 'yes') {
              requiredPassed++;
            } else if (ans === false || ans === 'no') {
              failedRequired.push({ id: item.id, text: item.text, category: sec.category, reason: 'Requirement not confirmed' });
            } else {
              failedRequired.push({ id: item.id, text: item.text, category: sec.category, reason: 'Not answered' });
            }
          }
        } else if (item.importance === OPTIONAL) {
          optionalTotal++;
          if (item.danger) {
            if (ans === true || ans === 'yes') {
              optionalWarnings.push({ id: item.id, text: item.text, category: sec.category });
            } else {
              optionalPassed++;
            }
          } else if (ans === true || ans === 'yes' || (answered && item.type === CHOICE) || (answered && item.type === NUMERIC)) {
            optionalPassed++;
          } else if (ans === false || ans === 'no') {
            optionalWarnings.push({ id: item.id, text: item.text, category: sec.category });
          }
        } else {
          // CONTEXT
          contextTotal++;
          if (answered) {
            contextAnswered++;
            contextNotes.push({ id: item.id, text: item.text, answer: ans });
          }
        }
      });
    });

    // Danger triggers count as failed required
    dangerTriggered.forEach(function (d) {
      failedRequired.push({ id: d.id, text: d.text, category: d.category, reason: 'Invalidation condition triggered' });
    });

    var allRequiredPassed = failedRequired.length === 0 && dangerTriggered.length === 0;
    var requiredScore = requiredTotal > 0 ? Math.round((requiredPassed / requiredTotal) * 100) : 100;
    var optionalScore = optionalTotal > 0 ? Math.round((optionalPassed / optionalTotal) * 100) : 100;

    return {
      passed: allRequiredPassed,
      requiredTotal: requiredTotal,
      requiredPassed: requiredPassed,
      requiredScore: requiredScore,
      optionalTotal: optionalTotal,
      optionalPassed: optionalPassed,
      optionalScore: optionalScore,
      contextTotal: contextTotal,
      contextAnswered: contextAnswered,
      failedRequired: failedRequired,
      optionalWarnings: optionalWarnings,
      contextNotes: contextNotes,
      dangerTriggered: dangerTriggered
    };
  }

  function evaluateLayer2(answers) {
    var items = getStandard6Point();
    var passed = 0;
    var failed = [];
    items.forEach(function (item) {
      if (answers[item.id] === true) {
        passed++;
      } else {
        failed.push({ id: item.id, text: item.text });
      }
    });
    return { passed: passed, total: items.length, allPassed: failed.length === 0, failed: failed };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD TRADE CHECKLIST DATA — snapshot for storage
  // ═══════════════════════════════════════════════════════════════════════════

  function buildChecklistSnapshot(stratId, sections, layer1Answers, layer2Answers, layer1Result, layer2Result) {
    var s = getStrategy(stratId);
    return {
      selectedStrategyId: stratId,
      strategyName: s ? s.name : '',
      strategyRuleSnapshot: s ? JSON.parse(JSON.stringify(s)) : null,
      generatedQuestions: sections,
      layer1Answers: layer1Answers,
      layer2Answers: layer2Answers,
      layer1Result: layer1Result,
      layer2Result: layer2Result,
      failedRequiredRules: layer1Result ? layer1Result.failedRequired : [],
      optionalWarnings: layer1Result ? layer1Result.optionalWarnings : [],
      contextNotes: layer1Result ? layer1Result.contextNotes : [],
      checklistPassed: layer1Result && layer1Result.passed && layer2Result && layer2Result.allPassed,
      complianceStatus: (layer1Result && layer1Result.passed && layer2Result && layer2Result.allPassed) ? 'compliant' : (layer1Result && layer1Result.passed) ? 'partial' : 'non_compliant',
      nonCompliantFlag: !(layer1Result && layer1Result.passed),
      timestamp: new Date().toISOString()
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER LAYER 1 — Strategy-Specific Validation
  // ═══════════════════════════════════════════════════════════════════════════

  function renderLayer1(containerId, stratId, onComplete) {
    var el = document.getElementById(containerId);
    if (!el) return;

    var sections = generateStrategyQuestions(stratId);
    if (sections.length === 0) {
      el.style.display = 'none';
      if (onComplete) onComplete(true, {}, null);
      return;
    }

    var s = getStrategy(stratId);
    var answers = {};
    var html = '';

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem;">';
    html += '<div style="display:flex;align-items:center;gap:.5rem;">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(214,190,150,0.7)" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
    html += '<span style="font-size:.8rem;font-weight:700;color:var(--txt-primary);letter-spacing:.03em;">STRATEGY VALIDATION</span>';
    html += '</div>';
    html += '<span style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;padding:3px 10px;border-radius:100px;background:rgba(96,165,250,0.08);color:rgba(96,165,250,0.9);border:1px solid rgba(96,165,250,0.2);">' + esc(s ? s.name : 'Strategy') + '</span>';
    html += '</div>';

    // Status bar
    html += '<div id="ecL1Status" style="font-size:.68rem;color:var(--txt-muted);margin-bottom:.75rem;">Answer all required questions to unlock the Execution Checklist.</div>';

    // Sections
    sections.forEach(function (sec, si) {
      var isDanger = sec.danger;
      var borderColor = isDanger ? 'rgba(239,68,68,0.15)' : 'var(--border-default)';
      html += '<div style="margin-bottom:.75rem;padding:.6rem .75rem;background:var(--bg-card);border:1px solid ' + borderColor + ';border-radius:8px;">';
      html += '<div style="font-size:.65rem;font-weight:700;color:' + (isDanger ? 'rgba(239,68,68,0.8)' : 'var(--txt-muted)') + ';text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem;">' + esc(sec.category) + '</div>';

      sec.items.forEach(function (item, ii) {
        var uid = 'ecl1_' + si + '_' + ii;
        var impColor = item.importance === REQUIRED ? 'rgba(239,68,68,0.7)' : item.importance === OPTIONAL ? 'rgba(234,179,8,0.7)' : 'rgba(140,140,140,0.5)';
        var impLabel = item.importance === REQUIRED ? 'REQ' : item.importance === OPTIONAL ? 'OPT' : 'CTX';

        html += '<div style="display:flex;align-items:flex-start;gap:.5rem;padding:.3rem 0;border-bottom:1px solid rgba(255,255,255,0.02);" data-ec-item="' + item.id + '">';
        html += '<span style="font-size:.5rem;font-weight:700;padding:1px 4px;border-radius:3px;background:rgba(0,0,0,0.2);color:' + impColor + ';margin-top:2px;flex-shrink:0;">' + impLabel + '</span>';
        html += '<div style="flex:1;font-size:.72rem;color:var(--txt-secondary);line-height:1.4;">' + esc(item.text) + '</div>';

        // Input control
        if (item.type === NUMERIC) {
          html += '<input type="number" id="' + uid + '" step="0.1" min="0" placeholder="' + (item.min || '0') + '" style="width:60px;padding:.2rem .4rem;font-size:.72rem;background:var(--bg-base);border:1px solid var(--border-default);border-radius:4px;color:var(--txt-primary);text-align:center;" data-ec-input="' + item.id + '" data-ec-type="numeric" />';
        } else if (item.type === CHOICE) {
          html += '<select id="' + uid + '" style="width:auto;max-width:140px;padding:.2rem .3rem;font-size:.68rem;background:var(--bg-base);border:1px solid var(--border-default);border-radius:4px;color:var(--txt-primary);" data-ec-input="' + item.id + '" data-ec-type="choice">';
          html += '<option value="">Select...</option>';
          (item.options || []).forEach(function (opt) {
            html += '<option value="' + esc(opt.value) + '">' + esc(opt.label) + '</option>';
          });
          html += '</select>';
        } else {
          // Boolean — Yes/No toggle
          html += '<div style="display:flex;gap:.15rem;" data-ec-toggle="' + item.id + '">';
          html += '<button type="button" data-ec-val="yes" data-ec-for="' + item.id + '" style="font-size:.58rem;font-weight:700;padding:2px 8px;border-radius:4px;border:1px solid var(--border-default);background:var(--bg-base);color:var(--txt-muted);cursor:pointer;transition:all .15s;">YES</button>';
          html += '<button type="button" data-ec-val="no" data-ec-for="' + item.id + '" style="font-size:.58rem;font-weight:700;padding:2px 8px;border-radius:4px;border:1px solid var(--border-default);background:var(--bg-base);color:var(--txt-muted);cursor:pointer;transition:all .15s;">NO</button>';
          html += '</div>';
        }
        html += '</div>';
      });

      html += '</div>';
    });

    // Result footer
    html += '<div id="ecL1Result" style="display:none;margin-top:.75rem;padding:.5rem .75rem;border-radius:8px;font-size:.72rem;"></div>';
    html += '<div id="ecL1Override" style="display:none;margin-top:.5rem;"></div>';

    el.innerHTML = html;
    el.style.display = 'block';

    // ── Wire up event handlers ───────────────────────────────────────
    // Boolean toggles
    el.querySelectorAll('button[data-ec-val]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var itemId = btn.getAttribute('data-ec-for');
        var val = btn.getAttribute('data-ec-val');
        answers[itemId] = val === 'yes';

        // Style active state
        var container = btn.parentElement;
        container.querySelectorAll('button').forEach(function (b) {
          b.style.background = 'var(--bg-base)';
          b.style.color = 'var(--txt-muted)';
          b.style.borderColor = 'var(--border-default)';
        });
        if (val === 'yes') {
          btn.style.background = 'rgba(34,197,94,0.12)';
          btn.style.color = 'rgba(34,197,94,0.9)';
          btn.style.borderColor = 'rgba(34,197,94,0.3)';
        } else {
          btn.style.background = 'rgba(239,68,68,0.08)';
          btn.style.color = 'rgba(239,68,68,0.8)';
          btn.style.borderColor = 'rgba(239,68,68,0.2)';
        }
        recalculate();
      });
    });

    // Numeric inputs
    el.querySelectorAll('input[data-ec-type="numeric"]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        answers[inp.getAttribute('data-ec-input')] = inp.value ? parseFloat(inp.value) : null;
        recalculate();
      });
    });

    // Choice selects
    el.querySelectorAll('select[data-ec-type="choice"]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        answers[sel.getAttribute('data-ec-input')] = sel.value || null;
        recalculate();
      });
    });

    var overrideConfirmed = false;

    function recalculate() {
      var result = evaluateLayer1(sections, answers);
      var statusEl = document.getElementById('ecL1Status');
      var resultEl = document.getElementById('ecL1Result');
      var overrideEl = document.getElementById('ecL1Override');

      // Count answered
      var totalQ = 0, answeredQ = 0;
      sections.forEach(function (sec) { sec.items.forEach(function (item) { totalQ++; if (answers[item.id] !== undefined) answeredQ++; }); });

      if (statusEl) {
        statusEl.textContent = answeredQ + ' / ' + totalQ + ' questions answered' + (result.failedRequired.length > 0 ? ' — ' + result.failedRequired.length + ' required rule(s) not satisfied' : '');
        statusEl.style.color = result.passed ? 'rgba(34,197,94,0.8)' : answeredQ > 0 ? 'rgba(234,179,8,0.8)' : 'var(--txt-muted)';
      }

      if (resultEl) {
        if (answeredQ === totalQ || (answeredQ > 0 && result.failedRequired.length > 0)) {
          resultEl.style.display = 'block';
          if (result.passed) {
            resultEl.style.background = 'rgba(34,197,94,0.06)';
            resultEl.style.border = '1px solid rgba(34,197,94,0.15)';
            resultEl.innerHTML = '<span style="font-weight:700;color:rgba(34,197,94,0.9);">Strategy requirements confirmed.</span> <span style="color:var(--txt-secondary);">Proceed to Execution Checklist.</span>';
          } else {
            resultEl.style.background = 'rgba(239,68,68,0.06)';
            resultEl.style.border = '1px solid rgba(239,68,68,0.12)';
            var failHtml = '<span style="font-weight:700;color:rgba(239,68,68,0.9);">Strategy requirements not fully confirmed.</span>';
            failHtml += '<div style="margin-top:.3rem;">';
            result.failedRequired.forEach(function (f) {
              failHtml += '<div style="display:flex;align-items:flex-start;gap:.3rem;padding:.15rem 0;font-size:.68rem;">';
              failHtml += '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.7)" stroke-width="2.5" style="flex-shrink:0;margin-top:2px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
              failHtml += '<span style="color:var(--txt-secondary);">' + esc(f.text) + ' — <span style="color:rgba(239,68,68,0.7);">' + esc(f.reason) + '</span></span>';
              failHtml += '</div>';
            });
            failHtml += '</div>';
            resultEl.innerHTML = failHtml;
          }
        } else {
          resultEl.style.display = 'none';
        }
      }

      // Override — allow user to continue anyway
      if (overrideEl) {
        if (!result.passed && answeredQ > 0) {
          overrideEl.style.display = 'block';
          if (!overrideConfirmed) {
            overrideEl.innerHTML = '<label style="display:flex;align-items:center;gap:.4rem;font-size:.68rem;color:var(--txt-muted);cursor:pointer;padding:.3rem 0;">' +
              '<input type="checkbox" id="ecL1OverrideCheck" style="accent-color:rgba(239,68,68,0.7);" />' +
              '<span>I understand this trade may be marked as non-compliant and may not count toward the 55 Trade Cycle.</span></label>';
            var check = overrideEl.querySelector('#ecL1OverrideCheck');
            if (check) {
              check.addEventListener('change', function () {
                overrideConfirmed = check.checked;
                if (onComplete) onComplete(overrideConfirmed, answers, result);
              });
            }
          }
        } else {
          overrideEl.style.display = 'none';
          overrideConfirmed = false;
        }
      }

      if (onComplete) onComplete(result.passed || overrideConfirmed, answers, result);
    }

    // Store sections reference for later snapshot
    el._ecSections = sections;
    el._ecGetAnswers = function () { return answers; };
    el._ecGetResult = function () { return evaluateLayer1(sections, answers); };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER LAYER 2 — Standard 6-Point Execution Checklist
  // ═══════════════════════════════════════════════════════════════════════════

  function renderLayer2(containerId, locked, onComplete) {
    var el = document.getElementById(containerId);
    if (!el) return;

    var items = getStandard6Point();
    var answers = {};
    var html = '';

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem;">';
    html += '<div style="display:flex;align-items:center;gap:.5rem;">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(214,190,150,0.7)" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
    html += '<span style="font-size:.8rem;font-weight:700;color:var(--txt-primary);letter-spacing:.03em;">EXECUTION CHECKLIST</span>';
    html += '</div>';
    html += '<span id="ecL2Badge" style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;padding:2px 8px;border-radius:100px;background:rgba(96,165,250,0.08);color:rgba(96,165,250,0.9);border:1px solid rgba(96,165,250,0.2);">0 / ' + items.length + '</span>';
    html += '</div>';

    // Lock overlay
    html += '<div id="ecL2Lock" style="' + (locked ? '' : 'display:none;') + 'padding:.6rem .75rem;background:rgba(0,0,0,0.15);border:1px solid var(--border-default);border-radius:8px;text-align:center;margin-bottom:.5rem;">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--txt-muted)" stroke-width="1.5" style="margin-bottom:.25rem;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    html += '<div style="font-size:.7rem;font-weight:600;color:var(--txt-muted);">Execution checklist locked</div>';
    html += '<div style="font-size:.62rem;color:var(--txt-muted);margin-top:.15rem;">Complete strategy validation to unlock.</div>';
    html += '</div>';

    // Checklist items
    html += '<div id="ecL2Items" style="' + (locked ? 'opacity:0.3;pointer-events:none;' : '') + '">';
    items.forEach(function (item, i) {
      html += '<label style="display:flex;align-items:center;gap:.5rem;padding:.35rem .5rem;margin-bottom:.2rem;background:var(--bg-card);border:1px solid var(--border-default);border-radius:6px;cursor:pointer;transition:all .15s;" data-ec-l2-row="' + item.id + '">';
      html += '<input type="checkbox" id="ecl2_' + i + '" data-ec-l2="' + item.id + '" style="accent-color:rgba(34,197,94,0.8);width:16px;height:16px;flex-shrink:0;" />';
      html += '<span style="font-size:.72rem;color:var(--txt-secondary);">' + esc(item.text) + '</span>';
      html += '</label>';
    });
    html += '</div>';

    // Result
    html += '<div id="ecL2Result" style="display:none;margin-top:.5rem;padding:.4rem .6rem;border-radius:6px;font-size:.7rem;"></div>';

    el.innerHTML = html;
    el.style.display = 'block';

    // Wire checkboxes
    el.querySelectorAll('input[data-ec-l2]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        answers[cb.getAttribute('data-ec-l2')] = cb.checked;
        var row = el.querySelector('[data-ec-l2-row="' + cb.getAttribute('data-ec-l2') + '"]');
        if (row) {
          row.style.borderColor = cb.checked ? 'rgba(34,197,94,0.2)' : 'var(--border-default)';
          row.style.background = cb.checked ? 'rgba(34,197,94,0.04)' : 'var(--bg-card)';
        }
        recalcL2();
      });
    });

    function recalcL2() {
      var result = evaluateLayer2(answers);
      var badge = document.getElementById('ecL2Badge');
      var resultDiv = document.getElementById('ecL2Result');
      if (badge) {
        badge.textContent = result.passed + ' / ' + result.total;
        badge.style.color = result.allPassed ? 'rgba(34,197,94,0.9)' : 'rgba(96,165,250,0.9)';
        badge.style.background = result.allPassed ? 'rgba(34,197,94,0.08)' : 'rgba(96,165,250,0.08)';
        badge.style.borderColor = result.allPassed ? 'rgba(34,197,94,0.2)' : 'rgba(96,165,250,0.2)';
      }
      if (resultDiv) {
        if (result.allPassed) {
          resultDiv.style.display = 'block';
          resultDiv.style.background = 'rgba(34,197,94,0.06)';
          resultDiv.style.border = '1px solid rgba(34,197,94,0.15)';
          resultDiv.innerHTML = '<span style="font-weight:700;color:rgba(34,197,94,0.9);">Execution checklist complete.</span> <span style="color:var(--txt-secondary);">Trade is ready for submission.</span>';
        } else {
          resultDiv.style.display = 'none';
        }
      }
      if (onComplete) onComplete(result.allPassed, answers, result);
    }

    el._ecGetAnswers = function () { return answers; };
    el._ecGetResult = function () { return evaluateLayer2(answers); };
  }

  function unlockLayer2(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var lock = el.querySelector('#ecL2Lock');
    var items = el.querySelector('#ecL2Items');
    if (lock) lock.style.display = 'none';
    if (items) { items.style.opacity = '1'; items.style.pointerEvents = 'auto'; }
  }

  function lockLayer2(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var lock = el.querySelector('#ecL2Lock');
    var items = el.querySelector('#ecL2Items');
    if (lock) lock.style.display = '';
    if (items) { items.style.opacity = '0.3'; items.style.pointerEvents = 'none'; }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  window.ExecutionChecklist = {
    generateStrategyQuestions: generateStrategyQuestions,
    getStandard6Point:        getStandard6Point,
    evaluateLayer1:           evaluateLayer1,
    evaluateLayer2:           evaluateLayer2,
    buildChecklistSnapshot:   buildChecklistSnapshot,
    renderLayer1:             renderLayer1,
    renderLayer2:             renderLayer2,
    unlockLayer2:             unlockLayer2,
    lockLayer2:               lockLayer2,
    REQUIRED: REQUIRED,
    OPTIONAL: OPTIONAL,
    CONTEXT:  CONTEXT
  };

})();
