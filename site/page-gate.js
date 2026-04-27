/* ═══════════════════════════════════════════════════════════════════════
   ALTIVOR — Page Gate (hard block)
   Loaded synchronously in <head> BEFORE any body content renders.
   Reads localStorage directly — zero dependency on any other script.
   If user is not authorized, the page NEVER becomes visible.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SESSION_KEY  = 'altivor_session';
  var ACC_KEY      = 'altivor_acc_purchased_';
  var FWPACK_KEY   = 'altivor_fwpack_purchased_';
  var US100_KEY    = 'altivor_us100_purchased_';
  var PREPARE_KEY  = 'altivor_prepare_purchased_';

  /* ── Which pages need what ─────────────────────────────────────────── */
  var CHALLENGE_PAGES = [
    'verification.html','verification-trades.html','verification-status.html',
    'verification-drawdown.html','verification-profit.html',
    'verification-statement.html','verification-weekly.html'
  ];
  var ACC_PAGES = [
    'accessories.html','trading-log.html','pnl.html','calendar.html',
    'symbols.html','execution-checklist.html','calculators.html',
    'trading-wiki.html','strategy-builder.html'
  ];
  var PRODUCTFILES_PAGES = ['us100-product-files.html'];

  /* ── Identify current page ─────────────────────────────────────────── */
  var path = window.location.pathname.split('/').pop() || '';
  var page = path.split('?')[0].split('#')[0].toLowerCase();
  // Handle clean URLs: /trading-log → trading-log.html
  if (page && page.indexOf('.') === -1) page = page + '.html';

  var need = null; // 'challenge' | 'acc' | 'productfiles'
  if (CHALLENGE_PAGES.indexOf(page) !== -1)      need = 'challenge';
  else if (ACC_PAGES.indexOf(page) !== -1)        need = 'acc';
  else if (PRODUCTFILES_PAGES.indexOf(page) !== -1) need = 'productfiles';

  if (!need) return; // not a gated page — do nothing

  /* ── Read session from localStorage (synchronous) ──────────────────── */
  var session = null;
  var email   = null;
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      session = JSON.parse(raw);
      if (session && session.user && session.user.email) {
        email = session.user.email.trim().toLowerCase();
      }
    }
  } catch (_) {}

  /* ── Full-access users (all products purchased) ───────────────────── */
  if (email === 'brzozowskioff12@gmail.com') {
    localStorage.setItem(PREPARE_KEY + email, '1');
    localStorage.setItem(FWPACK_KEY + email, '1');
    localStorage.setItem(US100_KEY + email, '1');
    localStorage.setItem(ACC_KEY + email, '1');
  }

  /* ── Check authorization ───────────────────────────────────────────── */
  var authorized = false;

  if (email) {
    if (need === 'challenge') {
      authorized = localStorage.getItem(FWPACK_KEY + email) === '1'
                || localStorage.getItem(US100_KEY + email) === '1';
    } else if (need === 'acc') {
      authorized = localStorage.getItem(ACC_KEY + email) === '1'
                || localStorage.getItem(US100_KEY + email) === '1';
    } else if (need === 'productfiles') {
      var hasPrepare  = localStorage.getItem(PREPARE_KEY + email) === '1';
      var hasChallenge = localStorage.getItem(FWPACK_KEY + email) === '1'
                      || localStorage.getItem(US100_KEY + email) === '1';
      authorized = hasPrepare && hasChallenge;
    }
  }

  if (authorized) {
    // Synchronous check passed — schedule async Supabase verification
    // If Supabase says user does NOT have access, reblock the page
    (function verifyAsync() {
      function doVerify() {
        if (!window.AltivorBackend || !window.AltivorBackend.loadEntitlements) return;
        window.AltivorBackend.loadEntitlements().then(function (ents) {
          var products = {};
          (ents || []).forEach(function (e) { if (e.status === 'active') products[e.product_key] = true; });
          var ok = false;
          if (need === 'challenge') ok = !!products['frameworkPack'] || !!products['us100Framework'];
          else if (need === 'acc') ok = !!products['accessories'] || !!products['us100Framework'];
          else if (need === 'productfiles') ok = !!products['prepare'] && (!!products['frameworkPack'] || !!products['us100Framework']);
          if (!ok && email !== 'brzozowskioff12@gmail.com') {
            // Supabase says no access — clear fake localStorage keys and reblock
            localStorage.removeItem(FWPACK_KEY + email);
            localStorage.removeItem(US100_KEY + email);
            localStorage.removeItem(ACC_KEY + email);
            localStorage.removeItem(PREPARE_KEY + email);
            window.location.reload();
          }
        }).catch(function () { /* network error — trust localStorage cache */ });
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(doVerify, 1000); });
      else setTimeout(doVerify, 1000);
    })();
    return; // let page render normally with localStorage cache
  }

  /* ══════════════════════════════════════════════════════════════════════
     BLOCK THE PAGE — user is not authorized
     ══════════════════════════════════════════════════════════════════════ */

  // 1. Immediately hide EVERYTHING so content never flashes
  document.documentElement.style.visibility = 'hidden';
  document.documentElement.style.overflow   = 'hidden';

  // 2. Inject a full-screen blocker + styled modal as soon as DOM is ready
  function injectBlocker() {
    // Re-hide body in case something overrode it
    document.body.style.visibility = 'hidden';
    document.body.style.overflow   = 'hidden';

    var isLoggedIn = Boolean(email);

    // Build blocker overlay
    var blocker = document.createElement('div');
    blocker.id = 'altivorHardGate';
    blocker.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:999999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.92)',
      'backdrop-filter:blur(24px)', '-webkit-backdrop-filter:blur(24px)',
      'visibility:visible', 'overflow:auto'
    ].join(';');

    var lockSvg = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(214,190,150,0.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

    var title, desc, buttons;

    if (!isLoggedIn) {
      title   = 'Authentication Required';
      desc    = 'Sign in or create an account to access this page.';
      buttons =
        '<button onclick="if(typeof openModal===\'function\')openModal(\'loginModal\')" style="BTNFILL">Sign In</button>' +
        '<button onclick="if(typeof openModal===\'function\')openModal(\'registerModal\')" style="BTNOUT">Create Account</button>' +
        '<button onclick="window.location.href=\'index.html\'" style="BTNLINK">\u2190 Back to Home</button>';
    } else {
      // Logged in but missing product
      var productName, productDesc;
      if (need === 'challenge') {
        productName = 'Challenge Access Required';
        productDesc = 'This page is available exclusively to Framework Pack or US100 Challenge participants.';
      } else if (need === 'acc') {
        productName = 'Accessories Access Required';
        productDesc = 'The Accessories suite is available with an Accessories subscription (79 \u20ac/mo) or included free with the US100 Challenge (129 \u20ac).';
      } else {
        productName = 'PREPARE + Challenge Required';
        productDesc = 'Product Files require PREPARE qualification and an active challenge product.';
      }
      title   = productName;
      desc    = productDesc;
      buttons =
        '<button onclick="window.location.href=\'index.html#pricing\'" style="BTNFILL">View Plans</button>' +
        '<button onclick="window.location.href=\'index.html\'" style="BTNLINK">\u2190 Back to Home</button>';
    }

    var btnFill = 'display:flex;align-items:center;justify-content:center;width:100%;padding:.75rem 1.5rem;border:none;border-radius:10px;cursor:pointer;font-family:Inter,sans-serif;font-size:.82rem;font-weight:700;color:#fff;background:linear-gradient(135deg,rgba(214,190,150,0.9),rgba(180,150,100,0.95));box-shadow:0 4px 16px rgba(214,190,150,0.25);margin-bottom:.5rem;letter-spacing:.02em;transition:all .2s';
    var btnOut  = 'display:flex;align-items:center;justify-content:center;width:100%;padding:.7rem 1.5rem;border-radius:10px;cursor:pointer;font-family:Inter,sans-serif;font-size:.8rem;font-weight:700;color:rgba(255,255,255,0.8);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);margin-bottom:.75rem;letter-spacing:.02em;transition:all .2s';
    var btnLink = 'display:block;margin:0 auto;background:none;border:none;color:rgba(255,255,255,0.3);font-size:.72rem;cursor:pointer;padding:.4rem;font-family:Inter,sans-serif';

    buttons = buttons
      .replace(/BTNFILL/g, btnFill)
      .replace(/BTNOUT/g, btnOut)
      .replace(/BTNLINK/g, btnLink);

    var card = document.createElement('div');
    card.style.cssText = 'position:relative;max-width:400px;width:92%;padding:2rem 1.75rem;border-radius:18px;background:rgba(20,20,26,0.97);border:1px solid rgba(214,190,150,0.1);box-shadow:0 24px 64px rgba(0,0,0,0.5);text-align:center;font-family:Inter,sans-serif';

    card.innerHTML =
      '<div style="margin-bottom:1.2rem">' + lockSvg + '</div>' +
      '<h3 style="font-family:DM Serif Display,serif;font-size:1.25rem;color:rgba(214,190,150,0.9);margin:0 0 .4rem">' + title + '</h3>' +
      '<p style="font-size:.78rem;line-height:1.55;color:rgba(255,255,255,0.45);margin:0 0 1.5rem">' + desc + '</p>' +
      buttons;

    blocker.appendChild(card);
    document.body.appendChild(blocker);

    // ESC → home
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') window.location.href = 'index.html';
    });
    // Click outside card → home
    blocker.addEventListener('click', function (e) {
      if (e.target === blocker) window.location.href = 'index.html';
    });

    // Listen for auth state changes (user logs in via modal)
    document.addEventListener('altivor:authchange', function () {
      // Re-read session — only reload if user is NOW authorized
      var s2 = null, e2 = null;
      try {
        var r2 = localStorage.getItem(SESSION_KEY);
        if (r2) { s2 = JSON.parse(r2); if (s2 && s2.user && s2.user.email) e2 = s2.user.email.trim().toLowerCase(); }
      } catch (_) {}
      if (!e2) return; // still no session — don't reload
      // Check if they now have the required product
      var ok = false;
      if (need === 'challenge') {
        ok = localStorage.getItem(FWPACK_KEY + e2) === '1' || localStorage.getItem(US100_KEY + e2) === '1';
      } else if (need === 'acc') {
        ok = localStorage.getItem(ACC_KEY + e2) === '1' || localStorage.getItem(US100_KEY + e2) === '1';
      } else if (need === 'productfiles') {
        ok = (localStorage.getItem(PREPARE_KEY + e2) === '1') && (localStorage.getItem(FWPACK_KEY + e2) === '1' || localStorage.getItem(US100_KEY + e2) === '1');
      }
      if (ok) {
        window.location.reload();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBlocker);
  } else {
    injectBlocker();
  }
})();
