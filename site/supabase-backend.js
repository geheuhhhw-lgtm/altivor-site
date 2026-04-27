/* ═══════════════════════════════════════════════════════════════════════════
   ALTIVOR — Supabase Backend Sync Layer
   ─────────────────────────────────────────────────────────────────────────
   Bridges Supabase (source of truth) ↔ localStorage (cache for engines).
   All existing engines continue reading from localStorage.
   This layer ensures localStorage is populated from Supabase on load,
   and writes go to BOTH Supabase and localStorage.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BASE = 'https://lssedurdadjngqbchjbj.supabase.co';
  var KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxzc2VkdXJkYWRqbmdxYmNoamJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTk5OTksImV4cCI6MjA5MjEzNTk5OX0.PG6Ljeo9i0apJkU-X0QWsoS0KMn5CmnmFtmaIl3JdAs';
  var SESSION_KEY = 'altivor_session';

  // localStorage keys used by existing engines (cache targets)
  var LS = {
    TRADES:      'altivor_verification_trades_v1',
    ENGINE:      'altivor_challenge_engine_v1',
    SCORE:       'altivor_challenge_score_v1',
    DRAWDOWN:    'altivor_verification_drawdown_v1',
    PROFIT:      'altivor_verification_profit_v1',
    WEEKLY:      'altivor_verification_weekly_v1',
    STATEMENT:   'altivor_verification_statement_v1',
    SECOND_LIFE: 'altivor_second_life_v1',
    WOT:         'altivor_wot_entries_v1',
    DAILY_LOG:   'altivor_daily_log_v1',
    EVALUATIONS: 'altivor_trade_evaluations_v1',
    ENTITLEMENTS:'altivor_entitlements_cache',
    CHALLENGE:   'altivor_challenge_backend',
    PREPARE_PFX: 'altivor_prepare_purchased_',
    FWPACK_PFX:  'altivor_fwpack_purchased_',
    US100_PFX:   'altivor_us100_purchased_',
    ACC_PFX:     'altivor_acc_purchased_',
  };

  var _syncing = false;
  var _syncPromise = null;

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
    catch (_) { return null; }
  }
  function getToken() {
    var s = getSession();
    return s && s.access_token ? s.access_token : null;
  }
  function getUserId() {
    var s = getSession();
    return s && s.user && s.user.id ? s.user.id : null;
  }
  function getUserEmail() {
    var s = getSession();
    return s && s.user && s.user.email ? s.user.email.trim().toLowerCase() : null;
  }
  var _suppressSync = false;
  function saveJSON(key, data) {
    _suppressSync = true;
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {}
    _suppressSync = false;
  }
  function loadJSON(key) {
    try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch (_) { return null; }
  }

  // Supabase REST API helpers
  function dbHeaders(token) {
    var h = { 'apikey': KEY, 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    h['Prefer'] = 'return=representation';
    return h;
  }

  function dbGet(table, query) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('Not authenticated'));
    var url = BASE + '/rest/v1/' + table;
    if (query) url += '?' + query;
    return fetch(url, { method: 'GET', headers: dbHeaders(token) })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || 'DB GET failed'); });
        return r.json();
      });
  }

  function dbPost(table, body) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('Not authenticated'));
    return fetch(BASE + '/rest/v1/' + table, {
      method: 'POST',
      headers: dbHeaders(token),
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || 'DB POST failed'); });
      return r.json();
    });
  }

  function dbPatch(table, query, body) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('Not authenticated'));
    return fetch(BASE + '/rest/v1/' + table + '?' + query, {
      method: 'PATCH',
      headers: dbHeaders(token),
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || 'DB PATCH failed'); });
      return r.json();
    });
  }

  function callEdgeFunction(name, body) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('Not authenticated'));
    return fetch(BASE + '/functions/v1/' + name, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'apikey': KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 1. ENTITLEMENTS
  // ═══════════════════════════════════════════════════════════════════════

  function loadEntitlements() {
    return dbGet('user_entitlements', 'select=*&status=eq.active')
      .then(function (rows) {
        var entitlements = rows || [];
        // Cache in localStorage
        saveJSON(LS.ENTITLEMENTS, { ts: Date.now(), items: entitlements });

        // Also set legacy localStorage keys for backward compat with page-gate
        var email = getUserEmail();
        if (email) {
          var products = {};
          entitlements.forEach(function (e) { products[e.product_key] = true; });

          setLegacyKey(LS.PREPARE_PFX + email, products['prepare']);
          setLegacyKey(LS.FWPACK_PFX + email, products['frameworkPack']);
          setLegacyKey(LS.US100_PFX + email, products['us100Framework']);
          setLegacyKey(LS.ACC_PFX + email, products['accessories']);
        }

        return entitlements;
      })
      .catch(function (err) {
        console.warn('[Backend] Entitlements fetch failed, using cache:', err.message);
        var cached = loadJSON(LS.ENTITLEMENTS);
        return cached && cached.items ? cached.items : [];
      });
  }

  function setLegacyKey(key, active) {
    if (active) {
      localStorage.setItem(key, '1');
    } else {
      localStorage.removeItem(key);
    }
  }

  function hasEntitlement(productKey) {
    var cached = loadJSON(LS.ENTITLEMENTS);
    if (!cached || !cached.items) return false;
    return cached.items.some(function (e) {
      return e.product_key === productKey && e.status === 'active';
    });
  }

  function checkEntitlementAsync(productKey) {
    return loadEntitlements().then(function (ents) {
      return ents.some(function (e) {
        return e.product_key === productKey && e.status === 'active';
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. CHALLENGE
  // ═══════════════════════════════════════════════════════════════════════

  function loadChallenge() {
    return dbGet('challenges', 'select=*&status=not.in.("failed","invalidated")&order=created_at.desc&limit=1')
      .then(function (rows) {
        var challenge = rows && rows.length ? rows[0] : null;
        if (challenge) {
          saveJSON(LS.CHALLENGE, challenge);
          // Sync to legacy engine state format
          syncChallengeToEngineState(challenge);
        }
        return challenge;
      })
      .catch(function (err) {
        console.warn('[Backend] Challenge fetch failed, using cache:', err.message);
        return loadJSON(LS.CHALLENGE);
      });
  }

  function syncChallengeToEngineState(ch) {
    // Map Supabase challenge → altivor_challenge_engine_v1 format
    var state = loadJSON(LS.ENGINE) || {};
    state.status = mapChallengeStatus(ch.status);
    state.validatedTradeCount = ch.validated_trade_count;
    state.invalidTradeCount = ch.invalid_trade_count;
    state.warningCount = ch.warning_count;
    state.strikeCount = ch.strike_count;
    state.traderScore = parseFloat(ch.trader_score);
    state.disciplineRating = ch.discipline_rating;
    state.secondLifeUsed = ch.second_life_used;
    state.attemptNumber = ch.attempt_number;
    state._backendId = ch.id;
    saveJSON(LS.ENGINE, state);

    // Drawdown
    var dd = loadJSON(LS.DRAWDOWN) || {};
    dd.peakEquity = parseFloat(ch.peak_equity);
    dd.currentEquity = parseFloat(ch.current_equity);
    dd.failed = parseFloat(ch.max_drawdown) >= 10;
    saveJSON(LS.DRAWDOWN, dd);

    // Profit
    var profit = loadJSON(LS.PROFIT) || {};
    profit.netProfitPercent = parseFloat(ch.net_profit_percent);
    saveJSON(LS.PROFIT, profit);

    // Weekly
    var weekly = loadJSON(LS.WEEKLY) || { checkins: [] };
    // Ensure checkin count matches
    while (weekly.checkins.length < ch.weekly_checkins_completed) {
      weekly.checkins.push({ week: weekly.checkins.length + 1, synced: true });
    }
    saveJSON(LS.WEEKLY, weekly);

    // Statement
    var stmt = loadJSON(LS.STATEMENT) || {};
    stmt.submitted = ch.broker_statement_status === 'submitted' || ch.broker_statement_status === 'reviewed';
    saveJSON(LS.STATEMENT, stmt);

    // Second Life
    var sl = loadJSON(LS.SECOND_LIFE) || {};
    sl.used = ch.second_life_used;
    saveJSON(LS.SECOND_LIFE, sl);
  }

  function mapChallengeStatus(status) {
    var map = {
      'active': 'ACTIVE',
      'passing': 'PASSING',
      'at_risk': 'AT RISK',
      'failed': 'FAILED',
      'invalidated': 'INVALIDATED',
      'completed': 'COMPLETED',
      'ready_for_final_verification': 'READY FOR FINAL VERIFICATION',
      'second_life_available': 'SECOND LIFE AVAILABLE',
    };
    return map[status] || 'ACTIVE';
  }

  function saveChallenge(state) {
    var cached = loadJSON(LS.CHALLENGE);
    var challengeId = (cached && cached.id) || (state && state._backendId);
    if (!challengeId) {
      console.warn('[Backend] No challenge ID — cannot save to backend');
      return Promise.resolve(null);
    }

    var payload = {
      status: reverseMapStatus(state.status || state._status),
      validated_trade_count: state.validatedTradeCount || 0,
      invalid_trade_count: state.invalidTradeCount || 0,
      warning_count: state.warningCount || 0,
      strike_count: state.strikeCount || 0,
      trader_score: state.traderScore || 100,
      discipline_rating: state.disciplineRating || 'Institutional',
      second_life_used: state.secondLifeUsed || false,
      attempt_number: state.attemptNumber || 1,
    };

    return dbPatch('challenges', 'id=eq.' + challengeId, payload)
      .then(function (rows) {
        if (rows && rows.length) {
          saveJSON(LS.CHALLENGE, rows[0]);
        }
        return rows && rows[0];
      })
      .catch(function (err) {
        console.warn('[Backend] Challenge save failed:', err.message);
        return null;
      });
  }

  function reverseMapStatus(statusDisplay) {
    if (!statusDisplay) return 'active';
    var map = {
      'ACTIVE': 'active',
      'PASSING': 'passing',
      'AT RISK': 'at_risk',
      'FAILED': 'failed',
      'INVALIDATED': 'invalidated',
      'COMPLETED': 'completed',
      'READY FOR FINAL VERIFICATION': 'ready_for_final_verification',
      'SECOND LIFE AVAILABLE': 'second_life_available',
    };
    return map[statusDisplay] || statusDisplay.toLowerCase().replace(/ /g, '_');
  }

  function triggerChallengeSync() {
    var cached = loadJSON(LS.CHALLENGE);
    if (!cached || !cached.id) return Promise.resolve(null);
    return callEdgeFunction('challenge-sync', { challenge_id: cached.id })
      .then(function (result) {
        if (result && result.success && result.challenge) {
          saveJSON(LS.CHALLENGE, result.challenge);
          syncChallengeToEngineState(result.challenge);
          // Store latest trade audit for frontend display
          if (result.latest_trade_audit) {
            saveJSON('altivor_latest_trade_audit', result.latest_trade_audit);
          }
          if (result.summary) {
            saveJSON('altivor_challenge_summary', result.summary);
          }
          document.dispatchEvent(new CustomEvent('altivor:challenge-synced', { detail: result }));
        }
        return result;
      })
      .catch(function (err) {
        console.warn('[Backend] Challenge sync failed:', err.message);
        enqueueRetry({ type: 'challenge_sync', payload: { challenge_id: cached.id } });
        showSyncToast('Backend unavailable. Your data will retry automatically.', 'warning');
        return null;
      });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 3. TRADES
  // ═══════════════════════════════════════════════════════════════════════

  function loadTrades() {
    var cached = loadJSON(LS.CHALLENGE);
    var challengeId = cached && cached.id;
    var query = 'select=*&order=created_at.asc';
    if (challengeId) {
      query += '&challenge_id=eq.' + challengeId;
    } else {
      query += '&product_context=eq.55_trade_cycle';
    }

    return dbGet('trades', query)
      .then(function (rows) {
        var trades = rows || [];
        // Convert to legacy format and save to localStorage
        var legacyTrades = trades.map(mapTradeToLegacy);
        saveJSON(LS.TRADES, { trades: legacyTrades });
        return trades;
      })
      .catch(function (err) {
        console.warn('[Backend] Trades fetch failed, using cache:', err.message);
        return [];
      });
  }

  function saveTrade(trade) {
    var cached = loadJSON(LS.CHALLENGE);
    var challengeId = cached && cached.id;
    var userId = getUserId();
    if (!userId) return Promise.reject(new Error('Not authenticated'));

    var row = {
      user_id: userId,
      challenge_id: challengeId || null,
      product_context: trade.productContext || '55_trade_cycle',
      strategy_id: trade.strategy || trade.frameworkType || null,
      direction: trade.direction || null,
      entry_price: parseNum(trade.entryPrice),
      exit_price: parseNum(trade.exitPrice),
      stop_loss: parseNum(trade.stopLoss) || parseNum(trade.sl),
      take_profit: parseNum(trade.takeProfit) || parseNum(trade.tp),
      lot_size: parseNum(trade.lotSize) || parseNum(trade.positionSize) || parseNum(trade.volume),
      planned_risk: null,
      actual_risk: null,
      risk_percent: parseNum(trade.riskPercent),
      account_equity: parseNum(trade.accountEquity),
      entry_time: trade.entryTime || null,
      exit_time: trade.exitTime || null,
      pnl: parseNum(trade.pnl) || parseNum(trade.pl),
      rr_planned: parseNum(trade.rrPlanned),
      rr_realized: parseNum(trade.rr) || parseNum(trade.rewardRisk),
      notes: trade.notes || null,
      screenshot_url: trade.screenshot || trade.screenshotFile || null,
      validation_status: mapValidationStatus(trade),
      counts_toward_challenge: trade.countsTowardChallenge || false,
      violation_tags: trade.violationTags || trade.violations || [],
      warnings: trade.warnings || [],
      invalid_reasons: trade.invalidReasons || [],
      evaluation_result: trade.evaluation || null,
      execution_checklist_snapshot: trade.executionChecklist || null,
    };

    return dbPost('trades', row)
      .then(function (rows) {
        var saved = rows && rows[0];
        if (saved) {
          trade._backendId = saved.id;
          showSyncToast('Trade synced successfully.', 'success');
        }
        return saved;
      })
      .catch(function (err) {
        console.warn('[Backend] Trade save failed:', err.message);
        enqueueRetry({ type: 'trade', payload: row });
        showSyncToast('Trade saved locally. Backend sync pending.', 'warning');
        return null;
      });
  }

  function updateTrade(tradeId, updates) {
    return dbPatch('trades', 'id=eq.' + tradeId, updates)
      .catch(function (err) {
        console.warn('[Backend] Trade update failed:', err.message);
        return null;
      });
  }

  function mapValidationStatus(trade) {
    if (trade.finalStatus) {
      var map = {
        'VALIDATED': 'validated',
        'VALIDATED WITH WARNINGS': 'validated_with_warnings',
        'INVALID': 'invalid',
        'NOT COUNTED': 'not_counted',
        'STRIKE ISSUED': 'strike',
        'BREACH': 'strike',
      };
      return map[trade.finalStatus] || 'pending';
    }
    if (trade.validation_status) return trade.validation_status;
    return 'pending';
  }

  function mapTradeToLegacy(dbTrade) {
    return {
      id: dbTrade.id,
      _backendId: dbTrade.id,
      strategy: dbTrade.strategy_id,
      frameworkType: dbTrade.strategy_id,
      direction: dbTrade.direction,
      entryPrice: dbTrade.entry_price,
      exitPrice: dbTrade.exit_price,
      stopLoss: dbTrade.stop_loss,
      sl: dbTrade.stop_loss,
      takeProfit: dbTrade.take_profit,
      tp: dbTrade.take_profit,
      lotSize: dbTrade.lot_size,
      positionSize: dbTrade.lot_size,
      volume: dbTrade.lot_size,
      riskPercent: dbTrade.risk_percent,
      accountEquity: dbTrade.account_equity,
      entryTime: dbTrade.entry_time,
      exitTime: dbTrade.exit_time,
      pnl: dbTrade.pnl,
      pl: dbTrade.pnl,
      rr: dbTrade.rr_realized,
      rewardRisk: dbTrade.rr_realized,
      notes: dbTrade.notes,
      screenshot: dbTrade.screenshot_url,
      screenshotFile: dbTrade.screenshot_url,
      hasScreenshot: !!dbTrade.screenshot_url,
      validation_status: dbTrade.validation_status,
      countsTowardChallenge: dbTrade.counts_toward_challenge,
      violations: dbTrade.violation_tags,
      violationTags: dbTrade.violation_tags,
      warnings: dbTrade.warnings,
      invalidReasons: dbTrade.invalid_reasons,
      evaluation: dbTrade.evaluation_result,
      executionChecklist: dbTrade.execution_checklist_snapshot,
      nonCompliantFlag: dbTrade.execution_checklist_snapshot && dbTrade.execution_checklist_snapshot.nonCompliantFlag,
      date: dbTrade.entry_time ? dbTrade.entry_time.substring(0, 10) : null,
    };
  }

  function parseNum(v) {
    if (v === undefined || v === null || v === '') return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 4. WEEKLY CHECK-INS
  // ═══════════════════════════════════════════════════════════════════════

  function loadCheckins() {
    var cached = loadJSON(LS.CHALLENGE);
    if (!cached || !cached.id) return Promise.resolve([]);

    return dbGet('weekly_checkins', 'select=*&challenge_id=eq.' + cached.id + '&order=week_number.asc')
      .then(function (rows) {
        var checkins = rows || [];
        // Sync to legacy format
        saveJSON(LS.WEEKLY, { checkins: checkins.map(function (c) {
          return { week: c.week_number, equity: c.equity, notes: c.notes, id: c.id };
        })});
        return checkins;
      })
      .catch(function (err) {
        console.warn('[Backend] Checkins fetch failed:', err.message);
        return [];
      });
  }

  function saveCheckin(weekNumber, equity, notes) {
    var cached = loadJSON(LS.CHALLENGE);
    var userId = getUserId();
    if (!cached || !cached.id || !userId) return Promise.reject(new Error('No active challenge'));

    var checkinRow = {
      user_id: userId,
      challenge_id: cached.id,
      week_number: weekNumber,
      equity: parseNum(equity),
      notes: notes || null,
    };
    return dbPost('weekly_checkins', checkinRow)
    .then(function (rows) {
      var weekly = loadJSON(LS.WEEKLY) || { checkins: [] };
      weekly.checkins.push({ week: weekNumber, equity: equity, notes: notes });
      saveJSON(LS.WEEKLY, weekly);
      return rows && rows[0];
    })
    .catch(function (err) {
      console.warn('[Backend] Checkin save failed:', err.message);
      enqueueRetry({ type: 'checkin', payload: checkinRow });
      showSyncToast('Check-in saved locally. Backend sync pending.', 'warning');
      return null;
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 5. BROKER STATEMENTS
  // ═══════════════════════════════════════════════════════════════════════

  function loadStatements() {
    var cached = loadJSON(LS.CHALLENGE);
    if (!cached || !cached.id) return Promise.resolve([]);

    return dbGet('broker_statements', 'select=*&challenge_id=eq.' + cached.id)
      .then(function (rows) {
        var stmts = rows || [];
        var submitted = stmts.some(function (s) { return s.status === 'submitted' || s.status === 'reviewed'; });
        saveJSON(LS.STATEMENT, { submitted: submitted, records: stmts });
        return stmts;
      })
      .catch(function (err) {
        console.warn('[Backend] Statements fetch failed:', err.message);
        return [];
      });
  }

  function saveStatement(fileUrl) {
    var cached = loadJSON(LS.CHALLENGE);
    var userId = getUserId();
    if (!cached || !cached.id || !userId) return Promise.reject(new Error('No active challenge'));

    var stmtRow = {
      user_id: userId,
      challenge_id: cached.id,
      file_url: fileUrl || null,
      status: 'submitted',
    };
    return dbPost('broker_statements', stmtRow)
    .then(function (rows) {
      saveJSON(LS.STATEMENT, { submitted: true });
      return rows && rows[0];
    })
    .catch(function (err) {
      console.warn('[Backend] Statement save failed:', err.message);
      enqueueRetry({ type: 'statement', payload: stmtRow });
      showSyncToast('Statement saved locally. Backend sync pending.', 'warning');
      return null;
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 6. SECOND LIFE
  // ═══════════════════════════════════════════════════════════════════════

  function activateSecondLife() {
    var cached = loadJSON(LS.CHALLENGE);
    var userId = getUserId();
    if (!cached || !cached.id || !userId) return Promise.reject(new Error('No active challenge'));
    if (cached.second_life_used) return Promise.reject(new Error('Second Life already used'));

    // 1. Archive the current attempt
    return dbPost('challenge_attempts', {
      user_id: userId,
      challenge_id: cached.id,
      attempt_number: cached.attempt_number || 1,
      status: cached.status || 'failed',
      started_at: cached.created_at,
      ended_at: new Date().toISOString(),
      failure_reason: cached.failure_reason || 'Challenge failed',
      archived_snapshot: {
        validated_trade_count: cached.validated_trade_count,
        invalid_trade_count: cached.invalid_trade_count,
        strike_count: cached.strike_count,
        warning_count: cached.warning_count,
        trader_score: cached.trader_score,
        challenge_score: cached.challenge_score,
      },
    })
    .then(function () {
      // 2. Reset the challenge
      return dbPatch('challenges', 'id=eq.' + cached.id, {
        status: 'active',
        attempt_number: (cached.attempt_number || 1) + 1,
        second_life_used: true,
        validated_trade_count: 0,
        invalid_trade_count: 0,
        warning_count: 0,
        strike_count: 0,
        trader_score: 100,
        challenge_score: 100,
        discipline_rating: 'Institutional',
        weekly_checkins_completed: 0,
        broker_statement_status: 'missing',
        completed_at: null,
        failed_at: null,
        failure_reason: null,
      });
    })
    .then(function (rows) {
      var updated = rows && rows[0];
      if (updated) {
        saveJSON(LS.CHALLENGE, updated);
        syncChallengeToEngineState(updated);
      }

      // 3. Clear legacy localStorage data for clean restart
      saveJSON(LS.TRADES, { trades: [] });
      saveJSON(LS.SCORE, null);
      saveJSON(LS.DAILY_LOG, { entries: {} });
      saveJSON(LS.EVALUATIONS, null);
      saveJSON(LS.WEEKLY, { checkins: [] });
      saveJSON(LS.STATEMENT, { submitted: false });
      saveJSON(LS.SECOND_LIFE, { used: true, usedAt: new Date().toISOString() });

      return updated;
    })
    .catch(function (err) {
      console.error('[Backend] Second Life activation failed:', err.message);
      throw err;
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 7. WALL OF TRADERS
  // ═══════════════════════════════════════════════════════════════════════

  function loadWallOfTraders() {
    // Public read — no auth needed, but we still send the key
    return fetch(BASE + '/rest/v1/wall_of_traders?select=*&verified=eq.true&visible=eq.true&order=trader_score.desc', {
      method: 'GET',
      headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
    })
    .then(function (r) { return r.json(); })
    .then(function (rows) {
      var entries = rows || [];
      // Cache for legacy rendering
      saveJSON(LS.WOT, entries.map(function (e) {
        return {
          id: e.id,
          nickname: e.display_name,
          product: 'US100 Challenge',
          completedAt: e.completed_at,
          score: parseFloat(e.trader_score),
          stats: {
            trades: e.validated_trades,
            profit: parseFloat(e.net_profit_percent),
            drawdown: parseFloat(e.max_drawdown),
            winRate: 0,
            avgRR: 0,
            bestRR: 0,
            maxWinStreak: 0,
          },
        };
      }));
      return entries;
    })
    .catch(function (err) {
      console.warn('[Backend] WoT fetch failed:', err.message);
      return loadJSON(LS.WOT) || [];
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 8. MIGRATION — localStorage → Supabase (one-time)
  // ═══════════════════════════════════════════════════════════════════════

  function migrateLocalStorage() {
    var userId = getUserId();
    var email = getUserEmail();
    if (!userId || !email) return Promise.resolve(false);

    var migrationKey = 'altivor_migrated_to_supabase_' + email;
    if (localStorage.getItem(migrationKey) === '1') return Promise.resolve(false);

    console.log('[Backend] Starting localStorage → Supabase migration for', email);

    var promises = [];

    // Migrate trades
    var localTrades = loadJSON(LS.TRADES);
    if (localTrades && localTrades.trades && localTrades.trades.length > 0) {
      // Check if Supabase already has trades
      promises.push(
        dbGet('trades', 'select=id&user_id=eq.' + userId + '&limit=1')
          .then(function (existing) {
            if (existing && existing.length > 0) return; // already have trades
            return migrateTrades(localTrades.trades, userId);
          })
      );
    }

    // Migrate weekly check-ins
    var localWeekly = loadJSON(LS.WEEKLY);
    if (localWeekly && localWeekly.checkins && localWeekly.checkins.length > 0) {
      promises.push(migrateCheckins(localWeekly.checkins, userId));
    }

    // Migrate broker statement
    var localStmt = loadJSON(LS.STATEMENT);
    if (localStmt && localStmt.submitted) {
      promises.push(migrateStatement(userId));
    }

    return Promise.all(promises)
      .then(function () {
        localStorage.setItem(migrationKey, '1');
        console.log('[Backend] Migration complete');
        return true;
      })
      .catch(function (err) {
        console.warn('[Backend] Migration error:', err.message);
        return false;
      });
  }

  function migrateTrades(trades, userId) {
    var cached = loadJSON(LS.CHALLENGE);
    var challengeId = cached && cached.id;

    var rows = trades.map(function (t) {
      return {
        user_id: userId,
        challenge_id: challengeId,
        product_context: '55_trade_cycle',
        strategy_id: t.strategy || t.frameworkType || null,
        direction: t.direction || null,
        entry_price: parseNum(t.entryPrice),
        exit_price: parseNum(t.exitPrice),
        stop_loss: parseNum(t.stopLoss) || parseNum(t.sl),
        take_profit: parseNum(t.takeProfit) || parseNum(t.tp),
        lot_size: parseNum(t.lotSize) || parseNum(t.positionSize),
        risk_percent: parseNum(t.riskPercent),
        account_equity: parseNum(t.accountEquity),
        entry_time: t.entryTime || null,
        exit_time: t.exitTime || null,
        pnl: parseNum(t.pnl) || parseNum(t.pl),
        rr_realized: parseNum(t.rr) || parseNum(t.rewardRisk),
        notes: t.notes || null,
        screenshot_url: t.screenshot || t.screenshotFile || null,
        validation_status: mapValidationStatus(t),
        counts_toward_challenge: t.countsTowardChallenge || false,
        violation_tags: t.violations || t.violationTags || [],
        warnings: t.warnings || [],
        invalid_reasons: t.invalidReasons || [],
        evaluation_result: t.evaluation || null,
        execution_checklist_snapshot: t.executionChecklist || null,
      };
    });

    // Batch insert
    var token = getToken();
    return fetch(BASE + '/rest/v1/trades', {
      method: 'POST',
      headers: dbHeaders(token),
      body: JSON.stringify(rows),
    }).then(function (r) {
      if (!r.ok) console.warn('[Backend] Trade migration batch failed');
      return r.json();
    });
  }

  function migrateCheckins(checkins, userId) {
    var cached = loadJSON(LS.CHALLENGE);
    if (!cached || !cached.id) return Promise.resolve();

    var rows = checkins.map(function (c, i) {
      return {
        user_id: userId,
        challenge_id: cached.id,
        week_number: c.week || (i + 1),
        equity: parseNum(c.equity),
        notes: c.notes || null,
      };
    });

    var token = getToken();
    return fetch(BASE + '/rest/v1/weekly_checkins', {
      method: 'POST',
      headers: Object.assign(dbHeaders(token), { 'Prefer': 'return=minimal,resolution=merge-duplicates' }),
      body: JSON.stringify(rows),
    }).then(function (r) {
      if (!r.ok) console.warn('[Backend] Checkin migration failed');
    });
  }

  function migrateStatement(userId) {
    var cached = loadJSON(LS.CHALLENGE);
    if (!cached || !cached.id) return Promise.resolve();

    return dbPost('broker_statements', {
      user_id: userId,
      challenge_id: cached.id,
      status: 'submitted',
    }).catch(function () {});
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 9. SYNC ALL — master sync on page load
  // ═══════════════════════════════════════════════════════════════════════

  function syncAll() {
    if (_syncing) return _syncPromise;
    var token = getToken();
    if (!token) return Promise.resolve(false);

    _syncing = true;
    console.log('[Backend] Syncing all data from Supabase...');

    _syncPromise = loadEntitlements()
      .then(function () { return loadChallenge(); })
      .then(function (ch) {
        if (!ch) return Promise.resolve();
        return Promise.all([
          loadTrades(),
          loadCheckins(),
          loadStatements(),
        ]);
      })
      .then(function () { return loadWallOfTraders(); })
      .then(function () {
        _syncing = false;
        console.log('[Backend] Sync complete');
        document.dispatchEvent(new CustomEvent('altivor:backendsync'));
        return true;
      })
      .catch(function (err) {
        _syncing = false;
        console.warn('[Backend] Sync error:', err.message);
        return false;
      });

    return _syncPromise;
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 10. ENTITLEMENT VERIFICATION (async check for page-gate)
  // ═══════════════════════════════════════════════════════════════════════

  function verifyEntitlements() {
    var email = getUserEmail();
    if (!email) return;

    loadEntitlements().then(function (ents) {
      var products = {};
      ents.forEach(function (e) { products[e.product_key] = true; });

      // Check if current localStorage keys match Supabase
      var keys = [
        { key: LS.PREPARE_PFX + email, product: 'prepare' },
        { key: LS.FWPACK_PFX + email, product: 'frameworkPack' },
        { key: LS.US100_PFX + email, product: 'us100Framework' },
        { key: LS.ACC_PFX + email, product: 'accessories' },
      ];

      var changed = false;
      keys.forEach(function (k) {
        var localVal = localStorage.getItem(k.key) === '1';
        var serverVal = !!products[k.product];
        if (localVal !== serverVal) {
          changed = true;
          if (serverVal) localStorage.setItem(k.key, '1');
          else localStorage.removeItem(k.key);
        }
      });

      if (changed) {
        console.log('[Backend] Entitlement mismatch detected — correcting localStorage');
        // If user lost access, dispatch event to trigger page-gate recheck
        document.dispatchEvent(new CustomEvent('altivor:entitlement-changed', { detail: products }));
      }
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 11. localStorage WRITE INTERCEPTOR
  //     Auto-syncs specific keys to Supabase when written by page scripts.
  // ═══════════════════════════════════════════════════════════════════════

  var _origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    _origSetItem(key, value);
    if (_suppressSync) return;
    try { handleStorageWrite(key, value); } catch (_) {}
  };

  function handleStorageWrite(key, value) {
    if (!getToken()) return;
    var data;
    try { data = JSON.parse(value); } catch (_) { return; }

    // Weekly check-ins
    if (key === LS.WEEKLY && data && data.checkins && data.checkins.length > 0) {
      var latest = data.checkins[data.checkins.length - 1];
      var weekNum = latest.week || data.checkins.length;
      saveCheckin(weekNum, latest.equity, latest.notes || null)
        .catch(function () {});
    }

    // Broker statement
    if (key === LS.STATEMENT && data && data.submitted === true) {
      saveStatement(data.fileName || null)
        .catch(function () {});
    }

    // Drawdown tracker
    if (key === LS.DRAWDOWN && data) {
      var ch = loadJSON(LS.CHALLENGE);
      if (ch && ch.id) {
        var peakEq = parseFloat(data.peakEquity) || 10000;
        var currEq = parseFloat(data.currentEquity) || 10000;
        var dd = peakEq > 0 ? Math.max(0, ((peakEq - currEq) / peakEq) * 100) : 0;
        dd = Math.round(dd * 100) / 100;
        var ddPatch = { peak_equity: peakEq, current_equity: currEq, max_drawdown: dd };
        dbPatch('challenges', 'id=eq.' + ch.id, ddPatch)
          .catch(function () { enqueueRetry({ type: 'drawdown', payload: { id: ch.id, data: ddPatch } }); });
      }
    }

    // Profit tracker
    if (key === LS.PROFIT && data && data.startingBalance) {
      var ch2 = loadJSON(LS.CHALLENGE);
      if (ch2 && ch2.id) {
        var endBal = data.month2Balance || data.month1Balance;
        if (endBal && data.startingBalance > 0) {
          var netPct = ((endBal - data.startingBalance) / data.startingBalance) * 100;
          var profitPatch = { net_profit_percent: Math.round(netPct * 100) / 100 };
          dbPatch('challenges', 'id=eq.' + ch2.id, profitPatch)
            .catch(function () { enqueueRetry({ type: 'profit', payload: { id: ch2.id, data: profitPatch } }); });
        }
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 12. RETRY QUEUE — failed writes are persisted and retried
  // ═══════════════════════════════════════════════════════════════════════

  var RETRY_KEY = 'altivor_sync_queue';
  var _retryTimer = null;

  function getRetryQueue() { return loadJSON(RETRY_KEY) || []; }
  function saveRetryQueue(q) { saveJSON(RETRY_KEY, q); }

  function enqueueRetry(item) {
    var q = getRetryQueue();
    item.ts = Date.now();
    item.attempts = 0;
    q.push(item);
    saveRetryQueue(q);
    console.log('[RetryQueue] Enqueued', item.type, '— queue length:', q.length);
    scheduleRetry();
  }

  function processRetryQueue() {
    var token = getToken();
    if (!token) return Promise.resolve();
    var q = getRetryQueue();
    if (q.length === 0) return Promise.resolve();

    console.log('[RetryQueue] Processing', q.length, 'items...');
    var remaining = [];

    function processNext(i) {
      if (i >= q.length) {
        saveRetryQueue(remaining);
        if (remaining.length === 0) {
          showSyncToast('All pending data synced successfully.', 'success');
        }
        return Promise.resolve();
      }
      var item = q[i];
      item.attempts = (item.attempts || 0) + 1;
      return retryItem(item).then(function (ok) {
        if (!ok && item.attempts < 10) remaining.push(item);
        else if (!ok) console.warn('[RetryQueue] Dropping item after 10 attempts:', item.type);
        return processNext(i + 1);
      });
    }
    return processNext(0);
  }

  function retryItem(item) {
    var token = getToken();
    if (!token) return Promise.resolve(false);
    try {
      if (item.type === 'trade') {
        return dbPost('trades', item.payload).then(function () { return true; }).catch(function () { return false; });
      }
      if (item.type === 'checkin') {
        return dbPost('weekly_checkins', item.payload).then(function () { return true; }).catch(function () { return false; });
      }
      if (item.type === 'statement') {
        return dbPost('broker_statements', item.payload).then(function () { return true; }).catch(function () { return false; });
      }
      if (item.type === 'challenge_sync') {
        return callEdgeFunction('challenge-sync', item.payload).then(function (r) { return !!(r && r.success); }).catch(function () { return false; });
      }
      if (item.type === 'drawdown') {
        return dbPatch('challenges', 'id=eq.' + item.payload.id, item.payload.data).then(function () { return true; }).catch(function () { return false; });
      }
      if (item.type === 'profit') {
        return dbPatch('challenges', 'id=eq.' + item.payload.id, item.payload.data).then(function () { return true; }).catch(function () { return false; });
      }
    } catch (_) {}
    return Promise.resolve(false);
  }

  function scheduleRetry() {
    if (_retryTimer) return;
    _retryTimer = setTimeout(function () {
      _retryTimer = null;
      processRetryQueue().then(function () {
        var q = getRetryQueue();
        if (q.length > 0) scheduleRetry();
      });
    }, 15000);
  }

  // Retry on connectivity restore
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('online', function () {
      console.log('[RetryQueue] Online detected — processing queue');
      processRetryQueue();
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 13. PENDING ENTITLEMENTS — claim on login
  // ═══════════════════════════════════════════════════════════════════════

  function claimPendingEntitlements() {
    var email = getUserEmail();
    var uid = getUserId();
    var token = getToken();
    if (!email || !uid || !token) return Promise.resolve(null);

    return fetch(BASE + '/rest/v1/rpc/claim_pending_entitlements', {
      method: 'POST',
      headers: {
        'apikey': KEY,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_email: email, user_uuid: uid }),
    })
    .then(function (r) { return r.json(); })
    .then(function (result) {
      if (result && result.claimed > 0) {
        console.log('[Backend] Claimed', result.claimed, 'pending entitlements');
        showSyncToast('Payment confirmed. Access is being activated.', 'success');
        // Refresh entitlements to update localStorage
        return loadEntitlements().then(function () { return result; });
      }
      return result;
    })
    .catch(function (err) {
      console.warn('[Backend] Pending entitlements claim failed:', err.message);
      return null;
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 14. SYNC STATUS TOASTS — non-invasive user-facing messages
  // ═══════════════════════════════════════════════════════════════════════

  var _toastContainer = null;

  function ensureToastContainer() {
    if (_toastContainer && document.body.contains(_toastContainer)) return;
    _toastContainer = document.createElement('div');
    _toastContainer.id = 'altivor-sync-toasts';
    _toastContainer.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:360px;';
    document.body.appendChild(_toastContainer);
  }

  function showSyncToast(message, type) {
    if (!document.body) return;
    ensureToastContainer();

    var toast = document.createElement('div');
    var bg = type === 'success' ? '#0d7a3e' : type === 'warning' ? '#b8860b' : type === 'error' ? '#c0392b' : '#333';
    toast.style.cssText = 'background:' + bg + ';color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;font-family:inherit;opacity:0;transform:translateY(10px);transition:all 0.3s ease;pointer-events:auto;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    toast.textContent = message;
    _toastContainer.appendChild(toast);

    requestAnimationFrame(function () {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 350);
    }, type === 'success' ? 3000 : 5000);
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 15. LOAD TRADE AUDIT RESULT (for frontend display)
  // ═══════════════════════════════════════════════════════════════════════

  function loadTradeAudit(tradeId) {
    return dbGet('trade_audit_results', 'select=*&trade_id=eq.' + tradeId + '&limit=1')
      .then(function (rows) { return rows && rows[0] ? rows[0] : null; })
      .catch(function () { return null; });
  }

  function loadLatestAudit() {
    return loadJSON('altivor_latest_trade_audit');
  }

  function loadChallengeSummary() {
    return loadJSON('altivor_challenge_summary');
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 16. SOCIAL PROOF — public aggregated metrics (no auth required)
  // ═══════════════════════════════════════════════════════════════════════

  function fetchSocialMetrics() {
    return fetch(BASE + '/rest/v1/rpc/platform_social_metrics', {
      method: 'POST',
      headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
      body: '{}',
    })
    .then(function (r) {
      if (!r.ok) throw new Error('metrics_fetch_' + r.status);
      return r.json();
    })
    .catch(function (err) {
      console.warn('[Backend] Social metrics fetch failed:', err.message);
      return null;
    });
  }

  function fetchPublicWallOfTraders() {
    return fetch(BASE + '/rest/v1/wall_of_traders?select=id,display_name,anonymized_name,completed_at,net_profit_percent,max_drawdown,validated_trades,trader_score,discipline_rating&verified=eq.true&visible=eq.true&order=trader_score.desc', {
      method: 'GET',
      headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
    })
    .then(function (r) { return r.json(); })
    .then(function (rows) { return rows || []; })
    .catch(function (err) {
      console.warn('[Backend] Public WoT fetch failed:', err.message);
      return [];
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════

  window.AltivorBackend = {
    // Entitlements
    loadEntitlements: loadEntitlements,
    hasEntitlement: hasEntitlement,
    checkEntitlementAsync: checkEntitlementAsync,
    verifyEntitlements: verifyEntitlements,
    claimPendingEntitlements: claimPendingEntitlements,

    // Challenge
    loadChallenge: loadChallenge,
    saveChallenge: saveChallenge,
    triggerChallengeSync: triggerChallengeSync,

    // Trades
    loadTrades: loadTrades,
    saveTrade: saveTrade,
    updateTrade: updateTrade,

    // Trade audit results
    loadTradeAudit: loadTradeAudit,
    loadLatestAudit: loadLatestAudit,
    loadChallengeSummary: loadChallengeSummary,

    // Weekly check-ins
    loadCheckins: loadCheckins,
    saveCheckin: saveCheckin,

    // Broker statements
    loadStatements: loadStatements,
    saveStatement: saveStatement,

    // Second Life
    activateSecondLife: activateSecondLife,

    // Wall of Traders
    loadWallOfTraders: loadWallOfTraders,

    // Social Proof (public, no auth)
    fetchSocialMetrics: fetchSocialMetrics,
    fetchPublicWallOfTraders: fetchPublicWallOfTraders,

    // Migration
    migrateLocalStorage: migrateLocalStorage,

    // Retry queue
    processRetryQueue: processRetryQueue,

    // Full sync
    syncAll: syncAll,

    // Toasts
    showSyncToast: showSyncToast,

    // Helpers
    getToken: getToken,
    getUserId: getUserId,
    getUserEmail: getUserEmail,
  };


  // ═══════════════════════════════════════════════════════════════════════
  // AUTO-INIT
  // ═══════════════════════════════════════════════════════════════════════

  function init() {
    var token = getToken();
    if (!token) return;

    // 1. Claim any pending entitlements (paid before registering)
    claimPendingEntitlements()
      .then(function () {
        // 2. Run migration (one-time)
        return migrateLocalStorage();
      })
      .then(function () {
        // 3. Full sync from backend
        return syncAll();
      })
      .then(function () {
        // 4. Process retry queue
        return processRetryQueue();
      })
      .catch(function () {});

    // Verify entitlements (async security check)
    verifyEntitlements();
  }

  // Listen for auth changes — re-sync when user logs in
  document.addEventListener('altivor:authchange', function (e) {
    var detail = e.detail || {};
    if (detail.user) {
      setTimeout(function () {
        claimPendingEntitlements()
          .then(function () { return migrateLocalStorage(); })
          .then(function () { return syncAll(); })
          .then(function () { return processRetryQueue(); });
      }, 500);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
