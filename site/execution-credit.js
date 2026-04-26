/* ═══════════════════════════════════════════════════════════════════════════
   ALTIVOR — Execution Credit (frontend)
   ─────────────────────────────────────────────────────────────────────────
   Detects PREPARE completion (status = QUALIFIED), calls the Supabase Edge
   Function to generate a unique €20 Stripe promotion code for US100
   Challenge, caches the result, and provides UI (modal + profile widgets).

   Public API:  window.AltivorExecutionCredit
     .check()       — run detection + generation
     .getCredit()   — return cached credit object or null
     .showModal()   — force-show the credit modal
     .isExpired()   — boolean
     .renderProfile() — update profile page widgets
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var BASE = 'https://lssedurdadjngqbchjbj.supabase.co';
    var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxzc2VkdXJkYWRqbmdxYmNoamJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTk5OTksImV4cCI6MjA5MjEzNTk5OX0.PG6Ljeo9i0apJkU-X0QWsoS0KMn5CmnmFtmaIl3JdAs';
    var SESSION_KEY = 'altivor_session';
    var CREDIT_CACHE_KEY = 'altivor_execution_credit_';
    var PREPARE_STATUS_KEY = 'altivor-prepare-status';
    var US100_CHECKOUT = 'https://buy.stripe.com/00wdRabQt93M5Wde2Edby00';

    /* ── Helpers ────────────────────────────────────────────────────────── */
    function getToken() {
        try {
            var s = JSON.parse(localStorage.getItem(SESSION_KEY));
            return s && s.access_token ? s.access_token : null;
        } catch (_) { return null; }
    }

    function getUserEmail() {
        try {
            var s = JSON.parse(localStorage.getItem(SESSION_KEY));
            return s && s.user && s.user.email ? s.user.email : null;
        } catch (_) { return null; }
    }

    function isPrepareQualified() {
        return localStorage.getItem(PREPARE_STATUS_KEY) === 'QUALIFIED';
    }

    function getCachedCredit() {
        var email = getUserEmail();
        if (!email) return null;
        try {
            var raw = localStorage.getItem(CREDIT_CACHE_KEY + email);
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    }

    function cacheCredit(credit) {
        var email = getUserEmail();
        if (!email || !credit) return;
        try { localStorage.setItem(CREDIT_CACHE_KEY + email, JSON.stringify(credit)); } catch (_) {}
    }

    function isExpired(credit) {
        if (!credit || !credit.expires_at) return true;
        return new Date(credit.expires_at).getTime() < Date.now();
    }

    function formatTimeRemaining(expiresAt) {
        var ms = new Date(expiresAt).getTime() - Date.now();
        if (ms <= 0) return 'Expired';
        var h = Math.floor(ms / 3600000);
        var m = Math.floor((ms % 3600000) / 60000);
        return h > 0 ? h + 'h ' + m + 'm remaining' : m + 'm remaining';
    }

    function formatExpiry(expiresAt) {
        var d = new Date(expiresAt);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
            ' at ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }

    /* ── API call ───────────────────────────────────────────────────────── */
    function generateCredit(callback) {
        var email = getUserEmail();
        if (!email) { callback(null); return; }

        var token = getToken();
        var authValue = token ? 'Bearer ' + token : 'Bearer ' + ANON_KEY;

        var xhr = new XMLHttpRequest();
        xhr.open('POST', BASE + '/functions/v1/generate-execution-credit', true);
        xhr.setRequestHeader('Authorization', authValue);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('apikey', ANON_KEY);
        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    var code = data.code || data.promotion_code;
                    if (code) {
                        var credit = {
                            promotion_code: code,
                            expires_at: data.expires_at || new Date(Date.now() + 100 * 60 * 60 * 1000).toISOString(),
                            used: data.used || false,
                            used_at: data.used_at || null,
                            already_exists: data.already_exists || false
                        };
                        cacheCredit(credit);
                        callback(credit);
                        return;
                    }
                } catch (_) {}
            }
            console.error('[ExecutionCredit] API error:', xhr.status, xhr.responseText);
            callback(null);
        };
        xhr.onerror = function () {
            console.error('[ExecutionCredit] Network error');
            callback(null);
        };
        xhr.send(JSON.stringify({ email: email }));
    }

    /* ── Modal UI ───────────────────────────────────────────────────────── */
    function showCreditModal(credit) {
        if (!credit || credit.used) return;
        if (document.getElementById('ecCreditModal')) return;

        var expired = isExpired(credit);
        var email = getUserEmail() || '';
        var checkoutUrl = US100_CHECKOUT + '?prefilled_email=' + encodeURIComponent(email);

        // Inject keyframes once
        if (!document.getElementById('ecCreditStyles')) {
            var style = document.createElement('style');
            style.id = 'ecCreditStyles';
            style.textContent =
                '@keyframes ecFadeIn{from{opacity:0}to{opacity:1}}' +
                '@keyframes ecSlideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}';
            document.head.appendChild(style);
        }

        var iconColor = expired ? 'rgba(128,128,128,0.4)' : 'rgba(214,190,150,0.7)';
        var statusColor = expired ? 'rgba(239,68,68,0.7)' : 'rgba(52,211,153,0.7)';
        var statusLabel = expired ? 'Expired' : 'Active';
        var statusBg = expired ? 'rgba(239,68,68,0.08)' : 'rgba(52,211,153,0.08)';
        var statusBorder = expired ? 'rgba(239,68,68,0.12)' : 'rgba(52,211,153,0.12)';

        var overlay = document.createElement('div');
        overlay.id = 'ecCreditModal';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:ecFadeIn .3s ease';

        var card = document.createElement('div');
        card.style.cssText = 'max-width:440px;width:92%;padding:2.25rem 2rem;border-radius:20px;background:rgba(20,20,26,0.97);border:1px solid rgba(214,190,150,0.15);box-shadow:0 32px 80px rgba(0,0,0,0.5);text-align:center;font-family:Inter,sans-serif;animation:ecSlideUp .4s ease .1s both;position:relative';

        card.innerHTML =
            /* Icon */
            '<div style="width:64px;height:64px;border-radius:50%;background:rgba(214,190,150,0.06);border:2px solid rgba(214,190,150,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem">' +
                '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="' + iconColor + '" stroke-width="1.5"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></svg>' +
            '</div>' +
            /* Status pill */
            '<div style="display:inline-flex;align-items:center;gap:.35rem;padding:.22rem .7rem;border-radius:2rem;font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;background:' + statusBg + ';color:' + statusColor + ';border:1px solid ' + statusBorder + ';margin-bottom:.85rem">' +
                '<span style="width:6px;height:6px;border-radius:50%;background:currentColor"></span>' + statusLabel +
            '</div>' +
            /* Title */
            '<h3 style="font-family:DM Serif Display,serif;font-size:1.3rem;color:rgba(214,190,150,0.9);margin:0 0 .3rem">Execution Credit Unlocked</h3>' +
            '<p style="font-size:.8rem;color:rgba(255,255,255,0.45);margin:0 0 1.5rem;line-height:1.55">\u20ac20 credit toward the ALTIVOR US100 Challenge</p>' +
            /* Code box */
            '<div style="background:rgba(214,190,150,0.04);border:1px solid rgba(214,190,150,0.1);border-radius:12px;padding:1.25rem;margin-bottom:1.25rem">' +
                '<div style="font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,0.3);margin-bottom:.5rem">Your Promotion Code</div>' +
                '<div style="font-family:JetBrains Mono,Courier New,monospace;font-size:1.4rem;font-weight:700;color:rgba(214,190,150,0.9);letter-spacing:.15em;margin-bottom:.5rem;' + (expired ? 'text-decoration:line-through;opacity:.4' : '') + '">' + credit.promotion_code + '</div>' +
                (!expired ? '<button id="ecCopyBtn" style="font-size:.68rem;font-weight:700;padding:.3rem .8rem;border-radius:.4rem;border:1px solid rgba(214,190,150,0.2);background:rgba(214,190,150,0.06);color:rgba(214,190,150,0.8);cursor:pointer;font-family:Inter,sans-serif;transition:all .2s">Copy Code</button>' : '') +
            '</div>' +
            /* Stats row */
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:8px;overflow:hidden;margin-bottom:1.25rem">' +
                '<div style="padding:.7rem;background:rgba(20,20,26,0.97)">' +
                    '<div style="font-size:.55rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,0.3);margin-bottom:.2rem">Value</div>' +
                    '<div style="font-family:DM Serif Display,serif;font-size:1.1rem;color:rgba(214,190,150,0.85)">\u20ac20</div>' +
                '</div>' +
                '<div style="padding:.7rem;background:rgba(20,20,26,0.97)">' +
                    '<div style="font-size:.55rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,0.3);margin-bottom:.2rem">' + (expired ? 'Status' : 'Time Left') + '</div>' +
                    '<div style="font-size:.78rem;font-weight:600;color:' + (expired ? 'rgba(239,68,68,0.7)' : 'rgba(255,255,255,0.7)') + '">' + (expired ? 'Expired' : formatTimeRemaining(credit.expires_at)) + '</div>' +
                '</div>' +
            '</div>' +
            /* CTA */
            (!expired ?
                '<a href="' + checkoutUrl + '" style="display:flex;align-items:center;justify-content:center;gap:.5rem;width:100%;padding:.8rem 1.5rem;border:none;border-radius:10px;cursor:pointer;font-family:Inter,sans-serif;font-size:.85rem;font-weight:700;color:#fff;background:linear-gradient(135deg,rgba(214,190,150,0.9),rgba(180,150,100,0.95));box-shadow:0 4px 16px rgba(214,190,150,0.25);text-decoration:none;letter-spacing:.02em;transition:all .2s;margin-bottom:.5rem">Purchase US100 Challenge \u2014 109 \u20ac</a>' +
                '<p style="font-size:.62rem;color:rgba(255,255,255,0.25);margin:0 0 .5rem">Enter code <strong>' + credit.promotion_code + '</strong> at checkout. Expires ' + formatExpiry(credit.expires_at) + '.</p>'
                : '<p style="font-size:.75rem;color:rgba(239,68,68,0.6);margin:0 0 .5rem">This code has expired and can no longer be used during checkout.</p>'
            ) +
            '<button id="ecCloseBtn" style="display:block;margin:.25rem auto 0;background:none;border:none;color:rgba(255,255,255,0.3);font-size:.72rem;cursor:pointer;padding:.4rem;font-family:Inter,sans-serif">Close</button>';

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        /* Copy handler */
        var copyBtn = document.getElementById('ecCopyBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', function () {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(credit.promotion_code).then(function () {
                        copyBtn.textContent = 'Copied!';
                        setTimeout(function () { copyBtn.textContent = 'Copy Code'; }, 2000);
                    });
                } else {
                    var tmp = document.createElement('textarea');
                    tmp.value = credit.promotion_code;
                    document.body.appendChild(tmp);
                    tmp.select();
                    document.execCommand('copy');
                    tmp.remove();
                    copyBtn.textContent = 'Copied!';
                    setTimeout(function () { copyBtn.textContent = 'Copy Code'; }, 2000);
                }
            });
        }

        /* Close handlers */
        function closeModal() { var m = document.getElementById('ecCreditModal'); if (m) m.remove(); }
        document.getElementById('ecCloseBtn').addEventListener('click', closeModal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', handler); }
        });
    }

    /* ── Profile page widget ────────────────────────────────────────────── */
    function renderProfileCredit() {
        var credit = getCachedCredit();
        var container = document.getElementById('pdExecCredit');
        if (!container) return;

        if (!credit) {
            if (isPrepareQualified()) {
                container.innerHTML =
                    '<div style="padding:1rem;border-radius:.75rem;background:var(--pd-accent-soft,rgba(96,165,250,.06));border:1px solid rgba(96,165,250,.1);display:flex;align-items:center;gap:.65rem">' +
                        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--pd-accent,#60a5fa)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l2 2 4-4"/></svg>' +
                        '<div><p style="font-size:.82rem;font-weight:600;color:var(--txt-primary);margin:0">PREPARE Completed</p><p style="font-size:.72rem;color:var(--txt-muted);margin:.1rem 0 0">Generating your Execution Credit\u2026</p></div>' +
                    '</div>';
            } else {
                container.innerHTML =
                    '<div style="padding:1rem;border-radius:.75rem;background:rgba(128,128,128,.04);border:1px solid rgba(128,128,128,.08);display:flex;align-items:center;gap:.65rem">' +
                        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--txt-muted)" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
                        '<div><p style="font-size:.82rem;font-weight:600;color:var(--txt-primary);margin:0">Execution Credit</p><p style="font-size:.72rem;color:var(--txt-muted);margin:.1rem 0 0">Complete PREPARE to unlock \u20ac20 toward US100 Challenge</p></div>' +
                    '</div>';
            }
            return;
        }

        var expired = isExpired(credit);
        var used = credit.used;
        var statusColor, statusText, statusBg;

        if (used) {
            statusColor = 'var(--pd-accent,#60a5fa)'; statusText = 'Used'; statusBg = 'var(--pd-accent-soft,rgba(96,165,250,.06))';
        } else if (expired) {
            statusColor = '#ef4444'; statusText = 'Expired'; statusBg = 'rgba(239,68,68,.06)';
        } else {
            statusColor = 'var(--pd-green,#22c55e)'; statusText = 'Active'; statusBg = 'var(--pd-green-bg,rgba(52,211,153,.06))';
        }

        var html =
            '<div style="padding:1.1rem 1.25rem;border-radius:.85rem;background:linear-gradient(135deg,rgba(214,190,150,.04),rgba(167,139,250,.02));border:1px solid rgba(214,190,150,.1)">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">' +
                    '<div style="display:flex;align-items:center;gap:.5rem">' +
                        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(214,190,150,.7)" stroke-width="1.5"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></svg>' +
                        '<span style="font-size:.85rem;font-weight:600;color:var(--txt-primary)">Execution Credit</span>' +
                    '</div>' +
                    '<span style="font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:.2rem .55rem;border-radius:2rem;background:' + statusBg + ';color:' + statusColor + '">' + statusText + '</span>' +
                '</div>' +
                '<div style="font-family:JetBrains Mono,Courier New,monospace;font-size:1.15rem;font-weight:700;color:rgba(214,190,150,.85);letter-spacing:.12em;margin-bottom:.35rem;' + (expired && !used ? 'text-decoration:line-through;opacity:.5' : '') + '">' + credit.promotion_code + '</div>' +
                '<div style="display:flex;gap:1rem;font-size:.7rem;color:var(--txt-muted)">' +
                    '<span>Value: <strong style="color:var(--txt-primary)">\u20ac20</strong></span>' +
                    '<span>' + (used ? 'Redeemed' : expired ? 'Expired' : formatTimeRemaining(credit.expires_at)) + '</span>' +
                '</div>' +
                (!expired && !used ?
                    '<div style="margin-top:.75rem;display:flex;gap:.5rem;align-items:center">' +
                        '<button onclick="if(window.AltivorExecutionCredit)window.AltivorExecutionCredit.showModal()" style="font-size:.7rem;font-weight:700;padding:.35rem .85rem;border-radius:.4rem;border:1px solid rgba(214,190,150,.2);background:rgba(214,190,150,.06);color:rgba(214,190,150,.8);cursor:pointer;font-family:Inter,sans-serif">View Code</button>' +
                        '<a href="' + US100_CHECKOUT + '?prefilled_email=' + encodeURIComponent(getUserEmail() || '') + '" style="font-size:.7rem;font-weight:700;padding:.35rem .85rem;border-radius:.4rem;border:none;background:linear-gradient(135deg,rgba(214,190,150,.9),rgba(180,150,100,.95));color:#fff;cursor:pointer;font-family:Inter,sans-serif;text-decoration:none">Use at Checkout</a>' +
                    '</div>' : '') +
            '</div>';

        container.innerHTML = html;
    }

    /* ── Main check ─────────────────────────────────────────────────────── */
    function check() {
        if (!isPrepareQualified()) {
            renderProfileCredit();
            return;
        }

        var email = getUserEmail();
        if (!email) return;

        var cached = getCachedCredit();
        if (cached) {
            renderProfileCredit();
            /* Show modal only once per session for new (non-expired, non-used) credits */
            if (!cached.used && !isExpired(cached) && !sessionStorage.getItem('altivor_ec_modal_shown')) {
                sessionStorage.setItem('altivor_ec_modal_shown', '1');
                showCreditModal(cached);
            }
            return;
        }

        /* No cached credit — generate one */
        generateCredit(function (credit) {
            renderProfileCredit();
            if (credit && !credit.used && !isExpired(credit)) {
                if (!sessionStorage.getItem('altivor_ec_modal_shown')) {
                    sessionStorage.setItem('altivor_ec_modal_shown', '1');
                    showCreditModal(credit);
                }
            }
        });
    }

    /* ── Public API ─────────────────────────────────────────────────────── */
    window.AltivorExecutionCredit = {
        check: check,
        getCredit: getCachedCredit,
        isExpired: function () { var c = getCachedCredit(); return c ? isExpired(c) : true; },
        showModal: function () {
            var c = getCachedCredit();
            if (c) showCreditModal(c);
        },
        renderProfile: renderProfileCredit
    };

    /* ── Auto-check on load ─────────────────────────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', check);
    } else {
        check();
    }
})();
