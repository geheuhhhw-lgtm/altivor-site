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
        if (el) {
            var tCount = 0;
            try {
                var td = JSON.parse(localStorage.getItem('altivor_verification_trades_v1'));
                if (td && Array.isArray(td.trades)) tCount = td.trades.length;
                else if (Array.isArray(td)) tCount = td.length;
            } catch (_) {}
            try {
                var ps = JSON.parse(localStorage.getItem('altivor-prepare-state-v1'));
                if (ps && Array.isArray(ps.trades)) tCount += ps.trades.length;
            } catch (_) {}
            el.textContent = tCount;
        }

        // 2FA stat
        el = $('ovStat2FA');
        if (el) {
            check2FAStatus().then(function (factors) {
                var active = factors.filter(function (f) { return f.status === 'verified'; });
                el.textContent = active.length > 0 ? 'ON' : 'OFF';
                el.style.color = active.length > 0 ? 'var(--pd-green,#22c55e)' : '';
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
                html += '<div style="display:flex;align-items:center;gap:.6rem;margin-bottom:1rem;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--pd-green,#22c55e)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11.5 14.5 15.5 9.5" stroke="var(--pd-green,#22c55e)" stroke-width="2"/></svg><span style="font-size:.88rem;">Two-Factor Authentication is <strong style="color:var(--pd-green,#22c55e);">enabled</strong></span></div>';
                verified.forEach(function (f) {
                    html += '<div class="pd-row"><span class="pd-lbl">TOTP \u2014 ' + (f.friendly_name || 'Authenticator') + '</span><span class="pd-val" style="display:flex;align-items:center;gap:.5rem;">' + formatDate(f.created_at) + ' <button class="btn btn-ghost btn-sm pd-2fa-rm" data-fid="' + f.id + '" style="color:var(--pd-red,#ef4444);font-size:.7rem;">Remove</button></span></div>';
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

    /* ── Welcome greeting & datetime ────────────────────────────────── */
    function renderWelcome(user) {
        var h = new Date().getHours();
        var greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
        var meta = user.user_metadata || {};
        var name = (meta.first_name || '').trim();
        if (!name) name = (meta.username || user.email.split('@')[0]);
        var el = $('pdGreeting');
        if (el) el.textContent = greet + ', ' + name;
        updateDateTime();
        setInterval(updateDateTime, 60000);
    }
    function updateDateTime() {
        var el = $('pdDateTime');
        if (!el) return;
        var now = new Date();
        el.textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) + '  •  ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }

    /* â”€â”€ Render: Products & Access status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function renderProducts(user) {
        if (!user) return;
        var email = user.email || '';
        var prep = localStorage.getItem('altivor_prepare_purchased_' + email) === '1';
        var fwp = localStorage.getItem('altivor_fwpack_purchased_' + email) === '1';
        var us100 = localStorage.getItem('altivor_us100_purchased_' + email) === '1';
        var acc = localStorage.getItem('altivor_acc_purchased_' + email) === '1' || us100;
        var prepStatus = localStorage.getItem('altivor-prepare-status') || 'NOT_STARTED';
        var challengeCompleted = false;
        try { challengeCompleted = !!localStorage.getItem('altivor_challenge_completed_' + email); } catch (_) {}

        function setStatus(id, active, label) {
            var el = $(id);
            if (!el) return;
            el.textContent = active ? (label || 'Active') : 'Locked';
            el.className = 'pd-product-status ' + (active ? 'pd-product-status--active' : 'pd-product-status--locked');
        }

        // PREPARE: show qualification status if purchased
        var prepLabel = prep ? (prepStatus === 'QUALIFIED' ? 'Qualified' : 'Active') : 'Locked';
        var prepActive = prep;
        setStatus('pdPrepStatus', prepActive, prepLabel);
        setStatus('pdPrepStatusFull', prepActive, prepLabel);

        // Challenge products: show 'Completed' if challenge done
        var fwpLabel = fwp ? (challengeCompleted ? 'Completed' : 'Active') : 'Locked';
        var us100Label = us100 ? (challengeCompleted ? 'Completed' : 'Active') : 'Locked';
        setStatus('pdFwpStatus', fwp, fwpLabel);
        setStatus('pdUs100Status', us100, us100Label);
        setStatus('pdAccStatus', acc, acc ? 'Active' : 'Locked');

        // Full tab
        setStatus('pdFwpStatusFull', fwp, fwpLabel);
        setStatus('pdUs100StatusFull', us100, us100Label);
        setStatus('pdAccStatusFull', acc, acc ? 'Active' : 'Locked');

        // Detail text
        var el;
        if (prep) {
            el = $('pdPrepDetail');
            if (el) {
                if (prepStatus === 'QUALIFIED') el.textContent = 'PREPARE Completed \u2014 Qualified';
                else if (prepStatus === 'ACTIVE') el.textContent = 'In Progress \u2014 Trades Being Verified';
                else if (prepStatus === 'DISQUALIFIED') el.textContent = 'Disqualified \u2014 Cooldown Active';
                else el.textContent = 'Purchased \u2014 Access Granted';
            }
        } else {
            el = $('pdPrepDetail'); if (el) el.textContent = 'Not Purchased';
        }
        el = $('pdFwpDetail');     if (el) el.textContent = fwp ? (challengeCompleted ? 'Challenge Completed' : 'Purchased \u2014 Access Granted') : 'Not Purchased';
        el = $('pdUs100Detail');   if (el) el.textContent = us100 ? (challengeCompleted ? 'Challenge Completed' : 'Purchased \u2014 Access Granted') : 'Not Purchased';
        el = $('pdAccDetail');     if (el) el.textContent = acc ? 'Active Subscription' : 'Not Subscribed';

        // Count active products for stat
        var count = [prep, fwp, us100, acc].filter(Boolean).length;
        el = $('ovStatPurchases'); if (el) el.textContent = count;
    }

    /* â”€â”€ Render: Activity Timeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function renderTimeline(user) {
        var tl = $('pdTimeline');
        if (!tl || !user) return;
        var items = [];
        // Account created
        if (user.created_at) items.push({ date: user.created_at, label: 'Account created', dot: 'blue' });
        // Email verified
        if (user.email_confirmed_at) items.push({ date: user.email_confirmed_at, label: 'Email verified', dot: 'green' });
        // Last sign in
        if (user.last_sign_in_at) items.push({ date: user.last_sign_in_at, label: 'Last sign in', dot: 'gold' });
        // Product purchases
        var email = user.email || '';
        if (localStorage.getItem('altivor_prepare_purchased_' + email) === '1') items.push({ date: null, label: 'PREPARE Access purchased', dot: 'gold' });
        if (localStorage.getItem('altivor_fwpack_purchased_' + email) === '1') items.push({ date: null, label: 'Framework Pack purchased', dot: 'gold' });
        if (localStorage.getItem('altivor_us100_purchased_' + email) === '1') items.push({ date: null, label: 'US100 Challenge purchased', dot: 'gold' });
        if (localStorage.getItem('altivor_acc_purchased_' + email) === '1') items.push({ date: null, label: 'Accessories Subscription activated', dot: 'green' });
        // PREPARE qualification
        var prepStatus = localStorage.getItem('altivor-prepare-status');
        if (prepStatus === 'QUALIFIED') items.push({ date: null, label: 'PREPARE Qualified \u2014 10/10 compliant trades', dot: 'green' });
        // Challenge completion
        try {
            var compRec = JSON.parse(localStorage.getItem('altivor_challenge_completed_' + email));
            if (compRec) items.push({ date: compRec.completedAt || null, label: 'Challenge Completed \u2014 Wall of Traders entry', dot: 'green' });
        } catch (_) {}
        // Execution credit
        try {
            var ec = JSON.parse(localStorage.getItem('altivor_execution_credit_' + email));
            if (ec && ec.promotion_code) items.push({ date: null, label: 'Execution Credit unlocked (' + ec.promotion_code + ')', dot: 'blue' });
        } catch (_) {}

        items.sort(function (a, b) { if (!a.date) return -1; if (!b.date) return 1; return new Date(b.date) - new Date(a.date); });
        var html = '';
        items.forEach(function (it) {
            html += '<div class="pd-timeline-item"><div class="pd-timeline-dot pd-timeline-dot--' + it.dot + '"></div><div class="pd-timeline-text"><div class="pd-timeline-label">' + it.label + '</div><div class="pd-timeline-meta">' + (it.date ? formatDateTime(it.date) : 'Active') + '</div></div></div>';
        });
        tl.innerHTML = html || '<div class="pd-timeline-item"><div class="pd-timeline-dot pd-timeline-dot--gray"></div><div class="pd-timeline-text"><div class="pd-timeline-label">No activity yet</div><div class="pd-timeline-meta">\u2014</div></div></div>';
    }
    /* ── Render: Qualification ────────────────────────────────────────── */
    function renderQualification(user) {
        if (!user) return;
        var email = user.email || '';
        var fwp = localStorage.getItem('altivor_fwpack_purchased_' + email) === '1';
        var us100 = localStorage.getItem('altivor_us100_purchased_' + email) === '1';
        var hasChallenge = fwp || us100;
        var prepPurchased = localStorage.getItem('altivor_prepare_purchased_' + email) === '1';
        var prepStatus = localStorage.getItem('altivor-prepare-status') || 'NOT_STARTED';

        // Read localStorage data — values are JSON objects, not primitives
        var tradesData = null; try { tradesData = JSON.parse(localStorage.getItem('altivor_verification_trades_v1')); } catch (_) {}
        var weeklyData = null; try { weeklyData = JSON.parse(localStorage.getItem('altivor_verification_weekly_v1')); } catch (_) {}
        var profitData = null; try { profitData = JSON.parse(localStorage.getItem('altivor_verification_profit_v1')); } catch (_) {}
        var drawdownData = null; try { drawdownData = JSON.parse(localStorage.getItem('altivor_verification_drawdown_v1')); } catch (_) {}
        var statementData = null; try { statementData = JSON.parse(localStorage.getItem('altivor_verification_statement_v1')); } catch (_) {}

        // Extract values from JSON structures
        var trades = (tradesData && Array.isArray(tradesData.trades)) ? tradesData.trades : (Array.isArray(tradesData) ? tradesData : []);
        var checkins = (weeklyData && Array.isArray(weeklyData.checkins)) ? weeklyData.checkins : (Array.isArray(weeklyData) ? weeklyData : []);
        var tradesCount = trades.length;
        var weeklyCount = checkins.length;

        // Profit: calculated from starting balance vs latest balance
        var profit = 0;
        if (profitData) {
            var startBal = profitData.startingBalance || 10000;
            var endBal = profitData.month2Balance || profitData.month1Balance || startBal;
            if (startBal > 0) profit = ((endBal - startBal) / startBal) * 100;
        }

        var drawdownFailed = drawdownData ? !!drawdownData.failed : false;
        var statementSubmitted = statementData ? !!statementData.submitted : false;

        // Check completion record
        var completionKey = 'altivor_challenge_completed_' + email;
        var isCompleted = false;
        try { isCompleted = !!localStorage.getItem(completionKey); } catch (_) {}

        // ── PREPARE status badge ──
        var prepEl = $('pdQualPrepStatus');
        if (prepEl) {
            if (prepStatus === 'QUALIFIED') {
                prepEl.textContent = 'Qualified';
                prepEl.className = 'pd-badge pd-badge--green';
            } else if (prepStatus === 'ACTIVE') {
                prepEl.textContent = 'In Progress';
                prepEl.className = 'pd-badge pd-badge--blue';
            } else if (prepStatus === 'DISQUALIFIED') {
                prepEl.textContent = 'Disqualified';
                prepEl.className = 'pd-badge pd-badge--red';
            } else if (prepPurchased) {
                prepEl.textContent = 'Purchased';
                prepEl.className = 'pd-badge pd-badge--yellow';
            } else {
                prepEl.textContent = 'Not Started';
                prepEl.className = 'pd-badge pd-badge--gray';
            }
        }

        // ── Status banner ──
        var statusEl = $('pdQualStatus');
        var titleEl = $('pdQualStatusTitle');
        var subEl = $('pdQualStatusSub');
        if (statusEl && titleEl && subEl) {
            statusEl.className = 'pd-qual-status';
            if (isCompleted) {
                statusEl.classList.add('pd-qual-status--complete');
                titleEl.textContent = 'Challenge Completed';
                subEl.textContent = 'Congratulations! You have successfully completed the qualification cycle.';
                statusEl.querySelector('svg').setAttribute('stroke', 'var(--pd-green,#22c55e)');
            } else if (hasChallenge) {
                statusEl.classList.add('pd-qual-status--active');
                titleEl.textContent = 'Challenge Active';
                subEl.textContent = (us100 ? 'US100 Challenge' : 'Framework Pack') + ' \u2014 ' + tradesCount + '/55 trades logged';
                statusEl.querySelector('svg').setAttribute('stroke', 'var(--pd-accent,#60a5fa)');
            } else {
                statusEl.classList.add('pd-qual-status--none');
                titleEl.textContent = 'No Active Challenge';
                subEl.textContent = 'Purchase Framework Pack or US100 Challenge to begin your qualification cycle.';
            }
        }

        // ── Progress bars ──
        var el;
        el = $('pdQualTradesVal'); if (el) el.textContent = tradesCount;
        el = $('pdQualTradesBadge'); if (el) el.textContent = tradesCount + ' / 55';
        el = $('pdQualTradesBar'); if (el) el.style.width = Math.min(100, (tradesCount / 55) * 100).toFixed(1) + '%';

        el = $('pdQualWeeklyVal'); if (el) el.textContent = weeklyCount;
        el = $('pdQualWeeklyBadge'); if (el) el.textContent = weeklyCount + ' / 8';
        el = $('pdQualWeeklyBar'); if (el) el.style.width = Math.min(100, (weeklyCount / 8) * 100).toFixed(1) + '%';

        el = $('pdQualProfitVal'); if (el) el.textContent = profit.toFixed(1) + '%';
        el = $('pdQualProfitBadge'); if (el) { el.textContent = profit.toFixed(1) + '%'; el.className = 'pd-badge ' + (profit >= 6 ? 'pd-badge--green' : 'pd-badge--gray'); }
        el = $('pdQualProfitBar'); if (el) el.style.width = Math.min(100, Math.max(0, (profit / 6) * 100)).toFixed(1) + '%';

        el = $('pdQualDrawdownVal'); if (el) el.textContent = drawdownFailed ? 'Failed' : 'No Violations';
        el = $('pdQualDrawdownBadge'); if (el) { el.textContent = drawdownFailed ? 'Failed' : 'Clean'; el.className = 'pd-badge ' + (drawdownFailed ? 'pd-badge--red' : 'pd-badge--green'); }

        // ── Checklist ──
        function setChk(id, done) {
            var c = $(id); if (!c) return;
            c.textContent = done ? 'Done' : 'Pending';
            c.className = 'pd-badge ' + (done ? 'pd-badge--green' : 'pd-badge--gray');
        }
        setChk('pdQualChk1', tradesCount >= 55);
        setChk('pdQualChk2', weeklyCount >= 8);
        setChk('pdQualChk3', profit >= 6);
        setChk('pdQualChk4', !drawdownFailed);
        setChk('pdQualChk5', statementSubmitted);

        // ── Trigger execution credit render (if script loaded) ──
        if (window.AltivorExecutionCredit && typeof window.AltivorExecutionCredit.renderProfile === 'function') {
            window.AltivorExecutionCredit.renderProfile();
        }
    }

    /* ── Render: Wall of Traders ──────────────────────────────────────── */
    function renderWot(user) {
        if (!user) return;
        var email = user.email || '';
        var completionKey = 'altivor_challenge_completed_' + email;
        var record = null;
        try { record = JSON.parse(localStorage.getItem(completionKey)); } catch (_) {}

        var emptyEl = $('pdWotContent');
        var cardEl = $('pdWotCard');
        var achEl = $('pdWotAchievements');

        if (!record) {
            if (emptyEl) emptyEl.style.display = '';
            if (cardEl) cardEl.style.display = 'none';
            if (achEl) achEl.style.display = 'none';
            return;
        }

        // Has completion
        if (emptyEl) emptyEl.style.display = 'none';
        if (cardEl) cardEl.style.display = '';
        if (achEl) achEl.style.display = '';

        var el;
        el = $('pdWotName'); if (el) el.textContent = record.nickname || record.name || '\u2014';
        el = $('pdWotScore'); if (el) el.textContent = (record.score != null ? record.score : '\u2014');
        el = $('pdWotWR'); if (el) el.textContent = record.winRate != null ? record.winRate + '%' : '\u2014';
        el = $('pdWotRR'); if (el) el.textContent = record.avgRR != null ? record.avgRR.toFixed(2) : '\u2014';
        el = $('pdWotTrades'); if (el) el.textContent = record.totalTrades || record.trades || '\u2014';
        el = $('pdWotProduct'); if (el) el.textContent = record.product || '\u2014';
        el = $('pdWotDate'); if (el) el.textContent = record.completedAt ? formatDate(record.completedAt) : '\u2014';
        el = $('pdWotBestStreak'); if (el) el.textContent = record.bestWinStreak || '\u2014';
        el = $('pdWotBestRR'); if (el) el.textContent = record.bestRR != null ? record.bestRR.toFixed(2) : '\u2014';
    }

    /* ── Render: Affiliate (Coming Soon — no-op) ──────────────────────── */
    function renderAffiliate(user) { /* placeholder — affiliate is coming soon */ }

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
                renderWelcome(user);
                renderOverview(user);
                renderProducts(user);
                renderTimeline(user);
                renderQualification(user);
                renderWot(user);
                renderAffiliate(user);
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
