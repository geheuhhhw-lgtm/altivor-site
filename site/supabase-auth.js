/* ═══════════════════════════════════════════════════════════════════════
   ALTIVOR — Supabase Auth (plain fetch, zero SDK dependency)
   Talks directly to Supabase REST API. No CDN, no external libraries.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var BASE = 'https://lssedurdadjngqbchjbj.supabase.co';
    var KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxzc2VkdXJkYWRqbmdxYmNoamJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTk5OTksImV4cCI6MjA5MjEzNTk5OX0.PG6Ljeo9i0apJkU-X0QWsoS0KMn5CmnmFtmaIl3JdAs';
    var SESSION_KEY = 'altivor_session';

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
    function toggleEl(el, hidden) {
        if (!el) return;
        if (!el.dataset.authOrig) el.dataset.authOrig = el.style.display || '';
        el.style.display = hidden ? 'none' : el.dataset.authOrig;
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
        nav.appendChild(btn);
        return btn;
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
        btn.addEventListener('click', function () { doLogout(); });
        nav.appendChild(btn);
        return btn;
    }

    var currentUser = null;

    function updateAuthUi(user) {
        currentUser = user || null;
        document.querySelectorAll('#openLoginBtn, #openRegisterBtn, a[data-i18n="footer_login"]').forEach(function (el) {
            toggleEl(el, Boolean(currentUser));
        });
        var p = ensureProfileButton(); if (p) toggleEl(p, !currentUser);
        var l = ensureLogoutButton(); if (l) toggleEl(l, !currentUser);
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
