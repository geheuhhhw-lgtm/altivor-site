/* ═══════════════════════════════════════════════════════════════════════════
   ALTIVOR — Social Proof Live Data Integration
   ─────────────────────────────────────────────────────────────────────────
   Fetches aggregated platform metrics from Supabase and populates
   the Social Proof page cards with real data.
   No private user data is exposed. Only aggregated counts/percentages.
   
   Requires: supabase-backend.js loaded first (provides AltivorBackend API).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Minimum thresholds to display data instead of empty-state ──────
  var MIN_TRADES_TO_SHOW   = 1;
  var MIN_USERS_TO_SHOW    = 1;
  var EMPTY_PLACEHOLDER    = '—';
  var CACHE_KEY            = 'altivor_social_metrics_cache';
  var CACHE_TTL_MS         = 5 * 60 * 1000; // 5 minutes

  // ── Helpers ─────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  function activateCard(id) {
    var el = $(id);
    if (el) el.classList.remove('sp-placeholder');
  }

  function formatInt(n) {
    var v = parseInt(n, 10);
    if (isNaN(v) || v < 0) return EMPTY_PLACEHOLDER;
    return v.toLocaleString('en-US');
  }

  function formatPct(n) {
    var v = parseFloat(n);
    if (isNaN(v)) return EMPTY_PLACEHOLDER;
    return v.toFixed(1) + '%';
  }

  function formatScore(n) {
    var v = parseFloat(n);
    if (isNaN(v) || v <= 0) return EMPTY_PLACEHOLDER;
    return Math.round(v) + ' / 100';
  }

  // ── Cache layer ────────────────────────────────────────────────────
  function getCachedMetrics() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (Date.now() - (cached._ts || 0) < CACHE_TTL_MS) return cached;
    } catch (_) {}
    return null;
  }

  function setCachedMetrics(data) {
    try {
      data._ts = Date.now();
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  // ── Platform Metrics rendering ─────────────────────────────────────
  function renderPlatformMetrics(m) {
    if (!m) return;

    var hasData = (m.total_submitted_trades || 0) >= MIN_TRADES_TO_SHOW
               || (m.active_users || 0) >= MIN_USERS_TO_SHOW;

    if (!hasData) return; // keep empty-state

    // Update info message
    var msgEl = $('spMetricsMsg');
    var subEl = $('spMetricsSub');
    if (msgEl) msgEl.textContent = 'Live aggregated platform statistics.';
    if (subEl) subEl.textContent = 'Data reflects verified framework participation across all users.';

    // Validated Trades
    if ((m.validated_trades || 0) > 0) {
      setText('spValValidatedTrades', formatInt(m.validated_trades));
      activateCard('spCardValidatedTrades');
    }

    // Active Users
    if ((m.active_users || 0) > 0) {
      setText('spValActiveUsers', formatInt(m.active_users));
      activateCard('spCardActiveUsers');
    }

    // PREPARE Completions
    if ((m.prepare_completions || 0) > 0) {
      setText('spValPrepare', formatInt(m.prepare_completions));
      activateCard('spCardPrepare');
    }

    // Wall of Traders
    if ((m.wall_of_traders_count || 0) > 0) {
      setText('spValWot', formatInt(m.wall_of_traders_count));
      activateCard('spCardWot');
    }
  }

  // ── Validation Analytics rendering ─────────────────────────────────
  function renderAnalytics(m) {
    if (!m) return;

    var hasData = (m.total_submitted_trades || 0) >= MIN_TRADES_TO_SHOW;
    if (!hasData) return;

    var msgEl = $('spAnalyticsMsg');
    var subEl = $('spAnalyticsSub');
    if (msgEl) msgEl.textContent = 'Aggregated execution, compliance, and validation data.';
    if (subEl) subEl.textContent = 'Metrics derived from verified platform participation.';

    // Execution Score
    if ((m.average_execution_score || 0) > 0) {
      setText('spValExecScore', formatScore(m.average_execution_score));
      activateCard('spCardExecScore');
    }

    // Rule Compliance
    if ((m.rule_compliance_percent || 0) > 0) {
      setText('spValCompliance', formatPct(m.rule_compliance_percent));
      activateCard('spCardCompliance');
    }

    // Validation Outcomes: show completed / (active + completed) if any challenges exist
    var active = m.active_challenges || 0;
    var completed = m.completed_challenges || 0;
    var total = active + completed;
    if (total > 0) {
      var pct = ((completed / total) * 100).toFixed(1);
      setText('spValOutcomes', pct + '%');
      activateCard('spCardOutcomes');
    } else if ((m.validated_trades || 0) > 0 && (m.total_submitted_trades || 0) > 0) {
      // Fallback: validated trades / total submitted
      var vpct = ((m.validated_trades / m.total_submitted_trades) * 100).toFixed(1);
      setText('spValOutcomes', vpct + '%');
      activateCard('spCardOutcomes');
    }
  }

  // ── Wall of Traders rendering ──────────────────────────────────────
  function renderWallOfTraders(traders) {
    var container = document.querySelector('#graduates .wot-tiles');
    if (!container || !traders || traders.length === 0) return;

    // Find the example tile to keep it, remove existing backend-rendered tiles
    var existing = container.querySelectorAll('.wot-tile[data-wot-backend]');
    for (var i = 0; i < existing.length; i++) {
      existing[i].parentNode.removeChild(existing[i]);
    }

    // Find empty placeholder tiles
    var emptyTiles = Array.prototype.slice.call(container.querySelectorAll('.wot-tile--empty'));

    traders.forEach(function (trader, idx) {
      var rank = String(idx + 1).padStart(2, '0');
      var displayName = trader.anonymized_name || trader.display_name || 'Trader';
      var score = parseFloat(trader.trader_score) || 0;
      var rating = trader.discipline_rating || 'N/A';

      var tile;
      if (idx < emptyTiles.length) {
        // Replace an empty placeholder tile
        tile = emptyTiles[idx];
        tile.classList.remove('wot-tile--empty');
        tile.classList.add('wot-tile--verified');
      } else {
        // Create a new tile
        tile = document.createElement('button');
        tile.className = 'wot-tile wot-tile--verified';
        tile.type = 'button';
        container.appendChild(tile);
      }

      tile.setAttribute('data-wot-backend', trader.id);
      tile.setAttribute('data-wot-trader', trader.id);
      tile.innerHTML =
        '<div class="wot-tile-accent"></div>' +
        '<div class="wot-tile-rank">' + rank + '</div>' +
        '<div class="wot-tile-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>' +
        '<span class="wot-tile-nick">' + displayName + '</span>' +
        '<span class="wot-tile-status">Funded Ready</span>';

      // Click handler to populate detail overlay
      tile.addEventListener('click', function () {
        populateWotDetail(trader);
        var overlay = document.getElementById('wotDetailOverlay');
        if (overlay) {
          overlay.style.display = 'flex';
          document.body.classList.add('vs-modal-body-lock');
        }
      });
    });

    // Hide the static example tile if real traders exist
    var exampleTile = container.querySelector('.wot-tile--example');
    if (exampleTile && traders.length > 0) {
      exampleTile.style.display = 'none';
    }
  }

  function populateWotDetail(trader) {
    var score = Math.round(parseFloat(trader.trader_score) || 0);
    var profit = parseFloat(trader.net_profit_percent) || 0;
    var drawdown = parseFloat(trader.max_drawdown) || 0;
    var trades = parseInt(trader.validated_trades, 10) || 0;
    var rating = trader.discipline_rating || 'N/A';
    var name = trader.anonymized_name || trader.display_name || 'Trader';
    var completed = trader.completed_at ? new Date(trader.completed_at) : null;

    setText('wotDetailNick', name);
    setText('wotDetailScore', '');
    var scoreEl = $('wotDetailScore');
    if (scoreEl) scoreEl.innerHTML = score + '<span class="wot-detail-score-max"> / 100</span>';

    // Key metrics
    var metricsGrid = document.querySelector('.wot-detail-metrics-grid');
    if (metricsGrid) {
      var vals = metricsGrid.querySelectorAll('.wot-detail-metric-val');
      var labels = metricsGrid.querySelectorAll('.wot-detail-metric-label');
      if (vals.length >= 6) {
        vals[0].textContent = '+' + profit.toFixed(1) + '%';
        vals[1].textContent = drawdown.toFixed(1) + '%';
        vals[2].textContent = rating;
        vals[3].textContent = score + '/100';
        vals[4].textContent = String(trades);
        vals[5].textContent = completed ? completed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A';
      }
      if (labels.length >= 6) {
        labels[0].textContent = 'Cumulative Profit';
        labels[1].textContent = 'Max Drawdown';
        labels[2].textContent = 'Discipline Rating';
        labels[3].textContent = 'Trader Score';
        labels[4].textContent = 'Validated Trades';
        labels[5].textContent = 'Completion Date';
      }
    }

    // Update footer seal for real traders
    var footer = document.querySelector('.wot-detail-footer span');
    if (footer) {
      footer.innerHTML = 'Verified Completion &mdash; ALTIVOR Validation Challenge';
    }
  }

  // ── Main fetch + render pipeline ───────────────────────────────────
  function loadAndRender() {
    if (!window.AltivorBackend || !window.AltivorBackend.fetchSocialMetrics) {
      console.warn('[SocialProof] AltivorBackend not available');
      return;
    }

    // Try cache first for instant render
    var cached = getCachedMetrics();
    if (cached) {
      renderPlatformMetrics(cached);
      renderAnalytics(cached);
    }

    // Fetch fresh data
    window.AltivorBackend.fetchSocialMetrics().then(function (metrics) {
      if (!metrics) {
        if (!cached) console.log('[SocialProof] No metrics available yet');
        return;
      }
      setCachedMetrics(metrics);
      renderPlatformMetrics(metrics);
      renderAnalytics(metrics);
    });

    // Fetch WoT entries
    window.AltivorBackend.fetchPublicWallOfTraders().then(function (traders) {
      if (traders && traders.length > 0) {
        renderWallOfTraders(traders);
      }
    });
  }

  // ── Init ────────────────────────────────────────────────────────────
  function init() {
    loadAndRender();

    // Re-render after challenge sync completes
    document.addEventListener('altivor:challenge-synced', function () {
      // Invalidate cache and re-fetch
      try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
      setTimeout(loadAndRender, 1000);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
