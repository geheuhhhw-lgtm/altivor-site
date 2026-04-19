/* ═══════════════════════════════════════════════════════════════════════════
   ALTIVOR — Stripe Payment Links (central config)
   ─────────────────────────────────────────────────────────────────────────
   All Stripe checkout URLs in one place. To update a link, change the
   value here — every connected button across the site will pick it up.

   PRODUCT → STRIPE LINK MAPPING
   ─────────────────────────────────────────────────────────────────────────
   prepare           →  PREPARE qualification gate (29 €)
   accessories       →  Accessories Suite / subscription (79 € /mo)
   frameworkPack     →  Framework Pack (59 €)
   us100Framework    →  US100 Challenge — full access (129 €)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    /* ── 1. Stripe Payment Links ─────────────────────────────────────────── */
    var STRIPE_LINKS = {
        prepare:        'https://buy.stripe.com/8x25kEf2F93M3O50bOdby01',
        accessories:    'https://buy.stripe.com/aFa6oI5s5a7QdoFgaMdby03',
        frameworkPack:  'https://buy.stripe.com/4gM9AUdYBbbUfwN4s4dby02',
        us100Framework: 'https://buy.stripe.com/00wdRabQt93M5Wde2Edby00'
    };

    /* ── 2. Analytics event names ────────────────────────────────────────── */
    var ANALYTICS_EVENTS = {
        prepare:        'prepare_checkout_click',
        accessories:    'accessories_checkout_click',
        frameworkPack:  'framework_pack_checkout_click',
        us100Framework: 'us100_framework_checkout_click'
    };

    /* ── 3. Helpers ──────────────────────────────────────────────────────── */
    function trackCheckout(product) {
        var eventName = ANALYTICS_EVENTS[product] || product + '_checkout_click';
        /* Google Analytics (gtag) */
        if (typeof gtag === 'function') {
            gtag('event', eventName, {
                event_category: 'ecommerce',
                event_label: product
            });
        }
        /* dataLayer (GTM) */
        if (typeof dataLayer !== 'undefined' && Array.isArray(dataLayer)) {
            dataLayer.push({ event: eventName, product: product });
        }
        console.info('[ALTIVOR Stripe]', eventName);
    }

    function redirectToCheckout(product) {
        var url = STRIPE_LINKS[product];
        if (!url) {
            console.warn('[ALTIVOR Stripe] No link configured for product:', product);
            return false;
        }
        trackCheckout(product);
        window.location.href = url;
        return true;
    }

    /* ── 4. Auto-bind: data-stripe="<product>" ───────────────────────────
       Any element with  data-stripe="prepare"  (or accessories, frameworkPack,
       us100Framework) will be wired automatically.                           */
    function bindStripeButtons() {
        document.querySelectorAll('[data-stripe]').forEach(function (el) {
            /* skip if already bound */
            if (el.dataset.stripeBound) return;
            el.dataset.stripeBound = '1';

            var product = el.dataset.stripe;
            var url = STRIPE_LINKS[product];

            /* Fallback: disable if no URL */
            if (!url) {
                el.classList.add('stripe-disabled');
                el.setAttribute('aria-disabled', 'true');
                el.title = 'Payment link not yet available';
                el.addEventListener('click', function (e) { e.preventDefault(); });
                return;
            }

            /* Set href for <a> tags so they remain accessible links */
            if (el.tagName === 'A') {
                el.href = url;
            }

            /* Add analytics data attributes */
            el.dataset.stripeProduct = product;
            el.dataset.stripeEvent = ANALYTICS_EVENTS[product] || '';

            /* Click handler — same-tab redirect with tracking */
            el.addEventListener('click', function (e) {
                e.preventDefault();
                redirectToCheckout(product);
            });
        });
    }

    /* ── 5. Expose API for programmatic use ──────────────────────────────── */
    window.AltivorStripe = {
        links: STRIPE_LINKS,
        events: ANALYTICS_EVENTS,
        redirect: redirectToCheckout,
        track: trackCheckout,
        rebind: bindStripeButtons
    };

    /* ── 6. Init on DOMContentLoaded (or immediately if already loaded) ── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindStripeButtons);
    } else {
        bindStripeButtons();
    }
})();
