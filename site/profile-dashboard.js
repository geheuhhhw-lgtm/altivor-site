/* ═══════════════════════════════════════════════════════════════════════
   ALTIVOR — Profile Dashboard Logic
   Handles user data display, editing, password change, 2FA, avatar, purchases.
   Uses plain fetch to Supabase REST API (no SDK).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var BASE = 'https://lssedurdadjngqbchjbj.supabase.co';
    var KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxzc2VkdXJkYWRqbmdxYmNoamJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTk5OTksImV4cCI6MjA5MjEzNTk5OX0.PG6Ljeo9i0apJkU-X0QWsoS0KMn5CmnmFtmaIl3JdAs';
    var SESSION_KEY = 'altivor_session';
    var AVATAR_KEY  = 'altivor_avatar';
    var PURCHASES_KEY = 'altivor_purchases';

    // ─── API helper ───────────────────────────────────────────────────────────
    function getToken() {
        try {
            var s = JSON.parse(localStorage.getItem(SESSION_KEY));
            return s && s.access_token ? s.access_token : null;
        } catch (_) { return null; }
    }

    function api(path, method, body) {
        var token = getToken();
        var headers = { 'apikey': KEY, 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        var opts = { method: method || 'GET', headers: headers };
        if (body) opts.body = JSON.stringify(body);
        return fetch(BASE + path, opts).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) {
                    var err = new Error(data.msg || data.message || data.error_description || 'Request failed');
                    err.status = r.status;
                    err.code = data.error_code || data.error || '';
                    throw err;
                }
                return data;
            });
        });
    }

    function saveSession(data) {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch (_) {}
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    function $(id) { return document.getElementById(id); }
    function show(el) { if (el) el.style.display = ''; }
    function hide(el) { if (el) el.style.display = 'none'; }

    function formatDate(d) {
        if (!d) return '—';
        var dt = new Date(d);
        return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    function formatDateTime(d) {
        if (!d) return '—';
        var dt = new Date(d);
        return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
               dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }

    function toast(msg, type) {
        var el = document.createElement('div');
        el.className = 'dash-toast dash-toast--' + (type || 'info');
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(function () { el.classList.add('dash-toast--visible'); }, 10);
        setTimeout(function () {
            el.classList.remove('dash-toast--visible');
            setTimeout(function () { el.remove(); }, 300);
        }, 3500);
    }

    // ─── Tab navigation ───────────────────────────────────────────────────────
    function initTabs() {
        var tabs = document.querySelectorAll('[data-tab]');
        var sections = document.querySelectorAll('[data-section]');
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                tabs.forEach(function (t) { t.classList.remove('active'); });
                tab.classList.add('active');
                var target = tab.getAttribute('data-tab');
                sections.forEach(function (s) {
                    s.style.display = s.getAttribute('data-section') === target ? '' : 'none';
                });
            });
        });
    }

    // ─── Avatar ───────────────────────────────────────────────────────────────
    function loadAvatar() {
        var avatar = $('dashAvatar');
        var avatarLarge = $('dashAvatarLarge');
        var saved = null;
        try { saved = localStorage.getItem(AVATAR_KEY); } catch (_) {}
        if (saved) {
            if (avatar) { avatar.style.backgroundImage = 'url(' + saved + ')'; avatar.textContent = ''; avatar.classList.add('has-img'); }
            if (avatarLarge) { avatarLarge.style.backgroundImage = 'url(' + saved + ')'; avatarLarge.textContent = ''; avatarLarge.classList.add('has-img'); }
        }
    }

    function initAvatarUpload() {
        var input = $('avatarFileInput');
        var btn = $('avatarUploadBtn');
        var removeBtn = $('avatarRemoveBtn');
        if (btn && input) {
            btn.addEventListener('click', function () { input.click(); });
            input.addEventListener('change', function () {
                var file = input.files && input.files[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { toast('Image must be under 2MB', 'error'); return; }
                var reader = new FileReader();
                reader.onload = function (e) {
                    try { localStorage.setItem(AVATAR_KEY, e.target.result); } catch (_) { toast('Storage full', 'error'); return; }
                    loadAvatar();
                    toast('Avatar updated!', 'success');
                };
                reader.readAsDataURL(file);
            });
        }
        if (removeBtn) {
            removeBtn.addEventListener('click', function () {
                try { localStorage.removeItem(AVATAR_KEY); } catch (_) {}
                var avatar = $('dashAvatar');
                var avatarLarge = $('dashAvatarLarge');
                if (avatar) { avatar.style.backgroundImage = ''; avatar.classList.remove('has-img'); }
                if (avatarLarge) { avatarLarge.style.backgroundImage = ''; avatarLarge.classList.remove('has-img'); }
                renderUserHeader(currentUser);
                toast('Avatar removed', 'info');
            });
        }
    }

    // ─── Render functions ─────────────────────────────────────────────────────
    var currentUser = null;

    function renderUserHeader(user) {
        if (!user) return;
        var meta = user.user_metadata || {};
        var name = (meta.first_name || '') + (meta.last_name ? ' ' + meta.last_name : '');
        if (!name.trim()) name = meta.username || user.email.split('@')[0];
        var initials = name.split(' ').map(function (w) { return w.charAt(0).toUpperCase(); }).join('').substring(0, 2);

        var el = $('dashUserName');   if (el) el.textContent = name;
        var el2 = $('dashUserEmail'); if (el2) el2.textContent = user.email;
        var el3 = $('dashUserRole');  if (el3) el3.textContent = (user.role || 'user').toUpperCase();

        var avatar = $('dashAvatar');
        var avatarLarge = $('dashAvatarLarge');
        var hasSaved = false;
        try { hasSaved = !!localStorage.getItem(AVATAR_KEY); } catch (_) {}
        if (!hasSaved) {
            if (avatar) { avatar.textContent = initials; avatar.classList.remove('has-img'); avatar.style.backgroundImage = ''; }
            if (avatarLarge) { avatarLarge.textContent = initials; avatarLarge.classList.remove('has-img'); avatarLarge.style.backgroundImage = ''; }
        }
    }

    function renderOverview(user) {
        if (!user) return;
        var meta = user.user_metadata || {};
        var el;
        el = $('ovEmail');       if (el) el.textContent = user.email;
        el = $('ovVerified');    if (el) { el.textContent = user.email_confirmed_at ? 'Verified' : 'Not Verified'; el.className = 'dash-badge ' + (user.email_confirmed_at ? 'dash-badge--green' : 'dash-badge--red'); }
        el = $('ovMemberSince'); if (el) el.textContent = formatDate(user.created_at);
        el = $('ovLastLogin');   if (el) el.textContent = formatDateTime(user.last_sign_in_at);
        el = $('ovProvider');    if (el) el.textContent = (user.app_metadata && user.app_metadata.provider) || 'email';
        el = $('ovUsername');    if (el) el.textContent = meta.username || '—';
        el = $('ovCountry');    if (el) el.textContent = meta.country || '—';
        el = $('ovUserId');     if (el) el.textContent = user.id || '—';

        // 2FA status
        el = $('ov2FA');
        if (el) {
            check2FAStatus().then(function (factors) {
                var active = factors.filter(function (f) { return f.status === 'verified'; });
                el.textContent = active.length > 0 ? 'Enabled' : 'Disabled';
                el.className = 'dash-badge ' + (active.length > 0 ? 'dash-badge--green' : 'dash-badge--yellow');
            }).catch(function () {
                el.textContent = 'Unknown';
                el.className = 'dash-badge dash-badge--gray';
            });
        }
    }

    var COUNTRIES = [
        ['AF','Afghanistan'],['AL','Albania'],['DZ','Algeria'],['AR','Argentina'],['AU','Australia'],['AT','Austria'],['BE','Belgium'],['BR','Brazil'],['BG','Bulgaria'],['CA','Canada'],['CL','Chile'],['CN','China'],['CO','Colombia'],['HR','Croatia'],['CZ','Czech Republic'],['DK','Denmark'],['EG','Egypt'],['EE','Estonia'],['FI','Finland'],['FR','France'],['DE','Germany'],['GR','Greece'],['HU','Hungary'],['IN','India'],['ID','Indonesia'],['IE','Ireland'],['IL','Israel'],['IT','Italy'],['JP','Japan'],['KR','South Korea'],['LV','Latvia'],['LT','Lithuania'],['MY','Malaysia'],['MX','Mexico'],['NL','Netherlands'],['NZ','New Zealand'],['NG','Nigeria'],['NO','Norway'],['PK','Pakistan'],['PH','Philippines'],['PL','Poland'],['PT','Portugal'],['RO','Romania'],['SA','Saudi Arabia'],['RS','Serbia'],['SG','Singapore'],['SK','Slovakia'],['SI','Slovenia'],['ZA','South Africa'],['ES','Spain'],['SE','Sweden'],['CH','Switzerland'],['TH','Thailand'],['TR','Turkey'],['UA','Ukraine'],['AE','United Arab Emirates'],['GB','United Kingdom'],['US','United States'],['VN','Vietnam']
    ];

    function populateCountrySelect() {
        var sel = $('editCountry');
        if (!sel || sel.options.length > 1) return;
        COUNTRIES.forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = c[0]; opt.textContent = c[1];
            sel.appendChild(opt);
        });
    }

    function renderPersonalInfo(user) {
        if (!user) return;
        var meta = user.user_metadata || {};
        populateCountrySelect();
        var el;
        el = $('editFirstName');  if (el) el.value = meta.first_name || '';
        el = $('editLastName');   if (el) el.value = meta.last_name || '';
        el = $('editUsername');    if (el) el.value = meta.username || '';
        el = $('editAddress');    if (el) el.value = meta.address || '';
        el = $('editCountry');    if (el) el.value = meta.country || '';
        el = $('editEmail');      if (el) el.value = user.email || '';
    }

    // ─── Personal info update ─────────────────────────────────────────────────
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
                var session = null;
                try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (_) {}
                if (session) { session.user = user; saveSession(session); }
                renderUserHeader(user);
                renderOverview(user);
                toast('Profile updated!', 'success');
            }).catch(function (err) {
                toast(err.message || 'Failed to update profile', 'error');
            }).then(function () {
                if (btn) btn.disabled = false;
            });
        });
    }

    // ─── Password change ──────────────────────────────────────────────────────
    function initPasswordForm() {
        var form = $('passwordForm');
        if (!form) return;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var newPw = ($('newPassword') || {}).value || '';
            var confirmPw = ($('confirmNewPassword') || {}).value || '';
            var statusEl = $('pwChangeStatus');

            if (newPw.length < 8) {
                if (statusEl) { statusEl.textContent = 'Password must be at least 8 characters.'; statusEl.className = 'dash-form-status dash-form-status--error'; }
                return;
            }
            if (!/[A-Z]/.test(newPw) || !/[0-9]/.test(newPw) || !/[^a-zA-Z0-9]/.test(newPw)) {
                if (statusEl) { statusEl.textContent = 'Password needs uppercase, number, and special character.'; statusEl.className = 'dash-form-status dash-form-status--error'; }
                return;
            }
            if (newPw !== confirmPw) {
                if (statusEl) { statusEl.textContent = 'Passwords do not match.'; statusEl.className = 'dash-form-status dash-form-status--error'; }
                return;
            }

            var btn = form.querySelector('button[type="submit"]');
            if (btn) btn.disabled = true;
            if (statusEl) { statusEl.textContent = ''; statusEl.className = 'dash-form-status'; }

            api('/auth/v1/user', 'PUT', { password: newPw })
                .then(function () {
                    form.reset();
                    toast('Password changed successfully!', 'success');
                    if (statusEl) { statusEl.textContent = 'Password updated.'; statusEl.className = 'dash-form-status dash-form-status--success'; }
                })
                .catch(function (err) {
                    if (statusEl) { statusEl.textContent = err.message; statusEl.className = 'dash-form-status dash-form-status--error'; }
                })
                .then(function () { if (btn) btn.disabled = false; });
        });
    }

    // ─── 2FA / TOTP ──────────────────────────────────────────────────────────
    function check2FAStatus() {
        return api('/auth/v1/factors', 'GET');
    }

    function render2FASection() {
        var container = $('twoFactorContent');
        if (!container) return;

        container.innerHTML = '<p class="dash-muted">Loading 2FA status...</p>';

        check2FAStatus().then(function (factors) {
            var verified = [];
            var unverified = [];
            if (Array.isArray(factors)) {
                factors.forEach(function (f) {
                    if (f.status === 'verified') verified.push(f);
                    else unverified.push(f);
                });
            }

            var html = '';
            if (verified.length > 0) {
                html += '<div class="dash-2fa-status">';
                html += '<div class="dash-2fa-enabled"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11.5 14.5 15.5 9.5" stroke="#22c55e" stroke-width="2"/></svg>';
                html += '<span>Two-Factor Authentication is <strong>enabled</strong></span></div>';
                verified.forEach(function (f) {
                    html += '<div class="dash-2fa-factor"><span>TOTP — ' + (f.friendly_name || 'Authenticator') + '</span>';
                    html += '<span class="dash-muted">Added ' + formatDate(f.created_at) + '</span>';
                    html += '<button class="btn btn-ghost btn-sm dash-2fa-remove" data-factor-id="' + f.id + '">Remove</button></div>';
                });
                html += '</div>';
            } else {
                html += '<div class="dash-2fa-status">';
                html += '<div class="dash-2fa-disabled"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--txt-muted)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
                html += '<span>Two-Factor Authentication is <strong>not enabled</strong></span></div>';
                html += '<p class="dash-muted">Add an extra layer of security to your account using a TOTP authenticator app (Google Authenticator, Authy, etc.).</p>';
                html += '<button class="btn btn-primary btn-sm" id="enable2FABtn">Enable Two-Factor Authentication</button>';
                html += '</div>';
            }

            // Cleanup unverified factors
            unverified.forEach(function (f) {
                api('/auth/v1/factors/' + f.id, 'DELETE').catch(function () {});
            });

            container.innerHTML = html;

            // Bind enable button
            var enableBtn = $('enable2FABtn');
            if (enableBtn) {
                enableBtn.addEventListener('click', function () { startTOTPEnrollment(container); });
            }

            // Bind remove buttons
            container.querySelectorAll('.dash-2fa-remove').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var fid = btn.getAttribute('data-factor-id');
                    if (!confirm('Are you sure you want to remove this authenticator?')) return;
                    btn.disabled = true;
                    api('/auth/v1/factors/' + fid, 'DELETE')
                        .then(function () { toast('2FA removed', 'info'); render2FASection(); })
                        .catch(function (err) { toast(err.message, 'error'); btn.disabled = false; });
                });
            });
        }).catch(function (err) {
            container.innerHTML = '<p class="dash-muted">Could not load 2FA status: ' + (err.message || 'Unknown error') + '</p>';
        });
    }

    function startTOTPEnrollment(container) {
        container.innerHTML = '<p class="dash-muted">Setting up authenticator...</p>';

        api('/auth/v1/factors', 'POST', { factor_type: 'totp', friendly_name: 'ALTIVOR Authenticator' })
            .then(function (factor) {
                var qrCode = factor.totp && factor.totp.qr_code;
                var secret = factor.totp && factor.totp.secret;
                var factorId = factor.id;

                var html = '<div class="dash-2fa-setup">';
                html += '<h4>Scan QR Code</h4>';
                html += '<p class="dash-muted">Open your authenticator app and scan this QR code, or enter the secret key manually.</p>';
                if (qrCode) html += '<div class="dash-2fa-qr"><img src="' + qrCode + '" alt="QR Code" width="200" height="200" /></div>';
                if (secret) html += '<div class="dash-2fa-secret"><label>Secret Key</label><code>' + secret + '</code></div>';
                html += '<form class="dash-2fa-verify-form" id="verify2FAForm">';
                html += '<label for="totpCode">Enter 6-digit code from your app</label>';
                html += '<div class="dash-2fa-code-row">';
                html += '<input type="text" id="totpCode" maxlength="6" pattern="[0-9]{6}" placeholder="000000" autocomplete="one-time-code" required />';
                html += '<button type="submit" class="btn btn-primary btn-sm">Verify & Enable</button>';
                html += '</div>';
                html += '<p class="dash-form-status" id="totp2FAStatus"></p>';
                html += '</form>';
                html += '<button class="btn btn-ghost btn-sm" id="cancel2FABtn">Cancel</button>';
                html += '</div>';

                container.innerHTML = html;

                // First create a challenge
                api('/auth/v1/factors/' + factorId + '/challenge', 'POST')
                    .then(function (challenge) {
                        var challengeId = challenge.id;

                        $('verify2FAForm').addEventListener('submit', function (e) {
                            e.preventDefault();
                            var code = ($('totpCode') || {}).value || '';
                            var statusEl = $('totp2FAStatus');
                            if (code.length !== 6) {
                                if (statusEl) { statusEl.textContent = 'Enter a 6-digit code.'; statusEl.className = 'dash-form-status dash-form-status--error'; }
                                return;
                            }
                            var btn = e.target.querySelector('button[type="submit"]');
                            if (btn) btn.disabled = true;

                            api('/auth/v1/factors/' + factorId + '/verify', 'POST', {
                                challenge_id: challengeId,
                                code: code
                            }).then(function (result) {
                                // Update session if new tokens returned
                                if (result.access_token) {
                                    var session = null;
                                    try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (_) {}
                                    if (session) {
                                        session.access_token = result.access_token;
                                        if (result.refresh_token) session.refresh_token = result.refresh_token;
                                        saveSession(session);
                                    }
                                }
                                toast('Two-Factor Authentication enabled!', 'success');
                                render2FASection();
                            }).catch(function (err) {
                                if (statusEl) { statusEl.textContent = err.message; statusEl.className = 'dash-form-status dash-form-status--error'; }
                                if (btn) btn.disabled = false;
                            });
                        });

                        $('cancel2FABtn').addEventListener('click', function () {
                            api('/auth/v1/factors/' + factorId, 'DELETE').catch(function () {});
                            render2FASection();
                        });
                    })
                    .catch(function (err) {
                        container.innerHTML = '<p class="dash-muted">Failed to create challenge: ' + err.message + '</p>';
                    });
            })
            .catch(function (err) {
                container.innerHTML = '<p class="dash-muted">Failed to set up 2FA: ' + err.message + '</p>';
                setTimeout(function () { render2FASection(); }, 2000);
            });
    }

    // ─── Purchases ────────────────────────────────────────────────────────────
    function renderPurchases() {
        var container = $('purchasesContent');
        if (!container) return;

        var purchases = [];
        try {
            var raw = localStorage.getItem(PURCHASES_KEY);
            if (raw) purchases = JSON.parse(raw);
        } catch (_) {}

        if (!purchases || purchases.length === 0) {
            container.innerHTML = '<div class="dash-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-muted)" stroke-width="1.5"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 7h8M8 11h5"/></svg><p>No purchases yet</p><p class="dash-muted">When you purchase a plan or product, it will appear here.</p></div>';
            return;
        }

        var html = '<table class="dash-table"><thead><tr><th>Date</th><th>Item</th><th>Amount</th><th>Status</th></tr></thead><tbody>';
        purchases.forEach(function (p) {
            var statusCls = p.status === 'completed' ? 'dash-badge--green' : p.status === 'pending' ? 'dash-badge--yellow' : 'dash-badge--red';
            html += '<tr><td>' + formatDate(p.date) + '</td><td>' + (p.item || '—') + '</td><td>' + (p.amount || '—') + '</td><td><span class="dash-badge ' + statusCls + '">' + (p.status || '—') + '</span></td></tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    // ─── Active sessions ──────────────────────────────────────────────────────
    function renderSessions() {
        var el = $('sessionsContent');
        if (!el) return;
        var token = getToken();
        if (!token) { el.innerHTML = '<p class="dash-muted">No active session.</p>'; return; }
        try {
            var parts = token.split('.');
            var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            var html = '<div class="dash-session-card">';
            html += '<div class="dash-session-row"><span class="dash-label">Session ID</span><span class="dash-value dash-mono">' + (payload.session_id || payload.sub || '—').substring(0, 20) + '...</span></div>';
            html += '<div class="dash-session-row"><span class="dash-label">Auth Level</span><span class="dash-badge ' + (payload.aal === 'aal2' ? 'dash-badge--green' : 'dash-badge--yellow') + '">' + (payload.aal || 'aal1').toUpperCase() + '</span></div>';
            html += '<div class="dash-session-row"><span class="dash-label">Issued</span><span class="dash-value">' + formatDateTime(new Date(payload.iat * 1000).toISOString()) + '</span></div>';
            html += '<div class="dash-session-row"><span class="dash-label">Expires</span><span class="dash-value">' + formatDateTime(new Date(payload.exp * 1000).toISOString()) + '</span></div>';
            html += '</div>';
            el.innerHTML = html;
        } catch (_) {
            el.innerHTML = '<p class="dash-muted">Could not parse session.</p>';
        }
    }

    // ─── Logout ───────────────────────────────────────────────────────────────
    function initLogout() {
        var btn = $('dashLogoutBtn');
        if (!btn) return;
        btn.addEventListener('click', function () {
            if (typeof window.altivorAuth === 'object' && window.altivorAuth.logout) {
                window.altivorAuth.logout();
            } else {
                try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
            }
            window.location.href = 'index.html';
        });
        var btn2 = $('dashLogoutBtn2');
        if (btn2) btn2.addEventListener('click', function () { btn.click(); });
    }

    // ─── Main init ────────────────────────────────────────────────────────────
    function init() {
        var loadingEl  = $('dashLoading');
        var notLogged  = $('dashNotLogged');
        var contentEl  = $('dashContent');

        var token = getToken();
        if (!token) {
            hide(loadingEl);
            show(notLogged);
            return;
        }

        api('/auth/v1/user', 'GET')
            .then(function (user) {
                currentUser = user;
                hide(loadingEl);
                show(contentEl);
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
                show(notLogged);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
