/* ═══════════════════════════════════════════════════════════════════════
   ALTIVOR INSTITUTE — Challenge Completion Engine
   Detects 55-trade cycle completion, calculates achievements,
   auto-submits to Wall of Traders, blocks re-purchase, and shows
   a professional post-completion modal with Accessories offer.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Keys ─────────────────────────────────────────────────────────── */
  var SESSION_KEY    = 'altivor_session';
  var TRADES_KEY     = 'altivor_verification_trades_v1';
  var DRAWDOWN_KEY   = 'altivor_verification_drawdown_v1';
  var PROFIT_KEY     = 'altivor_verification_profit_v1';
  var WEEKLY_KEY     = 'altivor_verification_weekly_v1';
  var STATEMENT_KEY  = 'altivor_verification_statement_v1';
  var FWPACK_KEY     = 'altivor_fwpack_purchased_';
  var US100_KEY      = 'altivor_us100_purchased_';
  var ACC_KEY        = 'altivor_acc_purchased_';
  var COMPLETION_KEY = 'altivor_challenge_completed_';  // + email
  var WOT_KEY        = 'altivor_wot_entries_v1';        // Wall of Traders list
  var MODAL_SHOWN_KEY = 'altivor_completion_modal_shown_'; // + email

  var ACC_STRIPE = 'https://buy.stripe.com/aFa6oI5s5a7QdoFgaMdby03';

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function getUserEmail() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return (s && s.user && s.user.email) ? s.user.email.trim().toLowerCase() : null;
    } catch (_) { return null; }
  }

  function loadJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch (_) { return null; }
  }

  /* ── Get challenge product type for this user ─────────────────────── */
  function getChallengeProduct(email) {
    if (localStorage.getItem(US100_KEY + email) === '1') return 'us100';
    if (localStorage.getItem(FWPACK_KEY + email) === '1') return 'frameworkPack';
    return null;
  }

  /* ── Completion detection ─────────────────────────────────────────── */
  function getCompletionData() {
    var trades     = (loadJSON(TRADES_KEY) || { trades: [] }).trades || [];
    var drawdown   = loadJSON(DRAWDOWN_KEY) || {};
    var profit     = loadJSON(PROFIT_KEY) || {};
    var weekly     = loadJSON(WEEKLY_KEY) || { checkins: [] };
    var statement  = loadJSON(STATEMENT_KEY) || {};

    var tradesCount   = trades.length;
    var weeklyCount   = (weekly.checkins || []).length;
    var startBal      = profit.startingBalance || 10000;
    var curBal        = profit.month2Balance || profit.month1Balance || startBal;
    var profitPct     = ((curBal - startBal) / startBal) * 100;
    var peakEquity    = drawdown.peakEquity || startBal;
    var currentEquity = drawdown.currentEquity || curBal;
    var dd            = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
    var drawdownFailed = dd >= 10 || !!drawdown.failed;
    var statementDone  = !!statement.submitted;

    var allComplete = tradesCount >= 55 && weeklyCount >= 8 && profitPct >= 6 && !drawdownFailed && statementDone;

    /* ── Achievement stats ───────────────────────────────────────── */
    var wins = 0, totalPL = 0, totalRR = 0, rrCount = 0, bestRR = 0;
    var curWS = 0, maxWS = 0, curLS = 0, maxLS = 0;
    trades.forEach(function (t) {
      var pnl = parseFloat(t.pl || t.pnl || 0);
      var rr  = parseFloat(t.rr || t.rewardRisk || 0);
      if (pnl > 0) wins++;
      totalPL += pnl;
      if (rr > 0) { totalRR += rr; rrCount++; }
      if (rr > bestRR) bestRR = rr;
      if (pnl > 0) { curWS++; curLS = 0; if (curWS > maxWS) maxWS = curWS; }
      else if (pnl < 0) { curLS++; curWS = 0; if (curLS > maxLS) maxLS = curLS; }
      else { curWS = 0; curLS = 0; }
    });
    var winRate = tradesCount > 0 ? (wins / tradesCount * 100) : 0;
    var avgRR   = rrCount > 0 ? (totalRR / rrCount) : 0;

    return {
      complete: allComplete,
      failed: drawdownFailed,
      trades: tradesCount,
      weekly: weeklyCount,
      profit: profitPct,
      drawdown: dd,
      statement: statementDone,
      winRate: winRate,
      avgRR: avgRR,
      bestRR: bestRR,
      maxWinStreak: maxWS,
      maxLossStreak: maxLS,
      completionDate: new Date().toISOString()
    };
  }

  /* ── Mark challenge as completed ─────────────────────────────────── */
  function markCompleted(email, product, data) {
    var record = {
      product: product,
      completedAt: data.completionDate,
      trades: data.trades,
      profit: +data.profit.toFixed(2),
      drawdown: +data.drawdown.toFixed(2),
      winRate: +data.winRate.toFixed(1),
      avgRR: +data.avgRR.toFixed(2),
      bestRR: +data.bestRR.toFixed(2),
      maxWinStreak: data.maxWinStreak
    };
    localStorage.setItem(COMPLETION_KEY + email, JSON.stringify(record));
  }

  /* ── Wall of Traders auto-submit ─────────────────────────────────── */
  function addToWallOfTraders(email, product, data) {
    var entries = loadJSON(WOT_KEY) || [];
    // Don't add duplicates
    var exists = entries.some(function (e) { return e.email === email; });
    if (exists) return;

    var nickname = email.split('@')[0];
    // Anonymize: first 3 chars + ***
    if (nickname.length > 3) nickname = nickname.substring(0, 3) + '***';
    else nickname = nickname + '***';

    var entry = {
      id: 'wot-' + Date.now(),
      email: email,
      nickname: 'Trader_' + nickname,
      product: product === 'us100' ? 'US100 Challenge' : 'Framework Pack',
      completedAt: data.completionDate,
      score: Math.round((data.winRate * 0.3) + (Math.min(data.avgRR, 5) * 10) + (data.profit * 2) + (data.trades >= 55 ? 15 : 0)),
      stats: {
        trades: data.trades,
        profit: +data.profit.toFixed(2),
        drawdown: +data.drawdown.toFixed(2),
        winRate: +data.winRate.toFixed(1),
        avgRR: +data.avgRR.toFixed(2),
        bestRR: +data.bestRR.toFixed(2),
        maxWinStreak: data.maxWinStreak
      }
    };
    // Cap score at 100
    entry.score = Math.min(100, Math.max(0, entry.score));
    entries.push(entry);
    entries.sort(function (a, b) { return b.score - a.score; });
    localStorage.setItem(WOT_KEY, JSON.stringify(entries));
  }

  /* ── Check if user already completed ─────────────────────────────── */
  function getCompletion(email) {
    try { return JSON.parse(localStorage.getItem(COMPLETION_KEY + email)); }
    catch (_) { return null; }
  }

  /* ── Block re-purchase ───────────────────────────────────────────── */
  function blockRepurchaseButtons(email) {
    var completion = getCompletion(email);
    if (!completion) return;
    var product = completion.product;

    // Find all [data-buy] buttons and disable the completed product
    var buyBtns = document.querySelectorAll('[data-buy]');
    buyBtns.forEach(function (btn) {
      var buyProduct = btn.getAttribute('data-buy');
      var shouldBlock = false;

      if (product === 'us100' && (buyProduct === 'us100Framework' || buyProduct === 'frameworkPack')) {
        shouldBlock = true;
      } else if (product === 'frameworkPack' && buyProduct === 'frameworkPack') {
        shouldBlock = true;
      }

      if (shouldBlock) {
        btn.disabled = true;
        btn.style.cssText += ';opacity:0.4;cursor:not-allowed;pointer-events:none;position:relative;';
        // Add "Completed" badge
        var badge = document.createElement('span');
        badge.style.cssText = 'position:absolute;top:-8px;right:-8px;background:rgba(34,197,94,0.9);color:#fff;font-size:0.55rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:3px 8px;border-radius:100px;z-index:5;';
        badge.textContent = 'Completed';
        if (btn.style.position !== 'relative' && btn.style.position !== 'absolute') {
          btn.style.position = 'relative';
        }
        btn.appendChild(badge);

        // Replace button text
        var textNode = btn.querySelector('.pricing-btn-text, span');
        if (textNode) textNode.textContent = 'Challenge Completed';
        else btn.textContent = 'Challenge Completed';
      }
    });
  }

  /* ── Professional Completion + Accessories Modal ─────────────────── */
  function showCompletionModal(email, product, data) {
    if (document.getElementById('altivorCompletionOverlay')) return;

    var productName = product === 'us100' ? 'US100 Challenge' : 'Framework Pack';
    var hasAcc = localStorage.getItem(ACC_KEY + email) === '1';

    var overlay = document.createElement('div');
    overlay.id = 'altivorCompletionOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);animation:gateIn .4s ease;font-family:Inter,sans-serif;';

    var card = document.createElement('div');
    card.style.cssText = 'position:relative;max-width:480px;width:94%;padding:2.5rem 2rem;border-radius:22px;background:linear-gradient(180deg,rgba(20,20,26,0.98) 0%,rgba(15,15,20,0.98) 100%);border:1px solid rgba(34,197,94,0.15);box-shadow:0 32px 80px rgba(0,0,0,0.6),0 0 60px rgba(34,197,94,0.08);text-align:center;max-height:90vh;overflow-y:auto;';

    var trophySvg = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(234,179,8,0.8)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';

    var checkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.8)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';

    var statsHtml =
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.6rem;margin:1.25rem 0;padding:1rem;border-radius:12px;background:rgba(34,197,94,0.04);border:1px solid rgba(34,197,94,0.08);">' +
        '<div style="text-align:center;"><div style="font-size:1.1rem;font-weight:800;color:rgba(34,197,94,0.9);">' + data.trades + '</div><div style="font-size:.6rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.08em;margin-top:2px;">Trades</div></div>' +
        '<div style="text-align:center;"><div style="font-size:1.1rem;font-weight:800;color:rgba(34,197,94,0.9);">+' + data.profit.toFixed(1) + '%</div><div style="font-size:.6rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.08em;margin-top:2px;">Profit</div></div>' +
        '<div style="text-align:center;"><div style="font-size:1.1rem;font-weight:800;color:rgba(34,197,94,0.9);">' + data.winRate.toFixed(0) + '%</div><div style="font-size:.6rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.08em;margin-top:2px;">Win Rate</div></div>' +
        '<div style="text-align:center;"><div style="font-size:1.1rem;font-weight:800;color:rgba(255,255,255,0.8);">' + data.avgRR.toFixed(2) + '</div><div style="font-size:.6rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.08em;margin-top:2px;">Avg RR</div></div>' +
        '<div style="text-align:center;"><div style="font-size:1.1rem;font-weight:800;color:rgba(255,255,255,0.8);">' + data.drawdown.toFixed(1) + '%</div><div style="font-size:.6rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.08em;margin-top:2px;">Max DD</div></div>' +
        '<div style="text-align:center;"><div style="font-size:1.1rem;font-weight:800;color:rgba(234,179,8,0.8);">' + data.maxWinStreak + '</div><div style="font-size:.6rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:.08em;margin-top:2px;">Best Streak</div></div>' +
      '</div>';

    var achievementsHtml =
      '<div style="text-align:left;margin:1rem 0;padding:1rem 1.1rem;border-radius:12px;border:1px solid rgba(234,179,8,0.1);background:rgba(234,179,8,0.03);">' +
        '<div style="font-size:.68rem;font-weight:700;color:rgba(234,179,8,0.7);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.6rem;">Achievements Unlocked</div>' +
        '<div style="display:flex;flex-direction:column;gap:.35rem;">' +
          '<div style="display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:rgba(255,255,255,0.65);">' + checkSvg + ' 55-Trade Validation Cycle Completed</div>' +
          '<div style="display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:rgba(255,255,255,0.65);">' + checkSvg + ' 8/8 Weekly Equity Check-ins</div>' +
          '<div style="display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:rgba(255,255,255,0.65);">' + checkSvg + ' Profit Target Achieved (+' + data.profit.toFixed(1) + '%)</div>' +
          '<div style="display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:rgba(255,255,255,0.65);">' + checkSvg + ' Risk Governance Maintained</div>' +
          '<div style="display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:rgba(255,255,255,0.65);">' + checkSvg + ' Broker Statement Verified</div>' +
          '<div style="display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:rgba(234,179,8,0.8);">' + checkSvg + ' Added to Wall of Traders</div>' +
        '</div>' +
      '</div>';

    var accSection = '';
    if (!hasAcc) {
      accSection =
        '<div style="margin-top:1.25rem;padding:1.25rem;border-radius:14px;background:rgba(214,190,150,0.04);border:1px solid rgba(214,190,150,0.12);">' +
          '<div style="font-size:.7rem;font-weight:700;color:rgba(214,190,150,0.7);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.5rem;">Continue Your Journey</div>' +
          '<p style="font-size:.8rem;line-height:1.6;color:rgba(255,255,255,0.55);margin:0 0 1rem;">Your challenge access is now complete. Keep your operational edge with the full Accessories suite — Trading Log, PnL Tracker, Calendar, Wiki, Strategy Builder & more.</p>' +
          '<button id="accOfferBtn" style="display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.75rem 1.5rem;border:none;border-radius:10px;cursor:pointer;font-family:Inter,sans-serif;font-size:.82rem;font-weight:700;color:#fff;background:linear-gradient(135deg,rgba(214,190,150,0.9),rgba(180,150,100,0.95));box-shadow:0 4px 16px rgba(214,190,150,0.25);transition:all .2s;letter-spacing:.02em;width:100%;">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
            'Continue with Accessories \u2014 79 \u20ac / month' +
          '</button>' +
          '<p style="font-size:.62rem;color:rgba(255,255,255,0.25);margin:.6rem 0 0;line-height:1.4;">Cancel anytime. No commitment. Your challenge data remains permanently saved.</p>' +
        '</div>';
    } else {
      accSection =
        '<div style="margin-top:1rem;padding:.8rem 1rem;border-radius:10px;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.1);display:flex;align-items:center;gap:.5rem;justify-content:center;">' +
          checkSvg +
          '<span style="font-size:.78rem;color:rgba(34,197,94,0.7);">Accessories suite already active</span>' +
        '</div>';
    }

    card.innerHTML =
      '<div style="margin-bottom:1rem;">' + trophySvg + '</div>' +
      '<div style="display:inline-block;padding:.25rem .8rem;border-radius:100px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.15);font-size:.6rem;font-weight:700;color:rgba(34,197,94,0.8);text-transform:uppercase;letter-spacing:.12em;margin-bottom:.75rem;">Challenge Complete</div>' +
      '<h2 style="font-family:DM Serif Display,serif;font-size:1.5rem;color:rgba(255,255,255,0.95);margin:.5rem 0 .3rem;">Congratulations</h2>' +
      '<p style="font-size:.82rem;line-height:1.6;color:rgba(255,255,255,0.5);margin:0 0 .25rem;">You have successfully completed the <strong style="color:rgba(234,179,8,0.8);">' + productName + '</strong> validation cycle.</p>' +
      '<p style="font-size:.7rem;color:rgba(255,255,255,0.3);margin:0 0 .5rem;">Your profile has been added to the Wall of Traders.</p>' +
      statsHtml +
      achievementsHtml +
      accSection +
      '<button id="completionCloseBtn" style="display:block;margin:1.25rem auto 0;background:none;border:none;color:rgba(255,255,255,0.35);font-size:.78rem;cursor:pointer;padding:.5rem 1rem;font-family:Inter,sans-serif;transition:color .2s;">Close</button>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Attach events
    var closeBtn = document.getElementById('completionCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });

    var accBtn = document.getElementById('accOfferBtn');
    if (accBtn) {
      accBtn.addEventListener('click', function () {
        window.location.href = ACC_STRIPE + '?prefilled_email=' + encodeURIComponent(email);
      });
    }
  }

  /* ── Main check — runs on page load ──────────────────────────────── */
  function checkCompletion() {
    var email = getUserEmail();
    if (!email) return;

    var product = getChallengeProduct(email);
    if (!product) return;

    var alreadyCompleted = getCompletion(email);

    // If already completed → block re-purchase, optionally show modal
    if (alreadyCompleted) {
      blockRepurchaseButtons(email);
      return;
    }

    // Check current status
    var data = getCompletionData();

    if (data.complete) {
      // Mark as completed
      markCompleted(email, product, data);

      // Add to Wall of Traders
      addToWallOfTraders(email, product, data);

      // Block re-purchase buttons
      blockRepurchaseButtons(email);

      // Show completion modal (only once)
      var modalShown = localStorage.getItem(MODAL_SHOWN_KEY + email);
      if (!modalShown) {
        localStorage.setItem(MODAL_SHOWN_KEY + email, '1');
        // Slight delay for page to finish rendering
        setTimeout(function () { showCompletionModal(email, product, data); }, 800);
      }
    }
  }

  /* ── Render WoT entries from localStorage into social-proof page ── */
  function renderWotEntries() {
    var container = document.querySelector('.wot-tiles');
    if (!container) return;

    var entries = loadJSON(WOT_KEY) || [];
    if (entries.length === 0) return;

    // Find empty tiles and replace them
    var emptyTiles = container.querySelectorAll('.wot-tile--empty');
    entries.forEach(function (entry, idx) {
      // Check if already rendered
      if (container.querySelector('[data-wot-trader="' + entry.id + '"]')) return;

      var tile;
      if (idx < emptyTiles.length) {
        tile = emptyTiles[idx];
        tile.classList.remove('wot-tile--empty');
        tile.classList.add('wot-tile--verified');
      } else {
        tile = document.createElement('button');
        tile.className = 'wot-tile wot-tile--verified';
        tile.type = 'button';
        container.appendChild(tile);
      }

      tile.setAttribute('data-wot-trader', entry.id);
      var rank = String(idx + 2).padStart(2, '0'); // +2 because example is #01
      tile.innerHTML =
        '<div class="wot-tile-accent"></div>' +
        '<div class="wot-tile-rank">' + rank + '</div>' +
        '<div class="wot-tile-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>' +
        '<span class="wot-tile-nick">' + entry.nickname + '</span>' +
        '<span class="wot-tile-status">Funded Ready</span>';

      // Click to show detail
      tile.addEventListener('click', function () {
        showWotDetail(entry);
      });
    });
  }

  /* ── WoT Detail Overlay (dynamic) ────────────────────────────────── */
  function showWotDetail(entry) {
    var overlay = document.getElementById('wotDetailOverlay');
    if (!overlay) return;

    // Update detail fields
    var nickEl = document.getElementById('wotDetailNick');
    var scoreEl = document.getElementById('wotDetailScore');
    var regIdEl = document.getElementById('wotDetailRegId');

    if (nickEl) nickEl.textContent = entry.nickname;
    if (scoreEl) scoreEl.innerHTML = entry.score + '<span class="wot-detail-score-max"> / 100</span>';
    if (regIdEl) regIdEl.textContent = entry.id.toUpperCase();

    // Update bars
    var stats = entry.stats || {};
    var barData = {
      Discipline: Math.min(100, Math.round(stats.winRate || 0)),
      Consistency: Math.min(100, Math.round((stats.avgRR || 0) * 20)),
      'Risk Governance': Math.min(100, Math.round(100 - (stats.drawdown || 0) * 5)),
      Execution: Math.min(100, Math.round((stats.winRate || 0) * 0.8 + (stats.avgRR || 0) * 8)),
      Performance: Math.min(100, Math.round((stats.profit || 0) * 5))
    };
    var barRows = overlay.querySelectorAll('.wot-detail-bar-row');
    var barLabels = Object.keys(barData);
    barRows.forEach(function (row, i) {
      if (i < barLabels.length) {
        var fill = row.querySelector('.wot-detail-bar-fill');
        var val = row.querySelector('.wot-detail-bar-val');
        if (fill) fill.style.width = barData[barLabels[i]] + '%';
        if (val) val.textContent = barData[barLabels[i]];
      }
    });

    // Update metrics
    var metricVals = overlay.querySelectorAll('.wot-detail-metric-val');
    var metricData = [
      '+' + (stats.profit || 0).toFixed(1) + '%',
      (stats.drawdown || 0).toFixed(1) + '%',
      (stats.winRate || 0).toFixed(0) + '%',
      (stats.avgRR || 0).toFixed(2),
      String(stats.trades || 55),
      new Date(entry.completedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    ];
    metricVals.forEach(function (el, i) {
      if (i < metricData.length) el.textContent = metricData[i];
    });

    // Challenge info
    var infoVals = overlay.querySelectorAll('.wot-detail-info-val');
    if (infoVals[0]) infoVals[0].textContent = entry.product;

    // Show overlay
    overlay.style.display = 'flex';
    document.body.classList.add('vs-modal-body-lock');
  }

  /* ── Init ─────────────────────────────────────────────────────────── */
  function init() {
    checkCompletion();
    renderWotEntries();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-check when auth changes
  document.addEventListener('altivor:authchange', function () {
    setTimeout(checkCompletion, 500);
  });

  /* ── Public API ───────────────────────────────────────────────────── */
  window.AltivorCompletion = {
    check: checkCompletion,
    getCompletion: function () {
      var email = getUserEmail();
      return email ? getCompletion(email) : null;
    },
    isCompleted: function () {
      var email = getUserEmail();
      return email ? !!getCompletion(email) : false;
    },
    renderWot: renderWotEntries,
    showModal: function () {
      var email = getUserEmail();
      if (!email) return;
      var completion = getCompletion(email);
      if (!completion) return;
      var data = getCompletionData();
      showCompletionModal(email, completion.product, data);
    }
  };
})();
