/**
 * ALTIVOR INSTITUTE — Footer Widgets Injector
 * Injects Cookie Consent Banner/Preferences and Documents Modal
 * into any page that includes this script.
 * This avoids duplicating large HTML blocks across every page.
 */
(function () {
  'use strict';

  // Skip if already injected (e.g. on index.html which has them inline)
  if (document.getElementById('cookieBanner') && document.getElementById('docsModal')) return;

  // ═══ COOKIE CONSENT BANNER + PREFERENCES ════════════════════════════
  if (!document.getElementById('cookieBanner')) {
    var cookieHTML =
      '<!-- COOKIE CONSENT BANNER -->' +
      '<div class="cookie-banner" id="cookieBanner" role="dialog" aria-modal="true" aria-labelledby="cookieBannerTitle" aria-hidden="true">' +
        '<div class="cookie-banner-inner">' +
          '<div class="cookie-banner-text">' +
            '<p class="cookie-banner-title" id="cookieBannerTitle" data-i18n="cookie_title">We use cookies</p>' +
            '<p class="cookie-banner-desc" data-i18n="cookie_desc">We use cookies and similar technologies to ensure the security of our platform, improve functionality and analyze usage. You can choose which cookies you allow. <a href="cookies-policy.html" class="cookie-banner-link">Learn more in our Cookies Policy</a></p>' +
          '</div>' +
          '<div class="cookie-banner-actions">' +
            '<button class="btn btn-primary cookie-btn" id="cookieAcceptAll" data-i18n="cookie_accept">Accept all</button>' +
            '<button class="btn btn-ghost cookie-btn" id="cookieRejectNon" data-i18n="cookie_reject">Reject non-essential</button>' +
            '<button class="btn btn-ghost cookie-btn cookie-btn--prefs" id="cookieManagePrefs" data-i18n="cookie_manage">Manage preferences</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<!-- COOKIE PREFERENCES PANEL -->' +
      '<div class="cookie-prefs-overlay" id="cookiePrefsOverlay" role="dialog" aria-modal="true" aria-labelledby="cookiePrefsTitle" aria-hidden="true">' +
        '<div class="cookie-prefs-modal">' +
          '<button class="auth-close" id="cookiePrefsClose" aria-label="Close">&#x2715;</button>' +
          '<h2 class="cookie-prefs-title" id="cookiePrefsTitle" data-i18n="cookie_prefs_title">Cookie Preferences</h2>' +
          '<p class="cookie-prefs-sub" data-i18n="cookie_prefs_sub">Control which cookies ALTIVOR INSTITUTE may use. Necessary cookies cannot be disabled as they are required for platform security and core functionality. <a href="cookies-policy.html" style="color:var(--txt-secondary);text-underline-offset:2px;text-decoration:underline;">Cookies Policy</a> &middot; <a href="privacy-policy.html" style="color:var(--txt-secondary);text-underline-offset:2px;text-decoration:underline;">Privacy Policy</a></p>' +
          '<div class="cookie-pref-item">' +
            '<div class="cookie-pref-info">' +
              '<span class="cookie-pref-name" data-i18n="cookie_necessary">Necessary</span>' +
              '<span class="cookie-pref-desc" data-i18n="cookie_necessary_desc">Required for login sessions, security tokens and core platform functionality. Cannot be disabled.</span>' +
            '</div>' +
            '<div class="cookie-toggle cookie-toggle--locked" aria-label="Always active" data-i18n="cookie_always_on">Always on</div>' +
          '</div>' +
          '<div class="cookie-pref-item">' +
            '<div class="cookie-pref-info">' +
              '<span class="cookie-pref-name" data-i18n="cookie_functional">Functional</span>' +
              '<span class="cookie-pref-desc" data-i18n="cookie_functional_desc">Remembers your language, theme preference and display settings.</span>' +
            '</div>' +
            '<label class="cookie-toggle-wrap"><input type="checkbox" id="cookieFunctional" class="cookie-toggle-input" /><span class="cookie-toggle-slider"></span></label>' +
          '</div>' +
          '<div class="cookie-pref-item">' +
            '<div class="cookie-pref-info">' +
              '<span class="cookie-pref-name" data-i18n="cookie_analytics">Analytics</span>' +
              '<span class="cookie-pref-desc" data-i18n="cookie_analytics_desc">Helps us understand how participants use the platform. Data is aggregated and anonymised.</span>' +
            '</div>' +
            '<label class="cookie-toggle-wrap"><input type="checkbox" id="cookieAnalytics" class="cookie-toggle-input" /><span class="cookie-toggle-slider"></span></label>' +
          '</div>' +
          '<div class="cookie-pref-item">' +
            '<div class="cookie-pref-info">' +
              '<span class="cookie-pref-name" data-i18n="cookie_marketing">Marketing</span>' +
              '<span class="cookie-pref-desc" data-i18n="cookie_marketing_desc">Used to measure the effectiveness of communications and deliver relevant content.</span>' +
            '</div>' +
            '<label class="cookie-toggle-wrap"><input type="checkbox" id="cookieMarketing" class="cookie-toggle-input" /><span class="cookie-toggle-slider"></span></label>' +
          '</div>' +
          '<div class="cookie-prefs-actions">' +
            '<button class="btn btn-primary" id="cookieSavePrefs" data-i18n="cookie_save">Save preferences</button>' +
            '<button class="btn btn-ghost" id="cookieAcceptAllPrefs" data-i18n="cookie_accept_all">Accept all</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    var cookieContainer = document.createElement('div');
    cookieContainer.innerHTML = cookieHTML;
    while (cookieContainer.firstChild) {
      document.body.appendChild(cookieContainer.firstChild);
    }

    // Load cookie-consent.js dynamically
    var cookieScript = document.createElement('script');
    cookieScript.src = 'cookie-consent.js';
    document.body.appendChild(cookieScript);
  }

  // ═══ DOCUMENTS MODAL ════════════════════════════════════════════════
  if (!document.getElementById('docsModal')) {
    var docsHTML =
      '<div class="docs-overlay" id="docsModal" role="dialog" aria-modal="true" aria-labelledby="docsModalTitle">' +
        '<div class="docs-modal">' +
          '<div class="docs-modal-header">' +
            '<div class="docs-modal-title">' +
              '<span class="docs-modal-label">ALTIVOR INSTITUTE</span>' +
              '<h2 class="docs-modal-heading" id="docsModalTitle" data-i18n="doc_heading">Documents</h2>' +
            '</div>' +
            '<button class="docs-modal-close" onclick="closeDocsModal()" aria-label="Close">&#x2715;</button>' +
          '</div>' +
          '<div class="docs-modal-body">' +
            '<div class="docs-section-label" data-i18n="doc_legal_section">Legal Documents</div>' +
            buildDocItem('terms-of-service.html', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>', 'doc_terms_name', 'Terms &amp; Conditions', 'doc_terms_desc', 'Platform usage terms, user obligations and service agreement') +
            buildDocItem('privacy-policy.html', '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', 'doc_privacy_name', 'Privacy Policy', 'doc_privacy_desc', 'GDPR-compliant data processing and privacy practices') +
            buildDocItem('risk-disclosure.html', '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 'doc_risk_name', 'Risk Disclosure', 'doc_risk_desc', 'Financial risk warnings and regulatory disclaimers') +
            buildDocItem('investment-disclaimer.html', '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 'doc_invest_name', 'Investment &amp; Educational Disclaimer', 'doc_invest_desc', 'No investment advice &mdash; educational services only') +
            buildDocItem('earnings-disclaimer.html', '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', 'doc_earnings_name', 'Earnings &amp; Performance Disclaimer', 'doc_earnings_desc', 'No guarantee of financial results or trading performance') +
            buildDocItem('acceptable-use-policy.html', '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 'doc_aup_name', 'Acceptable Use Policy', 'doc_aup_desc', 'Permitted conduct, prohibited activities and enforcement') +
            buildDocItem('legal-notice.html', '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>', 'doc_legal_name', 'Legal Notice &amp; Imprint', 'doc_legal_desc', 'Operator identification, regulatory status and statutory information') +
            buildDocItem('complaints-policy.html', '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', 'doc_complaints_name', 'Complaints &amp; Support Policy', 'doc_complaints_desc', 'Support scope, complaint procedure and resolution framework') +
            buildDocItem('anti-fraud-policy.html', '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 'doc_antifraud_name', 'Anti-Fraud Policy', 'doc_antifraud_desc', 'Fraud prevention, prohibited conduct and enforcement framework') +
            buildDocItem('security-policy.html', '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 'doc_security_name', 'Security Policy', 'doc_security_desc', 'Platform security measures, incident response and vulnerability disclosure') +
            buildDocItem('trust-and-safety.html', '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>', 'doc_trust_name', 'Trust &amp; Safety', 'doc_trust_desc', 'Platform safety framework, values and user protection principles') +
            buildDocItem('refund-policy.html', '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>', 'doc_refund_name', 'Refund Policy', 'doc_refund_desc', 'Digital services refund terms and withdrawal rights') +
            buildDocItem('cookies-policy.html', '<circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/>', 'doc_cookies_name', 'Cookies Policy', 'doc_cookies_desc', 'Cookie usage, consent management and third-party tracking') +
            '<div class="docs-section-label" data-i18n="doc_fw_section">Framework Documents</div>' +
            buildDocItem('us100-framework.html', '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>', 'doc_us100_name', 'US100 Framework', 'doc_us100_desc', 'Nasdaq 100 CFD &mdash; operational execution framework') +
            buildLockedItem('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 'doc_us30_name', 'US30 Framework', 'doc_us30_desc', 'Dow Jones 30 &mdash; in development') +
            '<div class="docs-section-label" data-i18n="doc_challenge_section">Challenge Documents</div>' +
            buildDocItem('challenge-rules.html', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>', 'doc_challenge_name', 'Challenge Rules &amp; Programme Terms', 'doc_challenge_desc', 'Evaluation criteria, prohibited conduct and programme structure') +
            buildLockedItem('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>', 'doc_casestudy_name', 'Case Study Library', 'doc_casestudy_desc', 'Full Access required &mdash; anonymised cycle reviews') +
          '</div>' +
        '</div>' +
      '</div>';

    var docsContainer = document.createElement('div');
    docsContainer.innerHTML = docsHTML;
    while (docsContainer.firstChild) {
      document.body.appendChild(docsContainer.firstChild);
    }
  }

  function buildDocItem(href, svgPaths, nameKey, nameText, descKey, descText) {
    return '<a href="' + href + '" class="docs-item">' +
      '<div class="docs-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + svgPaths + '</svg></div>' +
      '<div class="docs-item-text"><span class="docs-item-name" data-i18n="' + nameKey + '">' + nameText + '</span><span class="docs-item-desc" data-i18n="' + descKey + '">' + descText + '</span></div>' +
      '<span class="docs-item-badge docs-badge-free" data-i18n="doc_badge_public">Public</span>' +
      '<svg class="docs-item-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>' +
    '</a>';
  }

  function buildLockedItem(svgPaths, nameKey, nameText, descKey, descText) {
    return '<div class="docs-item" style="cursor:not-allowed;opacity:0.45;">' +
      '<div class="docs-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + svgPaths + '</svg></div>' +
      '<div class="docs-item-text"><span class="docs-item-name" data-i18n="' + nameKey + '">' + nameText + '</span><span class="docs-item-desc" data-i18n="' + descKey + '">' + descText + '</span></div>' +
      '<span class="docs-item-badge docs-badge-locked" data-i18n="doc_badge_locked">Locked</span>' +
    '</div>';
  }

})();
