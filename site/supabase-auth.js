/* ═══════════════════════════════════════════════════════════════════════
   ALTIVOR — Supabase Auth integration
   Replaces the old /api/auth/* backend with Supabase Auth (static client).
   Self-contained: loads Supabase SDK from CDN if not present.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var SUPABASE_URL = 'https://lssedurdadjngqbchjbj.supabase.co';
    var SUPABASE_ANON_KEY = 'sb_publishable_VY2ryzQIOm0bLITfzKIuzg_63Hjcen_';
    var SDK_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

    // Tell the legacy auth code in script.js to stand down.
    window.__USE_SUPABASE_AUTH = true;

    var clientPromise = null;

    function loadSupabaseSdk() {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            return Promise.resolve(window.supabase);
        }
        return new Promise(function (resolve, reject) {
            var existing = document.querySelector('script[data-supabase-sdk]');
            if (existing) {
                existing.addEventListener('load', function () { resolve(window.supabase); });
                existing.addEventListener('error', reject);
                return;
            }
            var s = document.createElement('script');
            s.src = SDK_CDN;
            s.async = true;
            s.setAttribute('data-supabase-sdk', '1');
            s.onload = function () { resolve(window.supabase); };
            s.onerror = function () { reject(new Error('Failed to load Supabase SDK')); };
            document.head.appendChild(s);
        });
    }

    function getClient() {
        if (clientPromise) return clientPromise;
        clientPromise = loadSupabaseSdk().then(function (sb) {
            return sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                    storage: window.localStorage
                }
            });
        });
        return clientPromise;
    }

    // ─── UI helpers (mirror old script.js so nav buttons behave identically) ──
    function toggleElementDisplay(el, hidden) {
        if (!el) return;
        if (!Object.prototype.hasOwnProperty.call(el.dataset, 'authOriginalDisplay')) {
            el.dataset.authOriginalDisplay = el.style.display || '';
        }
        el.style.display = hidden ? 'none' : el.dataset.authOriginalDisplay;
    }

    function ensureProfileButton() {
        var btn = document.getElementById('authProfileBtn');
        if (btn) return btn;
        var navActions = document.querySelector('.nav-actions');
        if (!navActions) return null;
        btn = document.createElement('a');
        btn.id = 'authProfileBtn';
        btn.href = 'profile.html';
        btn.className = 'btn btn-primary nav-cta';
        btn.textContent = 'Profile';
        navActions.appendChild(btn);
        return btn;
    }

    function ensureLogoutButton() {
        var btn = document.getElementById('authLogoutBtn');
        if (btn) return btn;
        var navActions = document.querySelector('.nav-actions');
        if (!navActions) return null;
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'authLogoutBtn';
        btn.className = 'btn btn-ghost nav-cta';
        btn.textContent = 'Logout';
        btn.addEventListener('click', function () { logout(); });
        navActions.appendChild(btn);
        return btn;
    }

    var currentUser = null;

    function updateAuthUi(user) {
        currentUser = user || null;
        document.querySelectorAll('#openLoginBtn, #openRegisterBtn, a[data-i18n="footer_login"]').forEach(function (el) {
            toggleElementDisplay(el, Boolean(currentUser));
        });
        var profileBtn = ensureProfileButton();
        if (profileBtn) toggleElementDisplay(profileBtn, !currentUser);
        var logoutBtn = ensureLogoutButton();
        if (logoutBtn) toggleElementDisplay(logoutBtn, !currentUser);
        document.dispatchEvent(new CustomEvent('altivor:authchange', { detail: { user: currentUser } }));
    }

    // ─── Form helpers ─────────────────────────────────────────────────────────
    function ensureStatusEl(form) {
        var el = form.querySelector('[data-auth-status]');
        if (el) return el;
        el = document.createElement('div');
        el.className = 'auth-field-error';
        el.setAttribute('data-auth-status', 'true');
        el.setAttribute('aria-live', 'polite');
        form.appendChild(el);
        return el;
    }

    function setStatus(form, message, isSuccess) {
        if (!form) return;
        var el = ensureStatusEl(form);
        el.textContent = message || '';
        el.classList.toggle('visible', Boolean(message));
        el.style.color = isSuccess ? '#22c55e' : '';
    }

    function setBusy(form, busy) {
        if (!form) return;
        form.querySelectorAll('button, input').forEach(function (el) {
            if (el.type === 'hidden') return;
            if (el.classList && el.classList.contains('auth-close')) return;
            el.disabled = Boolean(busy);
        });
    }

    function closeModalForForm(form) {
        var overlay = form && form.closest ? form.closest('.auth-overlay') : null;
        if (!overlay) return;
        if (typeof window.closeModal === 'function' && overlay.id) {
            window.closeModal(overlay.id);
            return;
        }
        overlay.classList.remove('active');
        document.body.classList.remove('modal-open');
    }

    function clearPasswords(form) {
        form.querySelectorAll('input[type="password"]').forEach(function (i) { i.value = ''; });
    }

    function formToObject(form) {
        var out = {};
        new FormData(form).forEach(function (v, k) { out[k] = v; });
        var consent = form.querySelector('input[name="consent"]');
        if (consent) out.consent = consent.checked;
        return out;
    }

    function validateRegister(form) {
        var pw = form.querySelector('input[name="password"]');
        var pw2 = form.querySelector('input[name="passwordConfirm"]');
        var consent = form.querySelector('input[name="consent"]');
        var pwError = document.getElementById('regPwError');
        var consentError = document.getElementById('regConsentError');
        var password = pw ? pw.value : '';
        var confirm = pw2 ? pw2.value : '';

        if (pwError) {
            if (password !== confirm) {
                pwError.textContent = 'Passwords do not match.';
                pwError.style.display = 'block';
            } else if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
                pwError.textContent = 'Password must be at least 8 characters with one uppercase letter, one number, and one special character.';
                pwError.style.display = 'block';
            } else {
                pwError.style.display = 'none';
            }
        }

        if (password !== confirm) return false;
        if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) return false;
        if (consent && !consent.checked) {
            if (consentError) consentError.style.display = 'block';
            return false;
        }
        if (consentError) consentError.style.display = 'none';
        return true;
    }

    // ─── Core auth actions ────────────────────────────────────────────────────
    function login(form) {
        setStatus(form, '');
        setBusy(form, true);
        var data = formToObject(form);
        var remember = !!(form.querySelector('input[name="remember"]') || {}).checked;

        return getClient().then(function (client) {
            return client.auth.signInWithPassword({
                email: String(data.email || '').trim(),
                password: String(data.password || '')
            });
        }).then(function (result) {
            if (result.error) throw result.error;
            if (remember && result.data && result.data.user) {
                try { localStorage.setItem('altivor_remembered_user', JSON.stringify({ email: result.data.user.email })); } catch (_) {}
            } else {
                try { localStorage.removeItem('altivor_remembered_user'); } catch (_) {}
            }
            updateAuthUi(result.data.user);
            clearPasswords(form);
            form.reset();
            closeModalForForm(form);
        }).catch(function (err) {
            clearPasswords(form);
            var msg = (err && err.message) || 'Login failed.';
            if (/email not confirmed/i.test(msg)) {
                msg = 'Please verify your email address before signing in. Check your inbox for the confirmation link.';
            } else if (/invalid login credentials/i.test(msg)) {
                msg = 'Invalid email or password.';
            }
            setStatus(form, msg);
        }).then(function () {
            setBusy(form, false);
        });
    }

    function register(form) {
        setStatus(form, '');
        if (!validateRegister(form)) return Promise.resolve();
        setBusy(form, true);
        var data = formToObject(form);

        return getClient().then(function (client) {
            return client.auth.signUp({
                email: String(data.email || '').trim(),
                password: String(data.password || ''),
                options: {
                    emailRedirectTo: window.location.origin + '/verify-email.html?status=success',
                    data: {
                        first_name: data.firstName || '',
                        last_name: data.lastName || '',
                        username: data.username || '',
                        address: data.address || '',
                        country: data.country || ''
                    }
                }
            });
        }).then(function (result) {
            if (result.error) throw result.error;
            clearPasswords(form);
            form.reset();
            closeModalForForm(form);
            // Supabase may or may not auto-confirm; always redirect to verify page.
            window.location.href = '/verify-email.html';
        }).catch(function (err) {
            clearPasswords(form);
            var msg = (err && err.message) || 'Registration failed.';
            if (/already registered|already exists/i.test(msg)) {
                msg = 'An account with this email already exists.';
            }
            setStatus(form, msg);
        }).then(function () {
            setBusy(form, false);
        });
    }

    function logout() {
        return getClient().then(function (client) {
            return client.auth.signOut();
        }).catch(function () {}).then(function () {
            updateAuthUi(null);
        });
    }

    function refreshSession() {
        return getClient().then(function (client) {
            return client.auth.getSession();
        }).then(function (result) {
            var user = result && result.data && result.data.session ? result.data.session.user : null;
            updateAuthUi(user);
        }).catch(function () {
            updateAuthUi(null);
        });
    }

    // ─── Form interception (capture phase, same as old script.js) ─────────────
    function interceptSubmit(event) {
        var form = event.target;
        if (!form || !form.id) return;
        if (form.id === 'loginForm') {
            event.preventDefault();
            event.stopPropagation();
            login(form);
        } else if (form.id === 'registerForm') {
            event.preventDefault();
            event.stopPropagation();
            register(form);
        }
    }

    // Install global handlers
    window.handleLogin = function (event) {
        if (event) { event.preventDefault(); if (event.stopPropagation) event.stopPropagation(); }
        var form = event && event.target && event.target.closest ? event.target.closest('form') : document.querySelector('#loginForm');
        if (form) login(form);
        return false;
    };
    window.handleRegister = function (event) {
        if (event) { event.preventDefault(); if (event.stopPropagation) event.stopPropagation(); }
        var form = event && event.target && event.target.closest ? event.target.closest('form') : document.querySelector('#registerForm');
        if (form) register(form);
        return false;
    };

    window.altivorAuth = {
        getUser: function () { return currentUser; },
        refresh: refreshSession,
        logout: logout
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
        // Listen to auth changes (e.g. tab sync, token refresh)
        getClient().then(function (client) {
            client.auth.onAuthStateChange(function (_event, session) {
                updateAuthUi(session ? session.user : null);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
