/* ═══════════════════════════════════════════════════════════════════════
   ALTIVOR INSTITUTE — cookie-consent.js
   EU-compliant cookie consent manager (2026 standard)
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';

(function (global) {

    var STORAGE_KEY = 'altivor-cookie-consent';
    var VERSION     = '1';

    /* ─── Helpers ─────────────────────────────────────────────────────── */

    function getConsent() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (obj.version !== VERSION) return null;
            return obj;
        } catch (e) { return null; }
    }

    function saveConsent(prefs) {
        var obj = {
            version:     VERSION,
            timestamp:   new Date().toISOString(),
            necessary:   true,
            functional:  !!prefs.functional,
            analytics:   !!prefs.analytics,
            marketing:   !!prefs.marketing
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
        applyConsent(obj);
        return obj;
    }

    /* ─── Apply / block scripts based on consent ─────────────────────── */

    function applyConsent(prefs) {
        /* Analytics — block/unblock Google Analytics, etc.
           When rejected: disable GA cookies and tracking. */
        if (!prefs.analytics) {
            /* Disable GA if loaded */
            if (typeof window.gtag === 'function') {
                window['ga-disable-GA_MEASUREMENT_ID'] = true;
            }
            /* Remove analytics cookies */
            deleteCookiesByPrefix(['_ga', '_gid', '_gat', '__utma', '__utmb', '__utmc', '__utmz']);
        }

        /* Marketing — block/unblock ad pixels */
        if (!prefs.marketing) {
            deleteCookiesByPrefix(['_fbp', '_fbc', 'fr', 'ads_']);
        }

        /* Functional — theme/lang are handled in localStorage,
           not cookies, so no extra blocking needed. */

        /* Dispatch event so other scripts can react */
        global.dispatchEvent(new CustomEvent('altCookieConsent', { detail: prefs }));
    }

    function deleteCookiesByPrefix(prefixes) {
        var cookies = document.cookie.split(';');
        cookies.forEach(function (cookie) {
            var name = cookie.split('=')[0].trim();
            prefixes.forEach(function (prefix) {
                if (name.indexOf(prefix) === 0) {
                    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + location.hostname;
                    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
                }
            });
        });
    }

    /* ─── Banner DOM refs ─────────────────────────────────────────────── */

    var banner        = document.getElementById('cookieBanner');
    var prefsOverlay  = document.getElementById('cookiePrefsOverlay');
    var prefsClose    = document.getElementById('cookiePrefsClose');
    var acceptAllBtn  = document.getElementById('cookieAcceptAll');
    var rejectNonBtn  = document.getElementById('cookieRejectNon');
    var manageBtn     = document.getElementById('cookieManagePrefs');
    var savePrefsBtn  = document.getElementById('cookieSavePrefs');
    var acceptAllPrefsBtn = document.getElementById('cookieAcceptAllPrefs');

    var toggleFunctional = document.getElementById('cookieFunctional');
    var toggleAnalytics  = document.getElementById('cookieAnalytics');
    var toggleMarketing  = document.getElementById('cookieMarketing');

    /* ─── Show / hide banner ──────────────────────────────────────────── */

    function showBanner() {
        if (!banner) return;
        banner.setAttribute('aria-hidden', 'false');
        banner.classList.add('visible');
    }

    function hideBanner() {
        if (!banner) return;
        banner.classList.remove('visible');
        banner.setAttribute('aria-hidden', 'true');
    }

    /* ─── Prefs panel ─────────────────────────────────────────────────── */

    function openPrefs() {
        if (!prefsOverlay) return;
        /* Pre-fill toggles from saved consent if available */
        var saved = getConsent();
        if (toggleFunctional) toggleFunctional.checked = saved ? saved.functional : false;
        if (toggleAnalytics)  toggleAnalytics.checked  = saved ? saved.analytics  : false;
        if (toggleMarketing)  toggleMarketing.checked  = saved ? saved.marketing  : false;

        prefsOverlay.setAttribute('aria-hidden', 'false');
        prefsOverlay.classList.add('visible');
        hideBanner();
    }

    function closePrefs() {
        if (!prefsOverlay) return;
        prefsOverlay.classList.remove('visible');
        prefsOverlay.setAttribute('aria-hidden', 'true');
    }

    /* ─── Actions ─────────────────────────────────────────────────────── */

    function acceptAll() {
        saveConsent({ functional: true, analytics: true, marketing: true });
        hideBanner();
        closePrefs();
    }

    function rejectNonEssential() {
        saveConsent({ functional: false, analytics: false, marketing: false });
        hideBanner();
        closePrefs();
    }

    function saveCustomPrefs() {
        saveConsent({
            functional: toggleFunctional ? toggleFunctional.checked : false,
            analytics:  toggleAnalytics  ? toggleAnalytics.checked  : false,
            marketing:  toggleMarketing  ? toggleMarketing.checked  : false
        });
        closePrefs();
    }

    /* ─── Bind events ─────────────────────────────────────────────────── */

    if (acceptAllBtn)      acceptAllBtn.addEventListener('click', acceptAll);
    if (rejectNonBtn)      rejectNonBtn.addEventListener('click', rejectNonEssential);
    if (manageBtn)         manageBtn.addEventListener('click', openPrefs);
    if (savePrefsBtn)      savePrefsBtn.addEventListener('click', saveCustomPrefs);
    if (acceptAllPrefsBtn) acceptAllPrefsBtn.addEventListener('click', acceptAll);
    if (prefsClose)        prefsClose.addEventListener('click', closePrefs);

    /* Close prefs on backdrop click */
    if (prefsOverlay) {
        prefsOverlay.addEventListener('click', function (e) {
            if (e.target === prefsOverlay) closePrefs();
        });
    }

    /* Close on Escape */
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closePrefs();
            hideBanner();
        }
    });

    /* ─── Init: show banner only on index.html if no saved consent ───── */

    function isMainPage() {
        var path = location.pathname.replace(/\/+$/, '');
        return path === '' || path === '/' || path.endsWith('/index.html') || path === 'index.html';
    }

    var saved = getConsent();
    if (saved) {
        /* Consent already given — re-apply silently */
        applyConsent(saved);
    } else if (isMainPage()) {
        /* First visit on main page — show banner after short delay */
        setTimeout(showBanner, 800);
    }

    /* Reset consent when a new account is registered so banner shows again */
    document.addEventListener('altivor:cookieConsentReset', function () {
        localStorage.removeItem(STORAGE_KEY);
    });

    /* ─── Public API ──────────────────────────────────────────────────── */

    global.altCookies = {
        openPrefs:    openPrefs,
        acceptAll:    acceptAll,
        rejectAll:    rejectNonEssential,
        getConsent:   getConsent
    };

})(window);
