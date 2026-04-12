/* ═══════════════════════════════════════════════════════════════════════════
   AUTH MODALS — Shared login/register modal logic
   Injects modal HTML if not present, handles open/close/switch/click-outside
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Modal Functions ──────────────────────────────────────────────────────
  window.openModal = function (id) {
    document.querySelectorAll('.auth-overlay.active').forEach(function (m) {
      if (m.id !== id) m.classList.remove('active');
    });
    var el = document.getElementById(id);
    if (el) {
      el.classList.add('active');
      document.body.classList.add('modal-open');
    }
  };

  window.closeModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('active');
    if (!document.querySelector('.auth-overlay.active')) {
      document.body.classList.remove('modal-open');
    }
  };

  window.switchModal = function (from, to) {
    closeModal(from);
    setTimeout(function () { openModal(to); }, 220);
  };

  window.togglePw = function (inputId, btn) {
    var input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.classList.toggle('active');
  };

  // ── Click-outside-to-close + Escape ─────────────────────────────────────
  function bindDismissHandlers() {
    document.querySelectorAll('.auth-overlay').forEach(function (overlay) {
      if (overlay.dataset.dismissBound) return;
      overlay.dataset.dismissBound = '1';
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.auth-overlay.active').forEach(function (m) {
        closeModal(m.id);
      });
    }
  });

  // ── Inject modal HTML if missing ────────────────────────────────────────
  function ensureModals() {
    if (document.getElementById('loginModal')) {
      bindDismissHandlers();
      return;
    }

    var logoHTML = '<img src="logo.png" alt="ALTIVOR INSTITUTE" class="brand-logo-img auth-logo-img" draggable="false" />';

    var eyeSVG =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
      '<circle cx="12" cy="12" r="3"/>' +
      '</svg>';

    var loginHTML =
      '<div class="auth-overlay" id="loginModal" role="dialog" aria-modal="true" aria-labelledby="loginTitle">' +
      '<div class="auth-modal">' +
      '<button class="auth-close" onclick="closeModal(\'loginModal\')" aria-label="Close">&#x2715;</button>' +
      '<div class="auth-logo">' + logoHTML + '</div>' +
      '<h2 class="auth-title" id="loginTitle" data-i18n="login_title">Welcome Back</h2>' +
      '<p class="auth-sub" data-i18n="login_sub">Sign in to your ALTIVOR account</p>' +
      '<form class="auth-form" id="loginForm" onsubmit="handleLogin(event)">' +
      '<div class="auth-field">' +
      '<label for="loginEmail" data-i18n="login_email">Email Address</label>' +
      '<input type="email" id="loginEmail" name="email" placeholder="your@email.com" required autocomplete="email"/>' +
      '</div>' +
      '<div class="auth-field">' +
      '<label for="loginPassword" data-i18n="login_pw">Password</label>' +
      '<div class="auth-password-wrap">' +
      '<input type="password" id="loginPassword" name="password" placeholder="Enter your password" required autocomplete="current-password"/>' +
      '<button type="button" class="auth-eye" onclick="togglePw(\'loginPassword\', this)" aria-label="Toggle password visibility">' + eyeSVG + '</button>' +
      '</div>' +
      '</div>' +
      '<div class="auth-forgot"><a href="#" data-i18n="login_forgot">Forgot password?</a></div>' +
      '<button type="submit" class="btn btn-primary auth-submit" data-i18n="login_btn">Sign In</button>' +
      '</form>' +
      '<p class="auth-switch">' +
      '<span data-i18n="login_switch">Don\'t have an account?</span> ' +
      '<a href="#" onclick="switchModal(\'loginModal\',\'registerModal\');return false;" data-i18n="login_switch_link">Register</a>' +
      '</p>' +
      '</div>' +
      '</div>';

    var registerHTML =
      '<div class="auth-overlay" id="registerModal" role="dialog" aria-modal="true" aria-labelledby="registerTitle">' +
      '<div class="auth-modal auth-modal--wide">' +
      '<button class="auth-close" onclick="closeModal(\'registerModal\')" aria-label="Close">&#x2715;</button>' +
      '<div class="auth-logo">' + logoHTML + '</div>' +
      '<h2 class="auth-title" id="registerTitle" data-i18n="reg_title">Create Account</h2>' +
      '<p class="auth-sub" data-i18n="reg_sub">Join ALTIVOR INSTITUTE</p>' +
      '<form class="auth-form" id="registerForm" onsubmit="handleRegister(event)">' +
      '<div class="auth-row">' +
      '<div class="auth-field"><label for="regFirstName" data-i18n="reg_first">First Name</label><input type="text" id="regFirstName" name="firstName" placeholder="John" required autocomplete="given-name"/></div>' +
      '<div class="auth-field"><label for="regLastName" data-i18n="reg_last">Last Name</label><input type="text" id="regLastName" name="lastName" placeholder="Doe" required autocomplete="family-name"/></div>' +
      '</div>' +
      '<div class="auth-field"><label for="regUsername" data-i18n="reg_username">Username</label><input type="text" id="regUsername" name="username" placeholder="johndoe_trader" required autocomplete="username"/></div>' +
      '<div class="auth-field"><label for="regEmail" data-i18n="reg_email">Email Address</label><input type="email" id="regEmail" name="email" placeholder="your@email.com" required autocomplete="email"/></div>' +
      '<div class="auth-field"><label for="regAddress" data-i18n="reg_address">Address</label><input type="text" id="regAddress" name="address" placeholder="123 Street, City, Country" required autocomplete="street-address"/></div>' +
      '<div class="auth-row">' +
      '<div class="auth-field"><label for="regPassword" data-i18n="reg_pw">Password</label>' +
      '<div class="auth-password-wrap"><input type="password" id="regPassword" name="password" placeholder="Create a password" required autocomplete="new-password"/>' +
      '<button type="button" class="auth-eye" onclick="togglePw(\'regPassword\', this)" aria-label="Toggle password visibility">' + eyeSVG + '</button></div></div>' +
      '<div class="auth-field"><label for="regPasswordConfirm" data-i18n="reg_pw2">Confirm Password</label>' +
      '<div class="auth-password-wrap"><input type="password" id="regPasswordConfirm" name="passwordConfirm" placeholder="Repeat password" required autocomplete="new-password"/>' +
      '<button type="button" class="auth-eye" onclick="togglePw(\'regPasswordConfirm\', this)" aria-label="Toggle password visibility">' + eyeSVG + '</button></div></div>' +
      '</div>' +
      '<div class="auth-pw-error" id="regPwError" data-i18n="pw_error">Passwords do not match.</div>' +
      '<div class="auth-consent"><label class="auth-consent-label">' +
      '<input type="checkbox" id="regConsent" name="consent" required/>' +
      '<span class="auth-consent-box" aria-hidden="true"></span>' +
      '<span class="auth-consent-text" data-i18n="reg_consent">I acknowledge that trading involves risk and that the services provided are educational in nature. I agree to the <a href="terms-of-service.html" target="_blank">Terms &amp; Conditions</a>, <a href="privacy-policy.html" target="_blank">Privacy Policy</a>, <a href="risk-disclosure.html" target="_blank">Risk Disclosure</a>, <a href="refund-policy.html" target="_blank">Refund Policy</a> and <a href="challenge-rules.html" target="_blank">Challenge Rules</a>.</span>' +
      '</label>' +
      '<div class="auth-consent-error" id="regConsentError" data-i18n="reg_consent_error">You must accept the terms to create an account.</div>' +
      '</div>' +
      '<button type="submit" class="btn btn-primary auth-submit" data-i18n="reg_btn">Create Account</button>' +
      '</form>' +
      '<p class="auth-switch">' +
      '<span data-i18n="reg_switch">Already have an account?</span> ' +
      '<a href="#" onclick="switchModal(\'registerModal\',\'loginModal\');return false;" data-i18n="reg_switch_link">Sign In</a>' +
      '</p>' +
      '</div>' +
      '</div>';

    document.body.insertAdjacentHTML('beforeend', loginHTML + registerHTML);
    bindDismissHandlers();

    // Re-run i18n on injected modals if available
    if (typeof window.applyI18n === 'function') {
      window.applyI18n();
    }
  }

  // Run on DOMContentLoaded or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureModals);
  } else {
    ensureModals();
  }
})();
