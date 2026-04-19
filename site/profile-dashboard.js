/* ═══════════════════════════════════════════════════════════════════════
   ALTIVOR — Profile Dashboard Logic  (v2 — pd-* prefix)
   Handles user data display, editing, password change, 2FA, avatar,
   purchases, sessions, logout confirmation.
   Uses plain fetch to Supabase REST API (no SDK).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var BASE = 'https://lssedurdadjngqbchjbj.supabase.co';
    var KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxzc2VkdXJkYWRqbmdxYmNoamJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTk5OTksImV4cCI6MjA5MjEzNTk5OX0.PG6Ljeo9i0apJkU-X0QWsoS0KMn5CmnmFtmaIl3JdAs';
    var SESSION_KEY   = 'altivor_session';
    var AVATAR_KEY    = 'altivor_avatar';
    var PURCHASES_KEY = 'altivor_purchases';

    /* ── API helper ────────────────────────────────────────────────────── */
    function getToken() {
        try { var s = JSON.parse(localStorage.getItem(SESSION_KEY)); return s && s.access_token ? s.access_token : null; } catch (_) { return null; }
    }
    function api(path, method, body) {
        var token = getToken();
        var h = { 'apikey': KEY, 'Content-Type': 'application/json' };
        if (token) h['Authorization'] = 'Bearer ' + token;
        var opts = { method: method || 'GET', headers: h };
        if (body) opts.body = JSON.stringify(body);
        return fetch(BASE + path, opts).then(function (r) {
            return r.json().then(function (d) {
                if (!r.ok) { var e = new Error(d.msg || d.message || d.error_description || 'Request failed'); e.status = r.status; e.code = d.error_code || d.error || ''; throw e; }
                return d;
            });
        });
    }
    function saveSession(d) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(d)); } catch (_) {} }

    /* ── DOM helpers ───────────────────────────────────────────────────── */
    function $(id) { return document.getElementById(id); }
    function show(el) { if (el) el.style.display = ''; }
    function hide(el) { if (el) el.style.display = 'none'; }
    function formatDate(d) { if (!d) return '\u2014'; var dt = new Date(d); return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
    function formatDateTime(d) { if (!d) return '\u2014'; var dt = new Date(d); return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
    function toast(msg, type) {
        var t = type === 'success' ? 'ok' : type === 'error' ? 'err' : 'info';
        var el = document.createElement('div');
        el.className = 'pd-toast pd-toast--' + t;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(function () { el.classList.add('pd-toast--vis'); }, 10);
        setTimeout(function () { el.classList.remove('pd-toast--vis'); setTimeout(function () { el.remove(); }, 300); }, 3500);
    }

    /* ── Tab navigation ────────────────────────────────────────────────── */
    function initTabs() {
        var tabs = document.querySelectorAll('[data-tab]');
        var sections = document.querySelectorAll('[data-section]');
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                tabs.forEach(function (t) { t.classList.remove('active'); });
                tab.classList.add('active');
                var target = tab.getAttribute('data-tab');
                sections.forEach(function (s) { s.style.display = s.getAttribute('data-section') === target ? '' : 'none'; });
            });
        });
    }

    /* ── Avatar ─────────────────────────────────────────────────────────── */
    function loadAvatar() {
        var av = $('pdAvatar');
        var avL = $('pdAvatarLarge');
        var saved = null;
        try { saved = localStorage.getItem(AVATAR_KEY); } catch (_) {}
        if (saved) {
            [av, avL].forEach(function (el) { if (el) { el.style.backgroundImage = 'url(' + saved + ')'; el.textContent = ''; el.classList.add('has-img'); } });
        }
    }
    function initAvatarUpload() {
        var input = $('avatarFileInput');
        var btn = $('avatarUploadBtn');
        var badge = $('pdAvatarBadge');
        var removeBtn = $('avatarRemoveBtn');
        function trigger() { if (input) input.click(); }
        if (btn) btn.addEventListener('click', trigger);
        if (badge) badge.addEventListener('click', trigger);
        if (input) {
            input.addEventListener('change', function () {
                var file = input.files && input.files[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { toast('Image must be under 2 MB', 'error'); return; }
                var reader = new FileReader();
                reader.onload = function (e) {
                    try { localStorage.setItem(AVATAR_KEY, e.target.result); } catch (_) { toast('Storage full', 'error'); return; }
                    loadAvatar(); toast('Profile photo updated', 'success');
                };
                reader.readAsDataURL(file);
            });
        }
        if (removeBtn) {
            removeBtn.addEventListener('click', function () {
                try { localStorage.removeItem(AVATAR_KEY); } catch (_) {}
                [['pdAvatar'], ['pdAvatarLarge']].forEach(function (ids) { var el = $(ids[0]); if (el) { el.style.backgroundImage = ''; el.classList.remove('has-img'); } });
                renderUserHeader(currentUser);
                toast('Photo removed', 'info');
            });
        }
    }

    /* ── Render: Header / Sidebar ──────────────────────────────────────── */
    var currentUser = null;
    function renderUserHeader(user) {
        if (!user) return;
        var meta = user.user_metadata || {};
        var name = ((meta.first_name || '') + (meta.last_name ? ' ' + meta.last_name : '')).trim();
        if (!name) name = meta.username || user.email.split('@')[0];
        var initials = name.split(' ').map(function (w) { return w.charAt(0).toUpperCase(); }).join('').substring(0, 2);

        var el;
        el = $('pdSideName');  if (el) el.textContent = name;
        el = $('pdSideEmail'); if (el) el.textContent = user.email;
        el = $('pdSideRole');  if (el) el.textContent = (user.role || 'user').toUpperCase();

        var hasSaved = false;
        try { hasSaved = !!localStorage.getItem(AVATAR_KEY); } catch (_) {}
        if (!hasSaved) {
            ['pdAvatar', 'pdAvatarLarge'].forEach(function (id) {
                var a = $(id); if (a) { a.textContent = initials; a.classList.remove('has-img'); a.style.backgroundImage = ''; }
            });
        }
    }

    /* ── Render: Overview ──────────────────────────────────────────────── */
    function renderOverview(user) {
        if (!user) return;
        var meta = user.user_metadata || {};
        var el;
        el = $('ovEmail');       if (el) el.textContent = user.email;
        el = $('ovVerified');    if (el) { el.textContent = user.email_confirmed_at ? 'Verified' : 'Not Verified'; el.className = 'pd-badge ' + (user.email_confirmed_at ? 'pd-badge--green' : 'pd-badge--red'); }
        el = $('ovMemberSince'); if (el) el.textContent = formatDate(user.created_at);
        el = $('ovLastLogin');   if (el) el.textContent = formatDateTime(user.last_sign_in_at);
        el = $('ovProvider');    if (el) el.textContent = (user.app_metadata && user.app_metadata.provider) || 'email';
        el = $('ovUsername');    if (el) el.textContent = meta.username || '\u2014';
        el = $('ovCountry');    if (el) el.textContent = meta.country || '\u2014';
        el = $('ovUserId');     if (el) el.textContent = user.id || '\u2014';

        // Stats
        el = $('ovStatDays');
        if (el && user.created_at) {
            var days = Math.max(0, Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000));
            el.textContent = days;
        }
        el = $('ovStatPurchases');
        if (el) { try { var p = JSON.parse(localStorage.getItem(PURCHASES_KEY)); el.textContent = (p && p.length) || 0; } catch (_) { el.textContent = '0'; } }

        el = $('ovStatTrades');
        if (el) { try { var t = JSON.parse(localStorage.getItem('altivor_verification_trades_v1')); el.textContent = (t && t.length) || 0; } catch (_) { el.textContent = '0'; } }

        // 2FA stat
        el = $('ovStat2FA');
        if (el) {
            check2FAStatus().then(function (factors) {
                var active = factors.filter(function (f) { return f.status === 'verified'; });
                el.textContent = active.length > 0 ? 'ON' : 'OFF';
                el.style.color = active.length > 0 ? '#22c55e' : '';
            }).catch(function () { el.textContent = '\u2014'; });
        }

        // 2FA badge
        el = $('ov2FA');
        if (el) {
            check2FAStatus().then(function (factors) {
                var active = factors.filter(function (f) { return f.status === 'verified'; });
                el.textContent = active.length > 0 ? 'Enabled' : 'Disabled';
                el.className = 'pd-badge ' + (active.length > 0 ? 'pd-badge--green' : 'pd-badge--yellow');
            }).catch(function () { el.textContent = 'Unknown'; el.className = 'pd-badge pd-badge--gray'; });
        }
    }

    /* ── Render: Personal Info ─────────────────────────────────────────── */
    var COUNTRIES = [
        ['AF','Afghanistan'],['AL','Albania'],['DZ','Algeria'],['AR','Argentina'],['AU','Australia'],['AT','Austria'],['BE','Belgium'],['BR','Brazil'],['BG','Bulgaria'],['CA','Canada'],['CL','Chile'],['CN','China'],['CO','Colombia'],['HR','Croatia'],['CZ','Czech Republic'],['DK','Denmark'],['EG','Egypt'],['EE','Estonia'],['FI','Finland'],['FR','France'],['DE','Germany'],['GR','Greece'],['HU','Hungary'],['IN','India'],['ID','Indonesia'],['IE','Ireland'],['IL','Israel'],['IT','Italy'],['JP','Japan'],['KR','South Korea'],['LV','Latvia'],['LT','Lithuania'],['MY','Malaysia'],['MX','Mexico'],['NL','Netherlands'],['NZ','New Zealand'],['NG','Nigeria'],['NO','Norway'],['PK','Pakistan'],['PH','Philippines'],['PL','Poland'],['PT','Portugal'],['RO','Romania'],['SA','Saudi Arabia'],['RS','Serbia'],['SG','Singapore'],['SK','Slovakia'],['SI','Slovenia'],['ZA','South Africa'],['ES','Spain'],['SE','Sweden'],['CH','Switzerland'],['TH','Thailand'],['TR','Turkey'],['UA','Ukraine'],['AE','United Arab Emirates'],['GB','United Kingdom'],['US','United States'],['VN','Vietnam']
    ];
    function populateCountrySelect() {
        var sel = $('editCountry');
        if (!sel || sel.options.length > 1) return;
        COUNTRIES.forEach(function (c) { var o = document.createElement('option'); o.value = c[0]; o.textContent = c[1]; sel.appendChild(o); });
    }
    function renderPersonalInfo(user) {
        if (!user) return;
        var meta = user.user_metadata || {};
        populateCountrySelect();
        var el;
        el = $('editFirstName'); if (el) el.value = meta.first_name || '';
        el = $('editLastName');  if (el) el.value = meta.last_name || '';
        el = $('editUsername');   if (el) el.value = meta.username || '';
        el = $('editAddress');   if (el) el.value = meta.address || '';
        el = $('editCountry');   if (el) el.value = meta.country || '';
        el = $('editEmail');     if (el) el.value = user.email || '';
    }

    /* ── Personal info update ─────────────────────────────────────────── */
    function initPersonalInfoForm() {
        var form = $('personalInfoForm');
        if (!form) return;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var btn = form.querySelector('button[type="submit"]');
            if (btn) btn.disabled = true;
            api('/auth/v1/user', 'PUT', {
                data: {
                    first_name: ($('editFirstName') || {}).value || '',
                    last_name: ($('editLastName') || {}).value || '',
                    username: ($('editUsername') || {}).value || '',
                    address: ($('editAddress') || {}).value || '',
                    country: ($('editCountry') || {}).value || ''
                }
            }).then(function (user) {
                currentUser = user;
                var s = null; try { s = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (_) {}
                if (s) { s.user = user; saveSession(s); }
                renderUserHeader(user); renderOverview(user);
                toast('Profile updated successfully', 'success');
            }).catch(function (err) { toast(err.message || 'Failed to update', 'error'); })
              .then(function () { if (btn) btn.disabled = false; });
        });
    }

    /* ── Password change ──────────────────────────────────────────────── */
    function initPasswordForm() {
        var form = $('passwordForm');
        if (!form) return;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var pw = ($('newPassword') || {}).value || '';
            var pw2 = ($('confirmNewPassword') || {}).value || '';
            var st = $('pwChangeStatus');
            if (pw.length < 8) { if (st) { st.textContent = 'Password must be at least 8 characters.'; st.className = 'pd-form-status err'; } return; }
            if (!/[A-Z]/.test(pw) || !/[0-9]/.test(pw) || !/[^a-zA-Z0-9]/.test(pw)) { if (st) { st.textContent = 'Needs uppercase, number and special character.'; st.className = 'pd-form-status err'; } return; }
            if (pw !== pw2) { if (st) { st.textContent = 'Passwords do not match.'; st.className = 'pd-form-status err'; } return; }
            var btn = form.querySelector('button[type="submit"]');
            if (btn) btn.disabled = true;
            if (st) { st.textContent = ''; st.className = 'pd-form-status'; }
            api('/auth/v1/user', 'PUT', { password: pw })
                .then(function () { form.reset(); toast('Password changed successfully', 'success'); if (st) { st.textContent = 'Password updated.'; st.className = 'pd-form-status ok'; } })
                .catch(function (err) { if (st) { st.textContent = err.message; st.className = 'pd-form-status err'; } })
                .then(function () { if (btn) btn.disabled = false; });
        });
    }

    /* ── 2FA / TOTP ────────────────────────────────────────────────────── */
    function check2FAStatus() { return api('/auth/v1/factors', 'GET'); }

    function render2FASection() {
        var c = $('twoFactorContent');
        if (!c) return;
        c.innerHTML = '<p class="pd-muted">Checking 2FA status\u2026</p>';
        check2FAStatus().then(function (factors) {
            var verified = [], unverified = [];
            if (Array.isArray(factors)) { factors.forEach(function (f) { if (f.status === 'verified') verified.push(f); else unverified.push(f); }); }
            var html = '';
            if (verified.length > 0) {
                html += '<div style="display:flex;align-items:center;gap:.6rem;margin-bottom:1rem;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11.5 14.5 15.5 9.5" stroke="#22c55e" stroke-width="2"/></svg><span style="font-size:.88rem;">Two-Factor Authentication is <strong style="color:#22c55e;">enabled</strong></span></div>';
                verified.forEach(function (f) {
                    html += '<div class="pd-row"><span class="pd-lbl">TOTP \u2014 ' + (f.friendly_name || 'Authenticator') + '</span><span class="pd-val" style="display:flex;align-items:center;gap:.5rem;">' + formatDate(f.created_at) + ' <button class="btn btn-ghost btn-sm pd-2fa-rm" data-fid="' + f.id + '" style="color:#ef4444;font-size:.7rem;">Remove</button></span></div>';
                });
            } else {
                html += '<div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.75rem;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--txt-muted)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span style="font-size:.88rem;">Two-Factor Authentication is <strong>not enabled</strong></span></div>';
                html += '<p class="pd-muted">Protect your account with a TOTP authenticator app (Google Authenticator, Authy, 1Password, etc.).</p>';
                html += '<button class="btn btn-primary btn-sm" id="enable2FABtn" style="margin-top:.5rem;">Enable 2FA</button>';
            }
            unverified.forEach(function (f) { api('/auth/v1/factors/' + f.id, 'DELETE').catch(function () {}); });
            c.innerHTML = html;
            var eb = $('enable2FABtn');
            if (eb) eb.addEventListener('click', function () { startTOTPEnrollment(c); });
            c.querySelectorAll('.pd-2fa-rm').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    if (!confirm('Remove this authenticator? You will need to set up 2FA again.')) return;
                    btn.disabled = true;
                    api('/auth/v1/factors/' + btn.getAttribute('data-fid'), 'DELETE')
                        .then(function () { toast('2FA removed', 'info'); render2FASection(); })
                        .catch(function (err) { toast(err.message, 'error'); btn.disabled = false; });
                });
            });
        }).catch(function (err) { c.innerHTML = '<p class="pd-muted">Could not load 2FA status: ' + (err.message || 'Unknown error') + '</p>'; });
    }

    function startTOTPEnrollment(container) {
        container.innerHTML = '<p class="pd-muted">Setting up authenticator\u2026</p>';
        api('/auth/v1/factors', 'POST', { factor_type: 'totp', friendly_name: 'ALTIVOR Authenticator' })
            .then(function (factor) {
                var qr = factor.totp && factor.totp.qr_code;
                var secret = factor.totp && factor.totp.secret;
                var fid = factor.id;
                var html = '<h4 style="font-size:.95rem;margin:0 0 .5rem;color:var(--txt-primary);">Scan QR Code</h4>';
                html += '<p class="pd-muted">Open your authenticator app and scan this code, or enter the secret key manually.</p>';
                if (qr) html += '<div class="pd-2fa-qr"><img src="' + qr + '" alt="QR Code" width="200" height="200" /></div>';
                if (secret) html += '<div class="pd-2fa-secret"><label>Secret Key</label><code>' + secret + '</code></div>';
                html += '<form id="verify2FAForm"><label for="totpCode" style="font-size:.78rem;font-weight:600;color:var(--txt-secondary);display:block;margin-bottom:.3rem;text-transform:uppercase;letter-spacing:.05em;">Enter 6-digit code</label>';
                html += '<div class="pd-2fa-row"><input type="text" id="totpCode" maxlength="6" pattern="[0-9]{6}" placeholder="000000" autocomplete="one-time-code" required class="pd-form-group" style="margin:0;" /><button type="submit" class="btn btn-primary btn-sm">Verify &amp; Enable</button></div>';
                html += '<p class="pd-form-status" id="totp2FAStatus"></p></form>';
                html += '<button class="btn btn-ghost btn-sm" id="cancel2FABtn" style="margin-top:.5rem;">Cancel</button>';
                container.innerHTML = html;
                api('/auth/v1/factors/' + fid + '/challenge', 'POST').then(function (ch) {
                    $('verify2FAForm').addEventListener('submit', function (e) {
                        e.preventDefault();
                        var code = ($('totpCode') || {}).value || '';
                        var st = $('totp2FAStatus');
                        if (code.length !== 6) { if (st) { st.textContent = 'Enter a 6-digit code.'; st.className = 'pd-form-status err'; } return; }
                        var btn = e.target.querySelector('button[type="submit"]'); if (btn) btn.disabled = true;
                        api('/auth/v1/factors/' + fid + '/verify', 'POST', { challenge_id: ch.id, code: code }).then(function (r) {
                            if (r.access_token) { var s = null; try { s = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (_) {} if (s) { s.access_token = r.access_token; if (r.refresh_token) s.refresh_token = r.refresh_token; saveSession(s); } }
                            toast('Two-Factor Authentication enabled!', 'success'); render2FASection();
                        }).catch(function (err) { if (st) { st.textContent = err.message; st.className = 'pd-form-status err'; } if (btn) btn.disabled = false; });
                    });
                    $('cancel2FABtn').addEventListener('click', function () { api('/auth/v1/factors/' + fid, 'DELETE').catch(function () {}); render2FASection(); });
                }).catch(function (err) { container.innerHTML = '<p class="pd-muted">Failed to create challenge: ' + err.message + '</p>'; });
            }).catch(function (err) { container.innerHTML = '<p class="pd-muted">Failed to set up 2FA: ' + err.message + '</p>'; setTimeout(function () { render2FASection(); }, 2000); });
    }

    /* ── Purchases ─────────────────────────────────────────────────────── */
    function renderPurchases() {
        var c = $('purchasesContent');
        if (!c) return;
        var purchases = [];
        try { var raw = localStorage.getItem(PURCHASES_KEY); if (raw) purchases = JSON.parse(raw); } catch (_) {}
        if (!purchases || purchases.length === 0) {
            c.innerHTML = '<div class="pd-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-muted)" stroke-width="1.2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg><p style="font-size:.9rem;font-weight:500;">No purchases yet</p><p class="pd-muted">When you purchase a framework, plan or subscription, it will appear here.</p></div>';
            return;
        }
        var html = '<table class="pd-table"><thead><tr><th>Date</th><th>Item</th><th>Amount</th><th>Status</th></tr></thead><tbody>';
        purchases.forEach(function (p) {
            var cls = p.status === 'completed' ? 'pd-badge--green' : p.status === 'pending' ? 'pd-badge--yellow' : 'pd-badge--red';
            html += '<tr><td>' + formatDate(p.date) + '</td><td>' + (p.item || '\u2014') + '</td><td>' + (p.amount || '\u2014') + '</td><td><span class="pd-badge ' + cls + '">' + (p.status || '\u2014') + '</span></td></tr>';
        });
        html += '</tbody></table>';
        c.innerHTML = html;
    }

    /* ── Active sessions ───────────────────────────────────────────────── */
    function renderSessions() {
        var el = $('sessionsContent');
        if (!el) return;
        var token = getToken();
        if (!token) { el.innerHTML = '<p class="pd-muted">No active session.</p>'; return; }
        try {
            var parts = token.split('.');
            var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            var html = '<div class="pd-session">';
            html += '<div class="pd-session-dot"></div>';
            html += '<div class="pd-session-info"><div class="pd-session-label">Current session</div><div class="pd-session-meta">ID: ' + (payload.session_id || payload.sub || '\u2014').substring(0, 16) + '\u2026</div></div>';
            html += '<span class="pd-badge ' + (payload.aal === 'aal2' ? 'pd-badge--green' : 'pd-badge--blue') + '">' + (payload.aal || 'aal1').toUpperCase() + '</span>';
            html += '</div>';
            html += '<div class="pd-row"><span class="pd-lbl">Issued</span><span class="pd-val">' + formatDateTime(new Date(payload.iat * 1000).toISOString()) + '</span></div>';
            html += '<div class="pd-row"><span class="pd-lbl">Expires</span><span class="pd-val">' + formatDateTime(new Date(payload.exp * 1000).toISOString()) + '</span></div>';
            el.innerHTML = html;
        } catch (_) { el.innerHTML = '<p class="pd-muted">Could not parse session.</p>'; }
    }

    /* ── Logout with confirmation ──────────────────────────────────────── */
    function initLogout() {
        var overlay = $('logoutConfirm');
        var cancelBtn = $('logoutCancel');
        var confirmBtn = $('logoutConfirmBtn');

        function openConfirm() { if (overlay) overlay.classList.add('active'); }
        function closeConfirm() { if (overlay) overlay.classList.remove('active'); }
        function doLogout() {
            closeConfirm();
            if (typeof window.altivorAuth === 'object' && window.altivorAuth.logout) { window.altivorAuth.logout(); }
            else { try { localStorage.removeItem(SESSION_KEY); } catch (_) {} }
            window.location.href = 'index.html';
        }

        // Sidebar logout button
        var sideBtn = $('pdLogoutSide');
        if (sideBtn) sideBtn.addEventListener('click', openConfirm);

        if (cancelBtn) cancelBtn.addEventListener('click', closeConfirm);
        if (confirmBtn) confirmBtn.addEventListener('click', doLogout);

        // Close on overlay click
        if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) closeConfirm(); });

        // Close on Escape
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay && overlay.classList.contains('active')) closeConfirm(); });
    }

    /* ── Main init ─────────────────────────────────────────────────────── */
    function init() {
        var loadingEl = $('pdLoading');
        var noAuth    = $('pdNoAuth');
        var dash      = $('pdDash');

        var token = getToken();
        if (!token) { hide(loadingEl); show(noAuth); return; }

        api('/auth/v1/user', 'GET')
            .then(function (user) {
                currentUser = user;
                hide(loadingEl);
                show(dash);
                loadAvatar();
                renderUserHeader(user);
                renderOverview(user);
                renderPersonalInfo(user);
                render2FASection();
                renderPurchases();
                renderSessions();
                initTabs();
                initAvatarUpload();
                initPersonalInfoForm();
                initPasswordForm();
                initLogout();
            })
            .catch(function () {
                try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
                hide(loadingEl);
                show(noAuth);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
