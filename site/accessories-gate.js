'use strict';

/* ─── ALTIVOR Accessories Subscription Gate ───────────────────────────────
   Storage key: altivor_acc_sub
   Format: { active: true, plan: 'standard'|'discounted', expiry: ISO string }
   plan 'discounted' = 59€/mo (challenge pass discount)
   plan 'standard'   = 79€/mo (standard rate)
   For demo/dev: set via localStorage.setItem('altivor_acc_sub', JSON.stringify({active:true,plan:'standard',expiry:'2099-01-01'}))
   ───────────────────────────────────────────────────────────────────────── */

(function () {

  var STORAGE_KEY = 'altivor_acc_sub';

  function getSubState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.active) return null;
      if (data.expiry && new Date(data.expiry) < new Date()) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  function buildOverlay(sub) {
    var overlay = document.createElement('div');
    overlay.className = 'acc-gate-overlay';
    overlay.id = 'accGateOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'accGateTitle');

    var priceHtml = '';
    if (sub === null) {
      priceHtml = '<div class="acc-gate-price"><span class="acc-gate-price-main">79 <span class="acc-gate-currency">€</span></span><span class="acc-gate-price-period">/ month</span></div>'
        + '<div class="acc-gate-price-note">Pass a Challenge to unlock <strong>59 € / month</strong> — permanent discount.</div>';
    }

    overlay.innerHTML =
      '<div class="acc-gate-panel">'
      + '<div class="acc-gate-lock-icon" aria-hidden="true">'
      + '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
      + '<rect x="3" y="11" width="18" height="11" rx="2"/>'
      + '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
      + '</svg>'
      + '</div>'
      + '<p class="acc-gate-label">Accessories Suite</p>'
      + '<h2 class="acc-gate-title" id="accGateTitle">Subscription Required</h2>'
      + '<p class="acc-gate-body">Access to the Accessories suite — Trading Log, PnL Calendar, Economic Calendar, Trading Symbols, Execution Checklist, and Trading Calculators — requires an active monthly subscription.</p>'
      + priceHtml
      + '<div class="acc-gate-features">'
      + '<div class="acc-gate-feat"><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Trading Log — Daily Journal</div>'
      + '<div class="acc-gate-feat"><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> PnL Calendar — Heatmap Tracker</div>'
      + '<div class="acc-gate-feat"><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Economic Calendar</div>'
      + '<div class="acc-gate-feat"><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Trading Symbols — Spreads &amp; Swaps</div>'
      + '<div class="acc-gate-feat"><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Execution Checklist</div>'
      + '<div class="acc-gate-feat"><svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Trading Calculators</div>'
      + '</div>'
      + '<div class="acc-gate-actions">'
      + '<a href="index.html#pricing" class="btn btn-primary acc-gate-btn">Subscribe — Accessories</a>'
      + '<a href="index.html#pricing" class="acc-gate-link">View all access options</a>'
      + '</div>'
      + '<p class="acc-gate-fine">No challenge required. Cancel anytime. Discounted rate available after passing a Challenge.</p>'
      + '</div>';

    return overlay;
  }

  function applyGate() {
    /* DEMO MODE: Accessories always unlocked — gate disabled */
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyGate);
  } else {
    applyGate();
  }

})();
