/* ═══════════════════════════════════════════════════════════════════════
   ALTIVOR — Supabase Auth (plain fetch, zero SDK dependency)
   Talks directly to Supabase REST API. No CDN, no external libraries.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var BASE = 'https://lssedurdadjngqbchjbj.supabase.co';
    var KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxzc2VkdXJkYWRqbmdxYmNoamJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTk5OTksImV4cCI6MjA5MjEzNTk5OX0.PG6Ljeo9i0apJkU-X0QWsoS0KMn5CmnmFtmaIl3JdAs';
    var SESSION_KEY = 'altivor_session';
    var ADMIN_EMAIL  = 'aleksanderdobieszewski@gmail.com';

    window.__USE_SUPABASE_AUTH = true;

    // ─── Low-level API ────────────────────────────────────────────────────────
    function api(path, method, body, token) {
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

    // ─── Session storage ──────────────────────────────────────────────────────
    function saveSession(data) {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch (_) {}
    }
    function loadSession() {
        try { var s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; }
    }
    function clearSession() {
        try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    }

    // ─── UI helpers ───────────────────────────────────────────────────────────
    function showEl(el) {
        if (!el) return;
        el.style.display = '';
        el.style.removeProperty('display');
        el.removeAttribute('hidden');
    }
    function hideEl(el) {
        if (!el) return;
        el.style.display = 'none';
    }

    function ensureProfileButton() {
        var btn = document.getElementById('authProfileBtn');
        if (btn) return btn;
        var nav = document.querySelector('.nav-actions');
        if (!nav) return null;
        btn = document.createElement('a');
        btn.id = 'authProfileBtn';
        btn.href = 'profile.html';
        btn.className = 'btn btn-primary nav-cta';
        btn.textContent = 'Profile';
        btn.style.display = 'none';
        var loginBtn = document.getElementById('openLoginBtn');
        if (loginBtn) {
            nav.insertBefore(btn, loginBtn);
        } else {
            nav.appendChild(btn);
        }
        return btn;
    }

    function ensureAdminLink() {
        var link = document.getElementById('authAdminLink');
        if (link) return link;
        var nav = document.querySelector('.nav-actions');
        if (!nav) return null;
        link = document.createElement('a');
        link.id = 'authAdminLink';
        link.href = 'admin.html';
        link.className = 'btn nav-cta';
        link.style.cssText = 'font-weight:700;background:linear-gradient(135deg,rgba(167,139,250,.15),rgba(96,165,250,.1));color:#a78bfa;border:1px solid rgba(167,139,250,.25);letter-spacing:.06em;font-size:.72rem;text-transform:uppercase;transition:all .2s';
        link.textContent = 'Admin';
        link.addEventListener('mouseenter',function(){link.style.background='linear-gradient(135deg,rgba(167,139,250,.25),rgba(96,165,250,.18)';link.style.borderColor='rgba(167,139,250,.45)';link.style.boxShadow='0 0 16px rgba(167,139,250,.12)'});
        link.addEventListener('mouseleave',function(){link.style.background='linear-gradient(135deg,rgba(167,139,250,.15),rgba(96,165,250,.1))';link.style.borderColor='rgba(167,139,250,.25)';link.style.boxShadow='none'});
        link.style.display = 'none';
        var profBtn = document.getElementById('authProfileBtn');
        if (profBtn) {
            nav.insertBefore(link, profBtn);
        } else {
            nav.appendChild(link);
        }
        return link;
    }

    function isAdmin(user) {
        if (!user || !user.email) return false;
        return user.email.trim().toLowerCase() === ADMIN_EMAIL;
    }

    function ensureLogoutButton() {
        var btn = document.getElementById('authLogoutBtn');
        if (btn) return btn;
        var nav = document.querySelector('.nav-actions');
        if (!nav) return null;
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'authLogoutBtn';
        btn.className = 'btn btn-ghost nav-cta';
        btn.textContent = 'Logout';
        btn.style.display = 'none';
        btn.addEventListener('click', function () { showLogoutConfirm(); });
        var regBtn = document.getElementById('openRegisterBtn');
        if (regBtn && regBtn.nextSibling) {
            nav.insertBefore(btn, regBtn.nextSibling);
        } else {
            nav.appendChild(btn);
        }
        return btn;
    }

    var currentUser = null;

    function updateAuthUi(user) {
        currentUser = user || null;
        console.log('[Auth] updateAuthUi:', currentUser ? currentUser.email : 'null');

        var loginBtn = document.getElementById('openLoginBtn');
        var regBtn   = document.getElementById('openRegisterBtn');
        var profBtn  = ensureProfileButton();
        var logBtn   = ensureLogoutButton();

        var adminLink = ensureAdminLink();

        if (currentUser) {
            hideEl(loginBtn);
            hideEl(regBtn);
            showEl(logBtn);
            if (isAdmin(currentUser)) {
                hideEl(profBtn);
                showEl(adminLink);
            } else {
                showEl(profBtn);
                hideEl(adminLink);
            }
        } else {
            showEl(loginBtn);
            showEl(regBtn);
            hideEl(profBtn);
            hideEl(logBtn);
            hideEl(adminLink);
        }

        document.querySelectorAll('a[data-i18n="footer_login"]').forEach(function (el) {
            if (currentUser) hideEl(el); else showEl(el);
        });

        document.dispatchEvent(new CustomEvent('altivor:authchange', { detail: { user: currentUser } }));
    }

    // ─── Form helpers ─────────────────────────────────────────────────────────
    function statusEl(form) {
        var el = form.querySelector('[data-auth-status]');
        if (el) return el;
        el = document.createElement('div');
        el.className = 'auth-field-error';
        el.setAttribute('data-auth-status', 'true');
        el.setAttribute('aria-live', 'polite');
        form.appendChild(el);
        return el;
    }

    function setStatus(form, msg, ok) {
        if (!form) return;
        var el = statusEl(form);
        el.textContent = msg || '';
        el.classList.toggle('visible', Boolean(msg));
        el.style.color = ok ? '#22c55e' : '';
    }

    function setBusy(form, on) {
        if (!form) return;
        form.querySelectorAll('button, input').forEach(function (el) {
            if (el.type === 'hidden' || (el.classList && el.classList.contains('auth-close'))) return;
            el.disabled = Boolean(on);
        });
    }

    function closeAuthModal(form) {
        var ov = form && form.closest ? form.closest('.auth-overlay') : null;
        if (!ov) return;
        if (typeof window.closeModal === 'function' && ov.id) { window.closeModal(ov.id); return; }
        ov.classList.remove('active');
        document.body.classList.remove('modal-open');
    }

    function clearPw(form) {
        form.querySelectorAll('input[type="password"]').forEach(function (i) { i.value = ''; });
    }

    // Read field value directly by name (NOT FormData)
    function val(form, name) {
        var el = form.querySelector('[name="' + name + '"]');
        if (!el) return '';
        if (el.type === 'checkbox') return el.checked;
        if (el.tagName === 'SELECT') return el.value;
        return (el.value || '').trim();
    }

    function validateRegister(form) {
        var password = val(form, 'password');
        var confirm  = val(form, 'passwordConfirm');
        var consent  = val(form, 'consent');
        var pwErr    = document.getElementById('regPwError');
        var conErr   = document.getElementById('regConsentError');

        if (pwErr) {
            if (password !== confirm) {
                pwErr.textContent = 'Passwords do not match.';
                pwErr.style.display = 'block';
            } else if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
                pwErr.textContent = 'Password must be at least 8 characters with one uppercase letter, one number, and one special character.';
                pwErr.style.display = 'block';
            } else {
                pwErr.style.display = 'none';
            }
        }

        if (password !== confirm) { setStatus(form, 'Passwords do not match.'); return false; }
        if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
            setStatus(form, 'Password must be at least 8 characters with one uppercase letter, one number, and one special character.');
            return false;
        }
        if (!consent) {
            if (conErr) conErr.style.display = 'block';
            setStatus(form, 'You must accept the terms to create an account.');
            return false;
        }
        if (conErr) conErr.style.display = 'none';
        return true;
    }

    // ─── Core auth actions (plain fetch) ──────────────────────────────────────
    function doLogin(form) {
        setStatus(form, '');
        var email    = val(form, 'email');
        var password = val(form, 'password');

        if (!email || !password) {
            setStatus(form, 'Please enter your email and password.');
            return;
        }

        console.log('[Auth] LOGIN attempt:', email);
        setBusy(form, true);

        api('/auth/v1/token?grant_type=password', 'POST', { email: email, password: password })
            .then(function (data) {
                console.log('[Auth] LOGIN SUCCESS:', data.user && data.user.email);
                saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
                updateAuthUi(data.user);
                clearPw(form);
                form.reset();
                closeAuthModal(form);
            })
            .catch(function (err) {
                console.error('[Auth] LOGIN ERROR:', err.message, 'status:', err.status, 'code:', err.code);
                clearPw(form);
                setStatus(form, err.message);
            })
            .then(function () { setBusy(form, false); });
    }

    function doRegister(form) {
        setStatus(form, '');
        if (!validateRegister(form)) return;

        var email     = val(form, 'email');
        var password  = val(form, 'password');
        var firstName = val(form, 'firstName');
        var lastName  = val(form, 'lastName');
        var username  = val(form, 'username');
        var address   = val(form, 'address');
        var country   = val(form, 'country');

        if (!email) {
            setStatus(form, 'Please enter your email address.');
            return;
        }

        console.log('[Auth] REGISTER attempt:', email, 'password length:', password.length);
        setBusy(form, true);

        api('/auth/v1/signup', 'POST', {
            email: email,
            password: password,
            data: { first_name: firstName, last_name: lastName, username: username, address: address, country: country }
        })
            .then(function (data) {
                console.log('[Auth] REGISTER SUCCESS:', data.email || (data.user && data.user.email));
                if (data.access_token) {
                    // Auto-confirmed → user is logged in
                    saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user || data });
                    updateAuthUi(data.user || data);
                    clearPw(form);
                    form.reset();
                    closeAuthModal(form);
                } else {
                    // Email confirmation required
                    clearPw(form);
                    form.reset();
                    closeAuthModal(form);
                    setStatus(form, 'Account created! Check your email for the confirmation link.', true);
                }
            })
            .catch(function (err) {
                console.error('[Auth] REGISTER ERROR:', err.message, 'status:', err.status, 'code:', err.code);
                clearPw(form);
                setStatus(form, err.message);
            })
            .then(function () { setBusy(form, false); });
    }

    function doLogout() {
        var session = loadSession();
        var token = session && session.access_token;
        clearSession();
        updateAuthUi(null);
        if (token) {
            api('/auth/v1/logout', 'POST', {}, token).catch(function () {});
        }
    }

    // ─── Logout confirmation modal ───────────────────────────────────────────
    function ensureLogoutModal() {
        if (document.getElementById('authLogoutOverlay')) return;
        var css = '<style>'
            + '.auth-logout-overlay{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}'
            + '.auth-logout-overlay.active{display:flex}'
            + '.auth-logout-box{background:var(--bg-card,#1a1a1a);border:1px solid var(--border-subtle,rgba(255,255,255,.06));border-radius:1.25rem;padding:2rem;max-width:380px;width:90%;text-align:center;box-shadow:var(--shadow-card,0 24px 48px rgba(0,0,0,.25))}'
            + '.auth-logout-icon{width:56px;height:56px;border-radius:50%;background:rgba(239,68,68,.08);display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem}'
            + '.auth-logout-title{font-family:"DM Serif Display",serif;font-size:1.25rem;color:var(--txt-primary,#f0f0f0);margin:0 0 .5rem}'
            + '.auth-logout-desc{font-size:.82rem;color:var(--txt-secondary,#888);margin:0 0 1.5rem;line-height:1.5}'
            + '.auth-logout-btns{display:flex;gap:.65rem;justify-content:center}'
            + '.auth-logout-btns .btn{min-width:110px}'
            + '.auth-logout-btns .btn-danger{background:rgba(239,68,68,.9);color:#fff;border:none}.auth-logout-btns .btn-danger:hover{background:#ef4444}'
            + '[data-theme="light"] .auth-logout-overlay{background:rgba(0,0,0,.35)}'
            + '[data-theme="light"] .auth-logout-icon{background:rgba(220,38,38,.07)}'
            + '</style>';
        var html = '<div class="auth-logout-overlay" id="authLogoutOverlay">'
            + '<div class="auth-logout-box">'
            + '<div class="auth-logout-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></div>'
            + '<h3 class="auth-logout-title">Sign Out?</h3>'
            + '<p class="auth-logout-desc">Are you sure you want to sign out of your ALTIVOR account? You will need to sign in again to access your dashboard.</p>'
            + '<div class="auth-logout-btns">'
            + '<button class="btn btn-ghost" id="authLogoutCancel">Cancel</button>'
            + '<button class="btn btn-danger" id="authLogoutConfirmBtn">Sign Out</button>'
            + '</div></div></div>';
        document.body.insertAdjacentHTML('beforeend', css + html);
        var overlay = document.getElementById('authLogoutOverlay');
        document.getElementById('authLogoutCancel').addEventListener('click', function () { overlay.classList.remove('active'); });
        document.getElementById('authLogoutConfirmBtn').addEventListener('click', function () {
            overlay.classList.remove('active');
            doLogout();
        });
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.classList.remove('active'); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('active')) overlay.classList.remove('active'); });
    }

    function showLogoutConfirm() {
        ensureLogoutModal();
        var ov = document.getElementById('authLogoutOverlay');
        if (ov) ov.classList.add('active');
    }

    function refreshSession() {
        var session = loadSession();
        if (!session || !session.access_token) {
            updateAuthUi(null);
            return;
        }
        api('/auth/v1/user', 'GET', null, session.access_token)
            .then(function (user) { updateAuthUi(user); })
            .catch(function () {
                clearSession();
                updateAuthUi(null);
            });
    }

    // ─── Form interception ────────────────────────────────────────────────────
    function interceptSubmit(event) {
        var form = event.target;
        if (!form || !form.id) return;
        if (form.id === 'loginForm') {
            event.preventDefault();
            event.stopImmediatePropagation();
            doLogin(form);
        } else if (form.id === 'registerForm') {
            event.preventDefault();
            event.stopImmediatePropagation();
            doRegister(form);
        }
    }

    window.handleLogin = function (event) {
        if (event) { event.preventDefault(); if (event.stopImmediatePropagation) event.stopImmediatePropagation(); }
        var form = event && event.target && event.target.closest ? event.target.closest('form') : document.querySelector('#loginForm');
        if (form) doLogin(form);
        return false;
    };
    window.handleRegister = function (event) {
        if (event) { event.preventDefault(); if (event.stopImmediatePropagation) event.stopImmediatePropagation(); }
        var form = event && event.target && event.target.closest ? event.target.closest('form') : document.querySelector('#registerForm');
        if (form) doRegister(form);
        return false;
    };

    window.altivorAuth = {
        getUser: function () { return currentUser; },
        refresh: refreshSession,
        logout: doLogout
    };

    document.addEventListener('submit', interceptSubmit, true);

    function prefillRememberedEmail() {
        try {
            var stored = localStorage.getItem('altivor_remembered_user');
            if (!stored) return;
            var data = JSON.parse(stored);
            if (!data || !data.email) return;
            document.querySelectorAll('#loginForm').forEach(function (form) {
                var emailInput = form.querySelector('input[name="email"]');
                var rememberInput = form.querySelector('input[name="remember"]');
                if (emailInput && !emailInput.value) emailInput.value = data.email;
                if (rememberInput) rememberInput.checked = true;
            });
        } catch (_) {}
    }

    function init() {
        prefillRememberedEmail();
        refreshSession();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
