/* ═══════════════════════════════════════════════════════════════════════════
   ALTIVOR — Address Autocomplete (OpenStreetMap Nominatim — no API key)
   Auto-attaches to #regAddress and #editAddress via MutationObserver.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  var DEBOUNCE_MS = 350;
  var MIN_CHARS = 3;
  var MAX_RESULTS = 6;

  /* ── Inject styles once ─────────────────────────────────────────────── */
  if (!document.getElementById('addr-ac-css')) {
    var css = document.createElement('style');
    css.id = 'addr-ac-css';
    css.textContent =
      '.addr-ac-wrap{position:relative}' +
      '.addr-ac-drop{position:absolute;left:0;right:0;top:100%;margin-top:4px;background:var(--card-bg,#141418);border:1px solid var(--border-default,rgba(255,255,255,.08));border-radius:.55rem;box-shadow:0 12px 40px rgba(0,0,0,.45);z-index:9999;max-height:220px;overflow-y:auto;display:none;padding:4px}' +
      '.addr-ac-drop.open{display:block;animation:addrIn .12s ease}' +
      '@keyframes addrIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}' +
      '.addr-ac-opt{padding:.5rem .75rem;font-size:.74rem;color:var(--txt-secondary,#a1a1aa);cursor:pointer;border-radius:.4rem;transition:background .1s,color .1s;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.addr-ac-opt:hover,.addr-ac-opt.hl{background:var(--accent-glow,rgba(167,139,250,.06));color:var(--txt-primary,#fafafa)}' +
      '.addr-ac-opt b{color:var(--txt-primary,#fafafa);font-weight:600}' +
      '.addr-ac-msg{padding:.6rem .75rem;font-size:.72rem;color:var(--txt-secondary,#6e6e73);text-align:center}' +
      '.addr-ac-err{font-size:.66rem;color:var(--error,#f87171);margin-top:4px;display:none}';
    document.head.appendChild(css);
  }

  /* ── IP bias for better local results ───────────────────────────────── */
  var ipBias = null;
  try {
    fetch('https://ipapi.co/json/')
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.latitude) ipBias = { lat: +d.latitude, lon: +d.longitude }; })
      .catch(function () {});
  } catch (_) {}

  function esc(s) { var d = document.createElement('span'); d.textContent = s; return d.innerHTML; }

  /* ── Attach to one input ────────────────────────────────────────────── */
  function attach(input) {
    if (!input || input._addrAC) return;
    input._addrAC = true;

    // Wrap input
    var wrap = document.createElement('div');
    wrap.className = 'addr-ac-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    // Dropdown
    var drop = document.createElement('div');
    drop.className = 'addr-ac-drop';
    wrap.appendChild(drop);

    // Error
    var err = document.createElement('div');
    err.className = 'addr-ac-err';
    err.textContent = 'Please select a valid address from the suggestions.';
    wrap.appendChild(err);

    var timer, results = [], hlIdx = -1, picked = false;
    input.setCustomValidity('Start typing and select an address from the list.');

    function open() { drop.classList.add('open'); }
    function close() { drop.classList.remove('open'); hlIdx = -1; }

    function render(items, loading) {
      drop.innerHTML = ''; results = items || []; hlIdx = -1;
      if (loading) { drop.innerHTML = '<div class="addr-ac-msg">Searching\u2026</div>'; open(); return; }
      if (!results.length) {
        if ((input.value || '').trim().length >= MIN_CHARS) { drop.innerHTML = '<div class="addr-ac-msg">No addresses found</div>'; open(); }
        else close();
        return;
      }
      var q = (input.value || '').trim().toLowerCase();
      results.forEach(function (r, i) {
        var div = document.createElement('div');
        div.className = 'addr-ac-opt';
        var t = r.display, idx = t.toLowerCase().indexOf(q);
        div.innerHTML = idx >= 0 ? esc(t.slice(0, idx)) + '<b>' + esc(t.slice(idx, idx + q.length)) + '</b>' + esc(t.slice(idx + q.length)) : esc(t);
        div.addEventListener('mousedown', function (e) { e.preventDefault(); pick(i); });
        drop.appendChild(div);
      });
      open();
    }

    function pick(i) {
      if (!results[i]) return;
      input.value = results[i].display;
      picked = true;
      err.style.display = 'none';
      input.setCustomValidity('');
      close();
    }

    function setHl(i) {
      var opts = drop.querySelectorAll('.addr-ac-opt');
      opts.forEach(function (o) { o.classList.remove('hl'); });
      if (i >= 0 && i < opts.length) { opts[i].classList.add('hl'); opts[i].scrollIntoView({ block: 'nearest' }); }
      hlIdx = i;
    }

    /* ── Nominatim fetch ─────────────────────────────────────────────── */
    function query(q) {
      var url = NOMINATIM + '?format=json&q=' + encodeURIComponent(q) + '&addressdetails=1&limit=' + MAX_RESULTS;
      if (ipBias) { var d = 2; url += '&viewbox=' + (ipBias.lon - d) + ',' + (ipBias.lat - d) + ',' + (ipBias.lon + d) + ',' + (ipBias.lat + d) + '&bounded=0'; }
      return fetch(url).then(function (r) { return r.json(); }).then(function (data) {
        return (data || []).map(function (item) {
          var a = item.address || {};
          var parts = [
            a.house_number ? (a.road ? a.road + ' ' + a.house_number : a.house_number) : a.road,
            a.suburb || a.neighbourhood, a.postcode,
            a.city || a.town || a.village || a.municipality,
            a.state, a.country
          ].filter(Boolean);
          return { display: parts.join(', ') || item.display_name };
        });
      });
    }

    /* ── Events ──────────────────────────────────────────────────────── */
    input.addEventListener('input', function () {
      picked = false; err.style.display = 'none';
      input.setCustomValidity('Please select a valid address from the suggestions.');
      var q = (input.value || '').trim();
      if (q.length < MIN_CHARS) { render([]); return; }
      clearTimeout(timer);
      render(null, true);
      timer = setTimeout(function () {
        query(q).then(function (items) { render(items); }).catch(function () { render([]); });
      }, DEBOUNCE_MS);
    });

    input.addEventListener('keydown', function (e) {
      if (!drop.classList.contains('open') || !results.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setHl(hlIdx < results.length - 1 ? hlIdx + 1 : 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHl(hlIdx > 0 ? hlIdx - 1 : results.length - 1); }
      else if (e.key === 'Enter' && hlIdx >= 0) { e.preventDefault(); pick(hlIdx); }
      else if (e.key === 'Escape') close();
    });

    input.addEventListener('focus', function () { if (results.length && !picked) open(); });
    input.addEventListener('blur', function () { setTimeout(close, 120); });

    /* ── Block submit if no valid address picked ─────────────────────── */
    function blockIfInvalid() {
      if (!(input.value || '').trim()) return true;
      if (!picked) {
        err.style.display = 'block';
        input.setCustomValidity('Please select a valid address from the suggestions.');
        input.reportValidity();
        input.focus();
        return false;
      }
      return true;
    }

    // Capture phase on document — fires before any other handler
    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form || !form.contains(input)) return;
      if (!blockIfInvalid()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);

    // Also intercept any JS that calls form.submit() or clicks submit btn
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('button[type="submit"], input[type="submit"]');
      if (!btn) return;
      var form = btn.closest('form');
      if (!form || !form.contains(input)) return;
      if (!blockIfInvalid()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
  }

  /* ── Scan & auto-attach ─────────────────────────────────────────────── */
  function scan() {
    ['regAddress', 'editAddress'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) attach(el);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
  new MutationObserver(scan).observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
