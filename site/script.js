/* ═══════════════════════════════════════════════════════════════════════
   ALTIVOR INSTITUTE — script.js
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';

(function () {

/* ─── ANNOUNCEMENT / PROMO BAR (auto-inject on every page) ────────────── */

(function () {
    var DISMISSED_KEY = 'altivor_promo_dismissed';
    var navBar = document.getElementById('navbar');

    // If already dismissed this session, ensure nav sits at top
    if (sessionStorage.getItem(DISMISSED_KEY) === '1') {
        var existing = document.getElementById('promoBar') || document.getElementById('announceBar');
        if (existing) existing.style.display = 'none';
        if (navBar) { navBar.classList.add('no-banner'); navBar.style.top = '0'; }
        return;
    }

    // Build or reuse the promo bar
    var bar = document.getElementById('promoBar');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'promo-bar';
        bar.id = 'promoBar';
        bar.innerHTML =
            '<a href="us100-framework.html" class="promo-bar-inner">' +
                '<span class="promo-bar-badge">New</span>' +
                '<span class="promo-bar-text">US100 Framework &mdash; Structural Execution System</span>' +
                '<span class="promo-bar-cta">Start now <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg></span>' +
            '</a>' +
            '<button class="announce-close" id="promoBarClose" aria-label="Dismiss">&#x2715;</button>';
        document.body.insertBefore(bar, document.body.firstChild);
        // Push navbar down
        if (navBar) { navBar.classList.remove('no-banner'); navBar.style.top = ''; }
    }

    // Ensure close button exists even if bar was in HTML
    var closeBtn = bar.querySelector('.announce-close') || document.getElementById('promoBarClose');
    if (!closeBtn) {
        closeBtn = document.createElement('button');
        closeBtn.className = 'announce-close';
        closeBtn.id = 'promoBarClose';
        closeBtn.setAttribute('aria-label', 'Dismiss');
        closeBtn.innerHTML = '&#x2715;';
        bar.appendChild(closeBtn);
    }

    closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        bar.classList.add('dismissed');
        setTimeout(function () { bar.style.display = 'none'; }, 450);
        if (navBar) { navBar.classList.add('no-banner'); navBar.style.top = '0'; }
        sessionStorage.setItem(DISMISSED_KEY, '1');
    });
})();

/* ─── THEME SWITCHER ──────────────────────────────────────────────────── */

const sharedThemeButtons = document.querySelectorAll('.theme-btn');
const sharedHtmlEl = document.documentElement;
const SHARED_THEME_KEY = 'altivor-theme';

function applySharedTheme(theme) {
    sharedHtmlEl.setAttribute('data-theme', theme);
    localStorage.setItem(SHARED_THEME_KEY, theme);

    sharedThemeButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
}

// Restore saved theme on load
const sharedSavedTheme = localStorage.getItem(SHARED_THEME_KEY) || 'dark';
applySharedTheme(sharedSavedTheme);

sharedThemeButtons.forEach(btn => {
    btn.addEventListener('click', () => applySharedTheme(btn.dataset.theme));
});

/* ─── NAVIGATION — scroll shadow & scroll-spy ─────────────────────────── */

const sharedNavbar = document.getElementById('navbar');

window.addEventListener('scroll', () => {
    if (!sharedNavbar) return;
    if (window.scrollY > 20) {
        sharedNavbar.style.borderBottomColor = 'var(--border-default)';
    } else {
        sharedNavbar.style.borderBottomColor = 'var(--border-subtle)';
    }
}, { passive: true });

/* ─── MOBILE MENU ─────────────────────────────────────────────────────── */

const sharedHamburger = document.getElementById('hamburger');
const sharedMobileMenu = document.getElementById('mobileMenu');

if (sharedHamburger && sharedMobileMenu) {
    sharedHamburger.addEventListener('click', () => {
        const isOpen = sharedHamburger.classList.toggle('open');
        sharedMobileMenu.classList.toggle('open', isOpen);
        sharedHamburger.setAttribute('aria-expanded', isOpen.toString());
        sharedMobileMenu.setAttribute('aria-hidden', (!isOpen).toString());
    });

    // Close on nav link click
    sharedMobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            sharedHamburger.classList.remove('open');
            sharedMobileMenu.classList.remove('open');
            sharedHamburger.setAttribute('aria-expanded', 'false');
            sharedMobileMenu.setAttribute('aria-hidden', 'true');
        });
    });
}

/* ─── SCROLL REVEAL ───────────────────────────────────────────────────── */

const revealEls = document.querySelectorAll('[data-reveal]');

const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
            // Stagger children within the same reveal container
            const delay = entry.target.dataset.revealDelay || 0;
            setTimeout(() => {
                entry.target.classList.add('revealed');
            }, Number(delay));
            observer.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
});

revealEls.forEach(el => observer.observe(el));

/* ─── DASHBOARD ANIMATIONS ────────────────────────────────────────────── */

// Animate progress bar fill when dashboard enters view
const progressFill = document.querySelector('.dash-progress-fill');

const dashObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            // Small delay for visual drama
            setTimeout(() => {
                progressFill.style.width = '62%';
            }, 600);
            dashObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.3 });

if (progressFill) {
    progressFill.style.width = '0%';
    dashObserver.observe(progressFill.closest('.dashboard-card') || progressFill);
}

// Animate trade counter count-up
function animateCounter(el, from, to, duration = 1400) {
    const start = performance.now();
    const update = (time) => {
        const elapsed = time - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // cubic ease out
        el.textContent = Math.round(from + (to - from) * eased);
        if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
}

const tradeCounter = document.getElementById('tradeCounter');
const compliVal = document.getElementById('complianceVal');

if (tradeCounter) {
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(tradeCounter, 0, 45, 1200);
                if (compliVal) {
                    setTimeout(() => {
                        const smallEl = compliVal.querySelector('small');
                        let start2 = performance.now();
                        const update2 = (time) => {
                            const p = Math.min((time - start2) / 1000, 1);
                            const e = 1 - Math.pow(1 - p, 3);
                            const val = Math.round(0 + 91 * e);
                            compliVal.textContent = val;
                            if (smallEl) compliVal.appendChild(smallEl);
                            if (p < 1) requestAnimationFrame(update2);
                        };
                        requestAnimationFrame(update2);
                    }, 300);
                }
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.4 });
    counterObserver.observe(tradeCounter.closest('.dashboard-card') || tradeCounter);
}

/* ─── SMOOTH SCROLL for anchor links ─────────────────────────────────── */

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        const offset = 68; // nav height
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
    });
});

/* ─── SUBTLE PARALLAX on hero grid overlay ────────────────────────────── */

const heroGrid = document.querySelector('.hero-grid-overlay');

if (heroGrid && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        heroGrid.style.transform = `translateY(${scrolled * 0.15}px)`;
    }, { passive: true });
}

/* ─── CARD HOVER — subtle depth shift ────────────────────────────────── */

// Only enabled on non-touch devices
if (!window.matchMedia('(hover: none)').matches) {
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            card.style.transform = `translateY(-2px) rotateX(${-y * 2}deg) rotateY(${x * 2}deg)`;
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
        });
    });
}

/* ─── SCROLL INDICATOR fade-out (hero label) ──────────────────────────── */

const heroSection = document.getElementById('hero');
if (heroSection && !document.body.classList.contains('home-legacy')) {
    const heroInner = heroSection.querySelector('.hero-inner');
    const heroHeight = heroSection.offsetHeight;
    window.addEventListener('scroll', () => {
        const progress = Math.min(window.scrollY / (heroHeight * 0.5), 1);
        if (heroInner) heroInner.style.opacity = 1 - progress * 0.15;
    }, { passive: true });
}

/* ─── ACTIVE NAV LINK highlight via scroll-spy ───────────────────────── */

const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-links a');

const spyObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            navLinks.forEach(link => {
                link.classList.toggle(
                    'nav-active',
                    link.getAttribute('href') === `#${entry.target.id}`
                );
            });
        }
    });
}, {
    rootMargin: '-30% 0px -60% 0px',
    threshold: 0
});

sections.forEach(section => spyObserver.observe(section));

/* ─── NAV ACTIVE LINK STYLE (injected) ──────────────────────────────── */

const styleTag = document.createElement('style');
styleTag.textContent = `
  .nav-links a.nav-active {
    color: var(--txt-primary) !important;
    opacity: 1 !important;
  }
  /* Custom scrollbar */
  :root { scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
`;
document.head.appendChild(styleTag);

function createBrandLogoImage(logo) {
    const img = document.createElement('img');
    const originalClassNames = Array.from(logo.classList);
    const ariaLabel = logo.getAttribute('aria-label');
    const i18nAriaLabel = logo.getAttribute('data-i18n-aria-label');

    img.src = 'logo.png';
    img.alt = ariaLabel || 'ALTIVOR INSTITUTE';
    img.decoding = 'async';
    img.draggable = false;
    img.classList.add('brand-logo-img');

    // Detect context from class or parent
    if (originalClassNames.includes('nav-logo-svg') || logo.closest('.logo-link, .wordmark')) img.classList.add('nav-logo-img');
    if (originalClassNames.includes('footer-logo-svg') || logo.closest('.footer-brand')) img.classList.add('footer-logo-img');
    if (originalClassNames.includes('pnl-logo-svg') || logo.closest('.pnl-content')) img.classList.add('pnl-logo-img');
    if (originalClassNames.includes('auth-logo-svg') || logo.closest('.auth-logo')) img.classList.add('auth-logo-img');

    if (i18nAriaLabel) {
        img.setAttribute('data-i18n-aria-label', i18nAriaLabel);
    }

    if (ariaLabel) {
        img.setAttribute('aria-label', ariaLabel);
    }

    return img;
}

function renderBrandLogos() {
    document.querySelectorAll('svg[aria-label="ALTIVOR INSTITUTE"], svg[data-i18n-aria-label="brand_name_aria"]').forEach((logo) => {
        logo.replaceWith(createBrandLogoImage(logo));
    });

    document.querySelectorAll('img[src="altivor-logo.svg"], img[src$="/altivor-logo.svg"]').forEach((logo) => {
        const replacement = createBrandLogoImage(logo);
        replacement.className = logo.className;
        replacement.classList.add('brand-logo-img');

        if (logo.alt) {
            replacement.alt = logo.alt;
        }

        if (logo.getAttribute('data-i18n-aria-label')) {
            replacement.setAttribute('data-i18n-aria-label', logo.getAttribute('data-i18n-aria-label'));
        }

        if (logo.getAttribute('aria-label')) {
            replacement.setAttribute('aria-label', logo.getAttribute('aria-label'));
        }

        logo.replaceWith(replacement);
    });

    // Strip inline styles from all brand logos so CSS controls sizing
    document.querySelectorAll('.brand-logo-img').forEach(function (img) {
        img.removeAttribute('style');
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderBrandLogos);
} else {
    renderBrandLogos();
}

/* ─── NAV DROPDOWN PANELS (Frameworks + Accessories in nav-links) ────── */

(function () {
    function initNavDropdown(triggerId, panelId) {
        const trigger = document.getElementById(triggerId);
        const panel = document.getElementById(panelId);
        if (!trigger || !panel) return;

        // Guard against double-init
        if (trigger.dataset.dropInit === '1') return;
        trigger.dataset.dropInit = '1';

        // Teleport panel to <body> so no parent stacking context can clip it
        document.body.appendChild(panel);
        panel.style.position = 'fixed';
        panel.style.zIndex = '99999';

        function positionPanel() {
            const rect = trigger.getBoundingClientRect();
            const panelWidth = panel.offsetWidth || 280;
            // Default: center under trigger
            let left = rect.left + rect.width / 2 - panelWidth / 2;
            // If panel would overflow right edge, align to right edge of trigger instead
            if (left + panelWidth > window.innerWidth - 8) {
                left = rect.right - panelWidth;
            }
            // Never go off left edge
            if (left < 8) left = 8;
            panel.style.top = (rect.bottom + 10) + 'px';
            panel.style.left = left + 'px';
        }

        function openPanel() {
            // Close all other panels first
            document.querySelectorAll('.nav-dropdown-panel').forEach(p => {
                if (p !== panel && p.classList.contains('open')) {
                    p.classList.remove('open');
                    const t = document.getElementById(p.id.replace('Dropdown', 'DropBtn'));
                    if (t) t.setAttribute('aria-expanded', 'false');
                }
            });
            positionPanel();
            panel.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
        }

        function closePanel() {
            panel.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        }

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.contains('open') ? closePanel() : openPanel();
        });

        document.addEventListener('click', (e) => {
            if (!trigger.contains(e.target) && !panel.contains(e.target)) {
                closePanel();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panel.classList.contains('open')) {
                closePanel();
                trigger.focus();
            }
        });

        window.addEventListener('scroll', () => {
            if (panel.classList.contains('open')) positionPanel();
        }, { passive: true });

        window.addEventListener('resize', () => {
            if (panel.classList.contains('open')) positionPanel();
        }, { passive: true });
    }

    function initAllDropdowns() {
        initNavDropdown('frameworksDropBtn', 'frameworksDropdown');
        initNavDropdown('accessoriesDropBtn', 'accessoriesDropdown');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAllDropdowns);
    } else {
        initAllDropdowns();
    }
})();

/* ─── PLACEHOLDER Stripe buttons + PREPARE gating ────────────────────── */

// PREPARE button → always go to prepare.html
const prepareBtn = document.getElementById('stripePrepare');
if (prepareBtn) {
    prepareBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'prepare.html';
    });
}

// Framework Pack & Full Access → check PREPARE qualification first
['stripeFrameworkPack', 'stripeFullAccess'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const prepStatus = localStorage.getItem('altivor-prepare-status');
        if (prepStatus !== 'QUALIFIED') {
            // Not qualified — redirect to PREPARE
            window.location.href = 'prepare.html';
            return;
        }
        // Qualified — proceed to Stripe checkout (placeholder)
        console.info('[ALTIVOR] Stripe checkout placeholder triggered:', id);
        alert('Stripe integration pending. This button will redirect to secure checkout.');
    });
});

/* ─── SUPPORT CHAT MOCKUP — keyword-based bot ────────────────────────── */
(function () {
    const RESPONSES = [
        {
            keys: ['prepare', 'qualification', 'qualify', 'gate'],
            reply: 'PREPARE is a mandatory one-time qualification gate (29 €) required before any challenge. It consists of a 10-trade compliance evaluation across 6 protocol rules. Once passed, it unlocks all challenge products permanently.'
        },
        {
            keys: ['us100', 'challenge', 'framework', 'nasdaq', 'cycle', '45'],
            reply: 'The US100 Challenge (129 €) is our first active framework. It covers a 55-trade validation cycle on Nasdaq 100 CFD, with a fixed 0.25% risk per trade, minimum 1:2 R:R, and NY session-only execution. Passing unlocks Accessories at 59 € / mo for 12 months.'
        },
        {
            keys: ['accessories', 'tools', 'trading log', 'pnl', 'calendar', 'checklist', 'calculators', 'wiki'],
            reply: 'The Accessories suite includes: Trading Log, PnL Calendar, Economic Calendar, Trading Symbols, Execution Checklist, Trading Calculators, and Trading Wiki. Available as a standalone subscription at 79 € / mo, or at 59 € / mo for 12 months after passing any challenge.'
        },
        {
            keys: ['price', 'cost', 'pricing', 'fee', 'payment', 'euro', '€', 'pay'],
            reply: 'Pricing structure: PREPARE — 29 € (one-time). Framework Pack — 89 € (one-time). US100 Challenge — 129 € (one-time). Accessories — 79 € / mo standalone, or 59 € / mo for 12 months after a successful challenge pass. Payments are processed securely via Stripe.'
        },
        {
            keys: ['contact', 'email', 'support', 'help', 'reach', 'message', 'whatsapp'],
            reply: 'You can reach our support team at support@altivor.institute or via WhatsApp. We are available **Monday to Saturday** (Sunday off), respond in under 8 hours on average, and operate in 10 languages. No bots — real agents only.'
        },
        {
            keys: ['us30', 'dow jones', 'development', 'coming soon', 'next'],
            reply: 'The US30 framework (Dow Jones Industrial Average — CFD) is currently in formalization phase. Execution parameters and risk governance protocols are being developed. No confirmed release date yet.'
        },
        {
            keys: ['drawdown', 'risk', 'loss', 'position size', 'sizing'],
            reply: 'The US100 framework enforces a fixed 0.25% risk per trade. Position sizing is non-negotiable and must match the framework specification exactly. Risk governance is structural — not applied situationally.'
        },
        {
            keys: ['refund', 'cancel', 'subscription', 'renew'],
            reply: 'Challenge products are one-time payments with no expiry. Accessories subscriptions renew monthly and can be cancelled at any time — access ends at the close of the paid billing period. For refund queries, contact support@altivor.institute.'
        },
        {
            keys: ['broker', 'metatrader', 'mt5', 'tradingview', 'platform'],
            reply: 'The US100 framework requires MetaTrader 5 for execution and TradingView for structural analysis. ALTIVOR does not recommend or partner with any specific broker. Any MT5-compatible CFD broker offering US100 / NAS100 is compatible.'
        },
        {
            keys: ['signal', 'advice', 'recommendation', 'tip', 'funded'],
            reply: 'ALTIVOR INSTITUTE does not provide trading signals, investment advice, or funded accounts. It is a structural execution institute — frameworks define process conditions, not market direction. All trading decisions remain the sole responsibility of the participant.'
        }
    ];

    const DEFAULT = 'Thank you for your message. For this query, please contact our team directly at **support@altivor.institute** — we respond within 8 hours, Monday to Saturday (Sunday off).';

    function getBotReply(text) {
        const lower = text.toLowerCase();
        let best = null, bestScore = 0;
        for (const entry of RESPONSES) {
            const score = entry.keys.filter(k => lower.includes(k)).length;
            if (score > bestScore) { bestScore = score; best = entry; }
        }
        return bestScore > 0 ? best.reply : DEFAULT;
    }

    function appendUserMessage(container, text) {
        const wrap = document.createElement('div');
        wrap.className = 'support-msg support-msg--user';
        const bubble = document.createElement('div');
        bubble.className = 'support-msg-bubble';
        const p = document.createElement('p');
        p.textContent = text;
        bubble.appendChild(p);
        wrap.appendChild(bubble);
        container.appendChild(wrap);
        container.scrollTop = container.scrollHeight;
    }

    function showTyping(container) {
        const existing = container.querySelector('.support-typing');
        if (existing) existing.remove();
        const t = document.createElement('div');
        t.className = 'support-typing';
        t.innerHTML = '<span></span><span></span><span></span>';
        container.appendChild(t);
        container.scrollTop = container.scrollHeight;
        return t;
    }

    function renderInline(text) {
        return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }

    function streamBotReply(container, text) {
        const wrap = document.createElement('div');
        wrap.className = 'support-msg support-msg--agent';
        const bubble = document.createElement('div');
        bubble.className = 'support-msg-bubble';
        const label = document.createElement('strong');
        label.className = 'support-agent-label';
        label.textContent = 'Support Agent';
        const p = document.createElement('p');
        p.className = 'support-stream-text';
        bubble.appendChild(label);
        bubble.appendChild(p);
        wrap.appendChild(bubble);
        container.appendChild(wrap);

        let i = 0;
        const speed = 18;
        const cursor = document.createElement('span');
        cursor.className = 'support-cursor';
        cursor.textContent = '|';
        p.appendChild(cursor);

        function tick() {
            if (i < text.length) {
                cursor.remove();
                p.innerHTML = renderInline(text.slice(0, ++i));
                p.appendChild(cursor);
                container.scrollTop = container.scrollHeight;
                setTimeout(tick, speed);
            } else {
                cursor.remove();
            }
        }
        tick();
    }

    document.addEventListener('DOMContentLoaded', function () {
        const input = document.getElementById('supportVisInput');
        const sendBtn = document.getElementById('supportVisSend');
        const visBody = document.querySelector('.support-vis-body');
        const liveChatLink = document.getElementById('supportLiveChatLink');
        if (!input || !sendBtn || !visBody) return;

        if (liveChatLink) {
            liveChatLink.addEventListener('click', function (e) {
                e.preventDefault();
                const support = document.getElementById('support');
                if (support) {
                    support.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(function () { input.focus(); }, 600);
                }
            });
        }

        let busy = false;

        function handleSend() {
            if (busy) return;
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            appendUserMessage(visBody, text);
            const typing = showTyping(visBody);
            busy = true;
            const delay = 600 + Math.random() * 500;
            setTimeout(() => {
                typing.remove();
                streamBotReply(visBody, getBotReply(text));
                busy = false;
            }, delay);
        }

        sendBtn.onclick = handleSend;
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') handleSend();
        });
    });

})();

/* ─── DOCUMENTS MODAL ─────────────────────────────────────────────────── */

window.openDocsModal = function () {
    const el = document.getElementById('docsModal');
    if (!el) return;
    el.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.closeDocsModal = function () {
    const el = document.getElementById('docsModal');
    if (!el) return;
    el.classList.remove('active');
    document.body.style.overflow = '';
};

document.addEventListener('DOMContentLoaded', function () {
    const overlay = document.getElementById('docsModal');
    if (!overlay) return;
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeDocsModal();
    });
});

(function () {
    // ─── Supabase Auth bootstrap ─────────────────────────────────────────────
    // Static-site auth: load supabase-auth.js which talks directly to Supabase
    // and completely replaces the old /api/auth/* backend. We set the flag
    // synchronously BEFORE this IIFE runs its legacy code, so the legacy path
    // is disabled on every page that loads script.js.
    window.__USE_SUPABASE_AUTH = true;
    (function loadSupabaseAuth() {
        if (document.querySelector('script[data-supabase-auth]')) return;
        var s = document.createElement('script');
        s.src = 'supabase-auth.js?v=20250419';
        s.setAttribute('data-supabase-auth', '1');
        document.head.appendChild(s);
    })();

    if (window.__USE_SUPABASE_AUTH) return;
    // Defer once more in case supabase-auth.js hasn't executed yet (async load).
    // If the flag is set later, the legacy handlers below are harmless because
    // supabase-auth.js overrides window.handleLogin/handleRegister and installs
    // its own capture-phase submit listener (registered after this one runs,
    // but that's fine — first listener wins because it preventsDefault + stops).
    // To make supabase-auth.js authoritative, we defer registering the legacy
    // capture listener until we've confirmed the flag is still false.

    const AUTH_ENDPOINTS = {
        me: '/api/auth/me',
        login: '/api/auth/login',
        register: '/api/auth/register',
        logout: '/api/auth/logout'
    };

    let currentUser = null;
    let authStateRequest = null;

    function dispatchAuthChange() {
        document.dispatchEvent(new CustomEvent('altivor:authchange', {
            detail: { user: currentUser }
        }));
    }

    function toggleElementDisplay(el, hidden) {
        if (!el) return;
        if (!Object.prototype.hasOwnProperty.call(el.dataset, 'authOriginalDisplay')) {
            el.dataset.authOriginalDisplay = el.style.display || '';
        }
        el.style.display = hidden ? 'none' : el.dataset.authOriginalDisplay;
    }

    function ensureFormStatusEl(form) {
        let statusEl = form.querySelector('[data-auth-status]');
        if (statusEl) return statusEl;
        statusEl = document.createElement('div');
        statusEl.className = 'auth-field-error';
        statusEl.setAttribute('data-auth-status', 'true');
        statusEl.setAttribute('aria-live', 'polite');
        form.appendChild(statusEl);
        return statusEl;
    }

    function setFormStatus(form, message) {
        if (!form) return;
        const statusEl = ensureFormStatusEl(form);
        statusEl.textContent = message || '';
        statusEl.classList.toggle('visible', Boolean(message));
    }

    function setFormBusy(form, busy) {
        if (!form) return;
        form.querySelectorAll('button, input').forEach(function (el) {
            if (el.type === 'hidden') return;
            if (el.classList && el.classList.contains('auth-close')) return;
            el.disabled = Boolean(busy);
        });
    }

    async function requestJson(url, options) {
        const config = Object.assign({ method: 'GET', credentials: 'same-origin' }, options || {});
        const headers = Object.assign({}, config.headers || {});
        if (config.body && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        const response = await fetch(url, Object.assign({}, config, { headers: headers }));
        const payload = await response.json().catch(function () {
            return {};
        });
        if (!response.ok) {
            const error = new Error(payload.error || 'Request failed.');
            error.statusCode = response.status;
            throw error;
        }
        return payload;
    }

    function closeModalForForm(form) {
        const overlay = form && form.closest ? form.closest('.auth-overlay') : null;
        if (!overlay) return;
        if (typeof window.closeModal === 'function' && overlay.id) {
            window.closeModal(overlay.id);
            return;
        }
        overlay.classList.remove('active');
        document.body.classList.remove('modal-open');
    }

    function ensureProfileButton() {
        let profileBtn = document.getElementById('authProfileBtn');
        if (profileBtn) return profileBtn;
        const navActions = document.querySelector('.nav-actions');
        if (!navActions) return null;
        profileBtn = document.createElement('a');
        profileBtn.id = 'authProfileBtn';
        profileBtn.href = 'profile.html';
        profileBtn.className = 'btn btn-primary nav-cta';
        profileBtn.textContent = 'Profile';
        navActions.appendChild(profileBtn);
        return profileBtn;
    }

    function ensureLogoutButton() {
        let logoutBtn = document.getElementById('authLogoutBtn');
        if (logoutBtn) return logoutBtn;
        const navActions = document.querySelector('.nav-actions');
        if (!navActions) return null;
        logoutBtn = document.createElement('button');
        logoutBtn.type = 'button';
        logoutBtn.id = 'authLogoutBtn';
        logoutBtn.className = 'btn btn-ghost nav-cta';
        logoutBtn.textContent = 'Logout';
        logoutBtn.addEventListener('click', function () {
            logoutCurrentUser();
        });
        navActions.appendChild(logoutBtn);
        return logoutBtn;
    }

    function ensureAdminLink() {
        let link = document.getElementById('authAdminLink');
        if (link) return link;
        var navActions = document.querySelector('.nav-actions');
        if (!navActions) return null;
        link = document.createElement('a');
        link.id = 'authAdminLink';
        link.href = '/admin.html';
        link.className = 'btn btn-ghost nav-cta';
        link.style.fontWeight = '600';
        link.textContent = 'Admin Panel';
        var logoutBtn = document.getElementById('authLogoutBtn');
        if (logoutBtn) {
            navActions.insertBefore(link, logoutBtn);
        } else {
            navActions.appendChild(link);
        }
        return link;
    }

    function updateAuthUi(user) {
        currentUser = user || null;

        document.querySelectorAll('#openLoginBtn, #openRegisterBtn, a[data-i18n="footer_login"]').forEach(function (el) {
            toggleElementDisplay(el, Boolean(currentUser));
        });

        var profileBtn = ensureProfileButton();
        if (profileBtn) {
            toggleElementDisplay(profileBtn, !currentUser);
        }

        var logoutBtn = ensureLogoutButton();
        if (logoutBtn) {
            toggleElementDisplay(logoutBtn, !currentUser);
        }

        var adminLink = ensureAdminLink();
        if (adminLink) {
            toggleElementDisplay(adminLink, !(currentUser && currentUser.role === 'admin'));
        }

        dispatchAuthChange();
    }

    function clearSensitiveFields(form) {
        if (!form) return;
        form.querySelectorAll('input[type="password"]').forEach(function (input) {
            input.value = '';
        });
    }

    function validateRegisterForm(form) {
        const passwordInput = form.querySelector('input[name="password"]');
        const passwordConfirmInput = form.querySelector('input[name="passwordConfirm"]');
        const consentInput = form.querySelector('input[name="consent"]');
        const passwordError = document.getElementById('regPwError');
        const consentError = document.getElementById('regConsentError');
        const password = passwordInput ? passwordInput.value : '';
        const passwordConfirm = passwordConfirmInput ? passwordConfirmInput.value : '';

        if (passwordError) {
            if (password !== passwordConfirm) {
                passwordError.textContent = 'Passwords do not match.';
                passwordError.style.display = 'block';
            } else if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
                passwordError.textContent = 'Password must be at least 8 characters with one uppercase letter, one number, and one special character.';
                passwordError.style.display = 'block';
            } else {
                passwordError.style.display = 'none';
            }
        }

        if (password !== passwordConfirm) return false;
        if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) return false;

        if (consentInput && !consentInput.checked) {
            if (consentError) {
                consentError.style.display = 'block';
            }
            if (consentInput.closest('.auth-consent')) {
                consentInput.closest('.auth-consent').scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return false;
        }

        if (consentError) {
            consentError.style.display = 'none';
        }

        return true;
    }

    function getFormPayload(form) {
        const payload = {};
        new FormData(form).forEach(function (value, key) {
            payload[key] = value;
        });
        const consent = form.querySelector('input[name="consent"]');
        if (consent) {
            payload.consent = consent.checked;
        }
        return payload;
    }

    async function refreshAuthState() {
        if (authStateRequest) return authStateRequest;
        authStateRequest = requestJson(AUTH_ENDPOINTS.me)
            .then(function (payload) {
                updateAuthUi(payload.user || null);
                return currentUser;
            })
            .catch(function () {
                updateAuthUi(null);
                return null;
            })
            .finally(function () {
                authStateRequest = null;
            });
        return authStateRequest;
    }

    async function logoutCurrentUser() {
        try {
            await requestJson(AUTH_ENDPOINTS.logout, { method: 'POST' });
        } catch (_) {
        }
        updateAuthUi(null);
    }

    async function submitLoginForm(form) {
        setFormStatus(form, '');
        setFormBusy(form, true);
        try {
            const payload = getFormPayload(form);
            var rememberEl = form.querySelector('input[name="remember"]');
            var remember = rememberEl ? rememberEl.checked : false;
            const response = await requestJson(AUTH_ENDPOINTS.login, {
                method: 'POST',
                body: JSON.stringify({
                    email: payload.email || '',
                    password: payload.password || '',
                    remember: remember
                })
            });
            if (remember && response.user) {
                localStorage.setItem('altivor_remembered_user', JSON.stringify({ email: response.user.email }));
            } else {
                localStorage.removeItem('altivor_remembered_user');
            }
            updateAuthUi(response.user || null);
            clearSensitiveFields(form);
            form.reset();
            closeModalForForm(form);
        } catch (error) {
            clearSensitiveFields(form);
            setFormStatus(form, error.message || 'Login failed.');
        } finally {
            setFormBusy(form, false);
        }
    }

    async function submitRegisterForm(form) {
        setFormStatus(form, '');
        if (!validateRegisterForm(form)) {
            return;
        }
        setFormBusy(form, true);
        try {
            const payload = getFormPayload(form);
            await requestJson(AUTH_ENDPOINTS.register, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            document.dispatchEvent(new CustomEvent('altivor:cookieConsentReset'));
            clearSensitiveFields(form);
            form.reset();
            closeModalForForm(form);
            window.location.href = '/verify-email.html';
        } catch (error) {
            clearSensitiveFields(form);
            setFormStatus(form, error.message || 'Registration failed.');
        } finally {
            setFormBusy(form, false);
        }
    }

    function bindWindowHandlers() {
        window.handleLogin = function (event) {
            if (event) {
                event.preventDefault();
                if (typeof event.stopPropagation === 'function') event.stopPropagation();
            }
            const form = event && event.target && event.target.closest ? event.target.closest('form') : document.querySelector('#loginForm');
            if (form) submitLoginForm(form);
            return false;
        };

        window.handleRegister = function (event) {
            if (event) {
                event.preventDefault();
                if (typeof event.stopPropagation === 'function') event.stopPropagation();
            }
            const form = event && event.target && event.target.closest ? event.target.closest('form') : document.querySelector('#registerForm');
            if (form) submitRegisterForm(form);
            return false;
        };
    }

    function interceptAuthSubmit(event) {
        const form = event.target;
        if (!form || !form.id) return;
        if (form.id === 'loginForm') {
            event.preventDefault();
            event.stopPropagation();
            submitLoginForm(form);
        }
        if (form.id === 'registerForm') {
            event.preventDefault();
            event.stopPropagation();
            submitRegisterForm(form);
        }
    }

    function injectRememberMe() {
        var forms = document.querySelectorAll('#loginForm');
        forms.forEach(function (form) {
            if (form.querySelector('input[name="remember"]')) return;
            var submitBtn = form.querySelector('.auth-submit');
            if (!submitBtn) return;
            var row = document.createElement('div');
            row.className = 'auth-remember-row';
            row.innerHTML =
                '<label class="auth-remember-label">' +
                    '<input type="checkbox" name="remember" />' +
                    '<span data-i18n="login_remember">Remember me</span>' +
                '</label>' +
                '<a href="#" class="auth-forgot-link" data-i18n="login_forgot">Forgot password?</a>';
            form.insertBefore(row, submitBtn);
            // Remove old standalone forgot link if present
            var oldForgot = form.querySelector('.auth-forgot');
            if (oldForgot) oldForgot.remove();
        });
    }

    function prefillRememberedEmail() {
        try {
            var stored = localStorage.getItem('altivor_remembered_user');
            if (!stored) return;
            var data = JSON.parse(stored);
            if (!data || !data.email) return;
            var forms = document.querySelectorAll('#loginForm');
            forms.forEach(function (form) {
                var emailInput = form.querySelector('input[name="email"]');
                var rememberInput = form.querySelector('input[name="remember"]');
                if (emailInput && !emailInput.value) emailInput.value = data.email;
                if (rememberInput) rememberInput.checked = true;
            });
        } catch (_) {}
    }

    function initAuth() {
        bindWindowHandlers();
        injectRememberMe();
        prefillRememberedEmail();
        refreshAuthState();
    }

    document.addEventListener('submit', interceptAuthSubmit, true);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuth);
    } else {
        initAuth();
    }

    window.altivorAuth = {
        getUser: function () {
            return currentUser;
        },
        refresh: refreshAuthState,
        logout: logoutCurrentUser
    };
})();

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDocsModal();
});

})();

/* ─── ADDRESS AUTOCOMPLETE (Nominatim + IP location bias) ──────────────── */
(function () {
    const input = document.getElementById('regAddress');
    const datalist = document.getElementById('regAddressSuggestions');
    if (!input || !datalist) return;
    let debounce = null;
    let ipLocation = null;
    const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

    // Fetch approximate location from IP for search biasing
    fetch('https://ipapi.co/json/', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data && data.city && data.country_name) {
                ipLocation = {
                    city: data.city,
                    region: data.region || '',
                    country: data.country_name,
                    lat: parseFloat(data.latitude) || 0,
                    lon: parseFloat(data.longitude) || 0
                };
                // Pre-populate suggestion based on detected location
                if (!input.value) {
                    datalist.innerHTML = '';
                    var opt = document.createElement('option');
                    opt.value = [ipLocation.city, ipLocation.region, ipLocation.country].filter(Boolean).join(', ');
                    datalist.appendChild(opt);
                }
            }
        })
        .catch(function () { /* IP lookup failed silently */ });

    function buildNominatimUrl(q) {
        var url = NOMINATIM_URL + '?format=json&q=' + encodeURIComponent(q) + '&addressdetails=1&limit=5';
        if (ipLocation && ipLocation.lat && ipLocation.lon) {
            var d = 2;
            url += '&viewbox=' + (ipLocation.lon - d) + ',' + (ipLocation.lat - d) + ',' + (ipLocation.lon + d) + ',' + (ipLocation.lat + d);
            url += '&bounded=0';
        }
        return url;
    }

    input.addEventListener('input', function () {
        var q = (input.value || '').trim();
        if (q.length < 3) { datalist.innerHTML = ''; return; }
        clearTimeout(debounce);
        debounce = setTimeout(function () {
            fetch(buildNominatimUrl(q), {
                headers: { 'Accept': 'application/json', 'User-Agent': 'ALTIVOR-Institute-Web/1.0' }
            }).then(function (r) { return r.json(); }).then(function (data) {
                datalist.innerHTML = '';
                (data || []).forEach(function (item) {
                    var opt = document.createElement('option');
                    opt.value = item.display_name || (item.address ? [
                        item.address.road,
                        item.address.suburb || item.address.neighbourhood,
                        item.address.city || item.address.town || item.address.village,
                        item.address.country
                    ].filter(Boolean).join(', ') : item.name);
                    datalist.appendChild(opt);
                });
            }).catch(function () { datalist.innerHTML = ''; });
        }, 400);
    });
})();

/* ─── SITE SEARCH (auto-inject on every page) ──────────────────────────── */

(function () {
    // Site index — searchable entries with titles, pages, and URLs
    var SITE_INDEX = [
        // Index / Home
        { title: 'Home — ALTIVOR INSTITUTE', page: 'Home', url: 'index.html' },
        { title: 'Get Access — Pricing Plans', page: 'Home', url: 'index.html#pricing' },
        { title: 'About ALTIVOR INSTITUTE', page: 'Home', url: 'index.html#about' },
        { title: 'Infrastructure & Technology', page: 'Home', url: 'index.html#infrastructure' },
        { title: 'US100 Challenge — 55 trade Cycle', page: 'Home', url: 'index.html#pricing' },

        // Frameworks
        { title: 'US100 Framework — Structural Execution System', page: 'Frameworks', url: 'us100-framework.html' },
        { title: 'US100 Product Files — Document Library', page: 'Frameworks', url: 'us100-product-files.html' },
        { title: 'PREPARE Qualification System', page: 'Frameworks', url: 'us100-framework.html#prepare' },
        { title: '55 trade Cycle — Process Validation', page: 'Frameworks', url: 'us100-framework.html' },
        { title: 'Fixed Risk Governance', page: 'Frameworks', url: 'us100-framework.html' },

        // Accessories
        { title: 'Accessories Hub — All Trading Tools', page: 'Accessories', url: 'accessories.html' },
        { title: 'Trading Log — Trade Journal', page: 'Accessories', url: 'trading-log.html' },
        { title: 'PnL Calendar — Profit & Loss Tracker', page: 'Accessories', url: 'pnl.html' },
        { title: 'Economic Calendar — Macro Events', page: 'Accessories', url: 'calendar.html' },
        { title: 'Trading Symbols — Spreads & Hours', page: 'Accessories', url: 'symbols.html' },
        { title: 'Execution Checklist — 6-Stage Decision Engine', page: 'Accessories', url: 'execution-checklist.html' },
        { title: 'Trading Calculators — Position Size & RR', page: 'Accessories', url: 'calculators.html' },
        { title: 'PREPARE — Qualification Tool', page: 'Accessories', url: 'prepare.html' },

        // FAQ
        { title: 'Frequently Asked Questions', page: 'FAQ', url: 'faq.html' },
        { title: 'What is ALTIVOR INSTITUTE?', page: 'FAQ', url: 'faq.html' },
        { title: 'How does PREPARE qualification work?', page: 'FAQ', url: 'faq.html' },
        { title: 'What is the US100 Challenge?', page: 'FAQ', url: 'faq.html' },
        { title: 'Behavioral Discipline & Process Control', page: 'FAQ', url: 'faq.html' },
        { title: 'Security, Privacy & Platform Operations', page: 'FAQ', url: 'faq.html' },
        { title: 'Revenge trading and violations', page: 'FAQ', url: 'faq.html' },
        { title: 'Trade Alignment percentage', page: 'FAQ', url: 'faq.html' },
        { title: 'Override warning system', page: 'FAQ', url: 'faq.html' },
        { title: 'No-trade filters', page: 'FAQ', url: 'faq.html' },
        { title: 'Password storage and Remember me', page: 'FAQ', url: 'faq.html' },
        { title: 'Cookies and data privacy', page: 'FAQ', url: 'faq.html' },

        // Updates
        { title: 'Trading Updates — News & Changes', page: 'Updates', url: 'trading-updates.html' },

        // Legal
        { title: 'Terms of Service', page: 'Legal', url: 'terms.html' },
        { title: 'Privacy Policy', page: 'Legal', url: 'privacy.html' },
        { title: 'Cookies Policy', page: 'Legal', url: 'cookies.html' },
        { title: 'Risk Disclosure', page: 'Legal', url: 'risk-disclosure.html' },
        { title: 'Refund Policy', page: 'Legal', url: 'refund.html' },

        // Trading Wiki
        { title: 'Trading Wiki — Knowledge Base', page: 'Wiki', url: 'trading-wiki.html' },

        // Account
        { title: 'Login to your account', page: 'Account', url: '#login' },
        { title: 'Register a new account', page: 'Account', url: '#register' }
    ];

    // Inject search button into nav-actions if missing
    function injectSearchBtn() {
        var navActions = document.querySelector('.nav-actions');
        if (!navActions) return;
        if (navActions.querySelector('.nav-search-btn')) return;
        var btn = document.createElement('button');
        btn.className = 'nav-search-btn';
        btn.id = 'navSearchBtn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Search');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
        navActions.insertBefore(btn, navActions.firstChild);
    }

    // Inject search overlay into body if missing
    function injectSearchOverlay() {
        if (document.getElementById('siteSearchOverlay')) return;
        var overlay = document.createElement('div');
        overlay.className = 'site-search-overlay';
        overlay.id = 'siteSearchOverlay';
        overlay.innerHTML =
            '<div class="site-search-modal">' +
                '<div class="site-search-header">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
                    '<input type="text" class="site-search-input" id="siteSearchInput" placeholder="Search ALTIVOR..." autocomplete="off" />' +
                    '<button class="site-search-close" id="siteSearchClose" type="button">ESC</button>' +
                '</div>' +
                '<div class="site-search-results" id="siteSearchResults"></div>' +
                '<div class="site-search-hint">' +
                    '<span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>' +
                    '<span><kbd>↵</kbd> open</span>' +
                    '<span><kbd>ESC</kbd> close</span>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
    }

    function openSearch() {
        var overlay = document.getElementById('siteSearchOverlay');
        if (!overlay) return;
        overlay.classList.add('open');
        var input = document.getElementById('siteSearchInput');
        if (input) { input.value = ''; input.focus(); }
        renderResults('');
        activeIdx = -1;
    }

    function closeSearch() {
        var overlay = document.getElementById('siteSearchOverlay');
        if (!overlay) return;
        overlay.classList.remove('open');
        activeIdx = -1;
    }

    var activeIdx = -1;

    function highlightMatch(text, query) {
        if (!query) return text;
        var esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return text.replace(new RegExp('(' + esc + ')', 'gi'), '<mark>$1</mark>');
    }

    function renderResults(query) {
        var container = document.getElementById('siteSearchResults');
        if (!container) return;
        var q = (query || '').trim().toLowerCase();

        if (!q) {
            container.innerHTML = '<div class="site-search-empty">Type to search across all ALTIVOR pages...</div>';
            activeIdx = -1;
            return;
        }

        var results = SITE_INDEX.filter(function (item) {
            return item.title.toLowerCase().indexOf(q) !== -1 ||
                   item.page.toLowerCase().indexOf(q) !== -1;
        });

        if (results.length === 0) {
            container.innerHTML = '<div class="site-search-empty">No results for &ldquo;' + q.replace(/</g, '&lt;') + '&rdquo;</div>';
            activeIdx = -1;
            return;
        }

        container.innerHTML = results.map(function (item, i) {
            var href = item.url;
            // Handle special account actions
            if (href === '#login') {
                return '<a class="site-search-result" data-action="login" tabindex="-1">' +
                    '<span class="site-search-result-title">' + highlightMatch(item.title, q) + '</span>' +
                    '<span class="site-search-result-page">' + highlightMatch(item.page, q) + '</span>' +
                '</a>';
            }
            if (href === '#register') {
                return '<a class="site-search-result" data-action="register" tabindex="-1">' +
                    '<span class="site-search-result-title">' + highlightMatch(item.title, q) + '</span>' +
                    '<span class="site-search-result-page">' + highlightMatch(item.page, q) + '</span>' +
                '</a>';
            }
            return '<a class="site-search-result" href="' + href + '" tabindex="-1">' +
                '<span class="site-search-result-title">' + highlightMatch(item.title, q) + '</span>' +
                '<span class="site-search-result-page">' + highlightMatch(item.page, q) + '</span>' +
            '</a>';
        }).join('');

        activeIdx = -1;
    }

    function updateActiveResult(delta) {
        var items = document.querySelectorAll('#siteSearchResults .site-search-result');
        if (!items.length) return;
        items.forEach(function (el) { el.classList.remove('active'); });
        activeIdx += delta;
        if (activeIdx < 0) activeIdx = items.length - 1;
        if (activeIdx >= items.length) activeIdx = 0;
        items[activeIdx].classList.add('active');
        items[activeIdx].scrollIntoView({ block: 'nearest' });
    }

    function activateResult() {
        var items = document.querySelectorAll('#siteSearchResults .site-search-result');
        var target = activeIdx >= 0 && activeIdx < items.length ? items[activeIdx] : null;
        if (!target) {
            // If no active result, pick first
            target = items[0];
        }
        if (!target) return;

        var action = target.getAttribute('data-action');
        if (action === 'login') {
            closeSearch();
            if (typeof openModal === 'function') openModal('loginModal');
            return;
        }
        if (action === 'register') {
            closeSearch();
            if (typeof openModal === 'function') openModal('registerModal');
            return;
        }

        var href = target.getAttribute('href');
        if (href) {
            closeSearch();
            window.location.href = href;
        }
    }

    // Initialize
    injectSearchBtn();
    injectSearchOverlay();

    // Bind events
    document.addEventListener('click', function (e) {
        // Open search
        if (e.target.closest('.nav-search-btn')) {
            e.preventDefault();
            openSearch();
            return;
        }
        // Close on overlay background click
        var overlay = document.getElementById('siteSearchOverlay');
        if (overlay && overlay.classList.contains('open') && e.target === overlay) {
            closeSearch();
        }
        // Close button
        if (e.target.closest('#siteSearchClose')) {
            closeSearch();
        }
        // Click on result
        var resultEl = e.target.closest('.site-search-result');
        if (resultEl) {
            e.preventDefault();
            var action = resultEl.getAttribute('data-action');
            if (action === 'login') { closeSearch(); if (typeof openModal === 'function') openModal('loginModal'); return; }
            if (action === 'register') { closeSearch(); if (typeof openModal === 'function') openModal('registerModal'); return; }
            var href = resultEl.getAttribute('href');
            if (href) {
                closeSearch();
                window.location.href = href;
            }
        }
    });

    // Live input filtering
    var searchInput = document.getElementById('siteSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            renderResults(searchInput.value);
        });
    }

    // Keyboard navigation
    document.addEventListener('keydown', function (e) {
        var overlay = document.getElementById('siteSearchOverlay');
        var isOpen = overlay && overlay.classList.contains('open');

        // Ctrl+K or Cmd+K to open
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            if (isOpen) closeSearch(); else openSearch();
            return;
        }

        if (!isOpen) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            closeSearch();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            updateActiveResult(1);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            updateActiveResult(-1);
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            activateResult();
            return;
        }
    });
})();

// ─── FAQ ACCORDION (auto-close siblings) ────────────────────────────
document.querySelectorAll('.faq-grid').forEach(function (grid) {
    grid.addEventListener('toggle', function (e) {
        if (!e.target.open) return;
        grid.querySelectorAll('details[open]').forEach(function (d) {
            if (d !== e.target) d.removeAttribute('open');
        });
    }, true);
});

// ─── FAQ ACCORDION — button-based (.faq-question) ───────────────────
document.addEventListener('click', function (e) {
    var btn = e.target.closest('.faq-question');
    if (!btn) return;
    var item = btn.closest('.faq-item');
    if (!item) return;
    var wasOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(function (openItem) {
        openItem.classList.remove('open');
        var q = openItem.querySelector('.faq-question');
        if (q) q.setAttribute('aria-expanded', 'false');
    });
    if (!wasOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
    }
});

/* ─── SUPPORT CHAT TYPING ANIMATION ─────────────────────────────────── */

(function () {
    const chatPanel = document.querySelector('.support-visual');
    if (!chatPanel) return;

    const body = chatPanel.querySelector('.support-vis-body');
    if (!body) return;

    const msg4 = body.querySelector('[data-i18n="sup_vis_msg4"]');
    const msg5 = body.querySelector('[data-i18n="sup_vis_msg5"]');
    if (!msg4 || !msg5) return;

    const msg4Wrap = msg4.closest('.support-msg');
    const msg5Wrap = msg5.closest('.support-msg');
    const typingDots = body.querySelector('.support-typing');

    // Hide msg4, msg5 and typing dots initially
    msg4Wrap.classList.add('support-msg--animated');
    msg5Wrap.classList.add('support-msg--animated');
    if (typingDots) {
        typingDots.classList.add('support-typing--animated');
    }

    let animated = false;

    const chatObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting && !animated) {
                animated = true;
                chatObserver.unobserve(chatPanel);

                // Step 1: show typing dots (user is "typing")
                setTimeout(function () {
                    if (typingDots) typingDots.classList.add('support-typing--visible');
                }, 800);

                // Step 2: hide dots, show msg4 (user message)
                setTimeout(function () {
                    if (typingDots) typingDots.classList.remove('support-typing--visible');
                    msg4Wrap.classList.add('support-msg--visible');
                }, 2000);

                // Step 3: show typing dots again (agent is "typing")
                setTimeout(function () {
                    if (typingDots) typingDots.classList.add('support-typing--visible');
                }, 2800);

                // Step 4: hide dots, show msg5 (agent response), dots stay hidden
                setTimeout(function () {
                    if (typingDots) typingDots.classList.remove('support-typing--visible');
                    msg5Wrap.classList.add('support-msg--visible');
                }, 4400);
            }
        });
    }, { threshold: 0.3 });

    chatObserver.observe(chatPanel);
})();

/* ─── FIX FOOTER ANCHOR LINKS (redirect to index.html on sub-pages) ──── */
(function () {
    var isIndex = /\/(index\.html)?(\?.*)?(\#.*)?$/i.test(window.location.pathname) || window.location.pathname === '/';
    if (isIndex) return;
    document.querySelectorAll('footer a[href^="#"]').forEach(function (a) {
        a.setAttribute('href', 'index.html' + a.getAttribute('href'));
    });
})();

/* ─── COUNTRY SELECT — full ISO 3166 list + dependent territories ────── */
(function () {
    var sel = document.getElementById('regCountry');
    if (!sel) return;
    var countries = [
        ['AF','\ud83c\udde6\ud83c\uddeb','Afghanistan'],['AX','\ud83c\udde6\ud83c\uddfd','Åland Islands'],
        ['AL','\ud83c\udde6\ud83c\uddf1','Albania'],['DZ','\ud83c\udde9\ud83c\uddff','Algeria'],
        ['AS','\ud83c\udde6\ud83c\uddf8','American Samoa'],['AD','\ud83c\udde6\ud83c\udde9','Andorra'],
        ['AO','\ud83c\udde6\ud83c\uddf4','Angola'],['AI','\ud83c\udde6\ud83c\uddee','Anguilla'],
        ['AQ','\ud83c\udde6\ud83c\uddf6','Antarctica'],['AG','\ud83c\udde6\ud83c\uddec','Antigua and Barbuda'],
        ['AR','\ud83c\udde6\ud83c\uddf7','Argentina'],['AM','\ud83c\udde6\ud83c\uddf2','Armenia'],
        ['AW','\ud83c\udde6\ud83c\uddfc','Aruba'],['AU','\ud83c\udde6\ud83c\uddfa','Australia'],
        ['AT','\ud83c\udde6\ud83c\uddf9','Austria'],['AZ','\ud83c\udde6\ud83c\uddff','Azerbaijan'],
        ['BS','\ud83c\udde7\ud83c\uddf8','Bahamas'],['BH','\ud83c\udde7\ud83c\udded','Bahrain'],
        ['BD','\ud83c\udde7\ud83c\udde9','Bangladesh'],['BB','\ud83c\udde7\ud83c\udde7','Barbados'],
        ['BY','\ud83c\udde7\ud83c\uddfe','Belarus'],['BE','\ud83c\udde7\ud83c\uddea','Belgium'],
        ['BZ','\ud83c\udde7\ud83c\uddff','Belize'],['BJ','\ud83c\udde7\ud83c\uddef','Benin'],
        ['BM','\ud83c\udde7\ud83c\uddf2','Bermuda'],['BT','\ud83c\udde7\ud83c\uddf9','Bhutan'],
        ['BO','\ud83c\udde7\ud83c\uddf4','Bolivia'],['BQ','\ud83c\udde7\ud83c\uddf6','Bonaire, Sint Eustatius and Saba'],
        ['BA','\ud83c\udde7\ud83c\udde6','Bosnia and Herzegovina'],['BW','\ud83c\udde7\ud83c\uddfc','Botswana'],
        ['BV','\ud83c\udde7\ud83c\uddfb','Bouvet Island'],['BR','\ud83c\udde7\ud83c\uddf7','Brazil'],
        ['IO','\ud83c\uddee\ud83c\uddf4','British Indian Ocean Territory'],['BN','\ud83c\udde7\ud83c\uddf3','Brunei'],
        ['BG','\ud83c\udde7\ud83c\uddec','Bulgaria'],['BF','\ud83c\udde7\ud83c\uddeb','Burkina Faso'],
        ['BI','\ud83c\udde7\ud83c\uddee','Burundi'],['CV','\ud83c\udde8\ud83c\uddfb','Cabo Verde'],
        ['KH','\ud83c\uddf0\ud83c\udded','Cambodia'],['CM','\ud83c\udde8\ud83c\uddf2','Cameroon'],
        ['CA','\ud83c\udde8\ud83c\udde6','Canada'],['KY','\ud83c\uddf0\ud83c\uddfe','Cayman Islands'],
        ['CF','\ud83c\udde8\ud83c\uddeb','Central African Republic'],['TD','\ud83c\uddf9\ud83c\udde9','Chad'],
        ['CL','\ud83c\udde8\ud83c\uddf1','Chile'],['CN','\ud83c\udde8\ud83c\uddf3','China'],
        ['CX','\ud83c\udde8\ud83c\uddfd','Christmas Island'],['CC','\ud83c\udde8\ud83c\udde8','Cocos (Keeling) Islands'],
        ['CO','\ud83c\udde8\ud83c\uddf4','Colombia'],['KM','\ud83c\uddf0\ud83c\uddf2','Comoros'],
        ['CG','\ud83c\udde8\ud83c\uddec','Congo'],['CD','\ud83c\udde8\ud83c\udde9','Congo (DRC)'],
        ['CK','\ud83c\udde8\ud83c\uddf0','Cook Islands'],['CR','\ud83c\udde8\ud83c\uddf7','Costa Rica'],
        ['CI','\ud83c\udde8\ud83c\uddee','Côte d\'Ivoire'],['HR','\ud83c\udded\ud83c\uddf7','Croatia'],
        ['CU','\ud83c\udde8\ud83c\uddfa','Cuba'],['CW','\ud83c\udde8\ud83c\uddfc','Curaçao'],
        ['CY','\ud83c\udde8\ud83c\uddfe','Cyprus'],['CZ','\ud83c\udde8\ud83c\uddff','Czech Republic'],
        ['DK','\ud83c\udde9\ud83c\uddf0','Denmark'],['DJ','\ud83c\udde9\ud83c\uddef','Djibouti'],
        ['DM','\ud83c\udde9\ud83c\uddf2','Dominica'],['DO','\ud83c\udde9\ud83c\uddf4','Dominican Republic'],
        ['EC','\ud83c\uddea\ud83c\udde8','Ecuador'],['EG','\ud83c\uddea\ud83c\uddec','Egypt'],
        ['SV','\ud83c\uddf8\ud83c\uddfb','El Salvador'],['GQ','\ud83c\uddec\ud83c\uddf6','Equatorial Guinea'],
        ['ER','\ud83c\uddea\ud83c\uddf7','Eritrea'],['EE','\ud83c\uddea\ud83c\uddea','Estonia'],
        ['SZ','\ud83c\uddf8\ud83c\uddff','Eswatini'],['ET','\ud83c\uddea\ud83c\uddf9','Ethiopia'],
        ['FK','\ud83c\uddeb\ud83c\uddf0','Falkland Islands'],['FO','\ud83c\uddeb\ud83c\uddf4','Faroe Islands'],
        ['FJ','\ud83c\uddeb\ud83c\uddef','Fiji'],['FI','\ud83c\uddeb\ud83c\uddee','Finland'],
        ['FR','\ud83c\uddeb\ud83c\uddf7','France'],['GF','\ud83c\uddec\ud83c\uddeb','French Guiana'],
        ['PF','\ud83c\uddf5\ud83c\uddeb','French Polynesia'],['TF','\ud83c\uddf9\ud83c\uddeb','French Southern Territories'],
        ['GA','\ud83c\uddec\ud83c\udde6','Gabon'],['GM','\ud83c\uddec\ud83c\uddf2','Gambia'],
        ['GE','\ud83c\uddec\ud83c\uddea','Georgia'],['DE','\ud83c\udde9\ud83c\uddea','Germany'],
        ['GH','\ud83c\uddec\ud83c\udded','Ghana'],['GI','\ud83c\uddec\ud83c\uddee','Gibraltar'],
        ['GR','\ud83c\uddec\ud83c\uddf7','Greece'],['GL','\ud83c\uddec\ud83c\uddf1','Greenland'],
        ['GD','\ud83c\uddec\ud83c\udde9','Grenada'],['GP','\ud83c\uddec\ud83c\uddf5','Guadeloupe'],
        ['GU','\ud83c\uddec\ud83c\uddfa','Guam'],['GT','\ud83c\uddec\ud83c\uddf9','Guatemala'],
        ['GG','\ud83c\uddec\ud83c\uddec','Guernsey'],['GN','\ud83c\uddec\ud83c\uddf3','Guinea'],
        ['GW','\ud83c\uddec\ud83c\uddfc','Guinea-Bissau'],['GY','\ud83c\uddec\ud83c\uddfe','Guyana'],
        ['HT','\ud83c\udded\ud83c\uddf9','Haiti'],['HM','\ud83c\udded\ud83c\uddf2','Heard Island and McDonald Islands'],
        ['VA','\ud83c\uddfb\ud83c\udde6','Holy See'],['HN','\ud83c\udded\ud83c\uddf3','Honduras'],
        ['HK','\ud83c\udded\ud83c\uddf0','Hong Kong'],['HU','\ud83c\udded\ud83c\uddfa','Hungary'],
        ['IS','\ud83c\uddee\ud83c\uddf8','Iceland'],['IN','\ud83c\uddee\ud83c\uddf3','India'],
        ['ID','\ud83c\uddee\ud83c\udde9','Indonesia'],['IR','\ud83c\uddee\ud83c\uddf7','Iran'],
        ['IQ','\ud83c\uddee\ud83c\uddf6','Iraq'],['IE','\ud83c\uddee\ud83c\uddea','Ireland'],
        ['IM','\ud83c\uddee\ud83c\uddf2','Isle of Man'],['IL','\ud83c\uddee\ud83c\uddf1','Israel'],
        ['IT','\ud83c\uddee\ud83c\uddf9','Italy'],['JM','\ud83c\uddef\ud83c\uddf2','Jamaica'],
        ['JP','\ud83c\uddef\ud83c\uddf5','Japan'],['JE','\ud83c\uddef\ud83c\uddea','Jersey'],
        ['JO','\ud83c\uddef\ud83c\uddf4','Jordan'],['KZ','\ud83c\uddf0\ud83c\uddff','Kazakhstan'],
        ['KE','\ud83c\uddf0\ud83c\uddea','Kenya'],['KI','\ud83c\uddf0\ud83c\uddee','Kiribati'],
        ['KP','\ud83c\uddf0\ud83c\uddf5','North Korea'],['KR','\ud83c\uddf0\ud83c\uddf7','South Korea'],
        ['KW','\ud83c\uddf0\ud83c\uddfc','Kuwait'],['KG','\ud83c\uddf0\ud83c\uddec','Kyrgyzstan'],
        ['LA','\ud83c\uddf1\ud83c\udde6','Laos'],['LV','\ud83c\uddf1\ud83c\uddfb','Latvia'],
        ['LB','\ud83c\uddf1\ud83c\udde7','Lebanon'],['LS','\ud83c\uddf1\ud83c\uddf8','Lesotho'],
        ['LR','\ud83c\uddf1\ud83c\uddf7','Liberia'],['LY','\ud83c\uddf1\ud83c\uddfe','Libya'],
        ['LI','\ud83c\uddf1\ud83c\uddee','Liechtenstein'],['LT','\ud83c\uddf1\ud83c\uddf9','Lithuania'],
        ['LU','\ud83c\uddf1\ud83c\uddfa','Luxembourg'],['MO','\ud83c\uddf2\ud83c\uddf4','Macao'],
        ['MG','\ud83c\uddf2\ud83c\uddec','Madagascar'],['MW','\ud83c\uddf2\ud83c\uddfc','Malawi'],
        ['MY','\ud83c\uddf2\ud83c\uddfe','Malaysia'],['MV','\ud83c\uddf2\ud83c\uddfb','Maldives'],
        ['ML','\ud83c\uddf2\ud83c\uddf1','Mali'],['MT','\ud83c\uddf2\ud83c\uddf9','Malta'],
        ['MH','\ud83c\uddf2\ud83c\udded','Marshall Islands'],['MQ','\ud83c\uddf2\ud83c\uddf6','Martinique'],
        ['MR','\ud83c\uddf2\ud83c\uddf7','Mauritania'],['MU','\ud83c\uddf2\ud83c\uddfa','Mauritius'],
        ['YT','\ud83c\uddfe\ud83c\uddf9','Mayotte'],['MX','\ud83c\uddf2\ud83c\uddfd','Mexico'],
        ['FM','\ud83c\uddeb\ud83c\uddf2','Micronesia'],['MD','\ud83c\uddf2\ud83c\udde9','Moldova'],
        ['MC','\ud83c\uddf2\ud83c\udde8','Monaco'],['MN','\ud83c\uddf2\ud83c\uddf3','Mongolia'],
        ['ME','\ud83c\uddf2\ud83c\uddea','Montenegro'],['MS','\ud83c\uddf2\ud83c\uddf8','Montserrat'],
        ['MA','\ud83c\uddf2\ud83c\udde6','Morocco'],['MZ','\ud83c\uddf2\ud83c\uddff','Mozambique'],
        ['MM','\ud83c\uddf2\ud83c\uddf2','Myanmar'],['NA','\ud83c\uddf3\ud83c\udde6','Namibia'],
        ['NR','\ud83c\uddf3\ud83c\uddf7','Nauru'],['NP','\ud83c\uddf3\ud83c\uddf5','Nepal'],
        ['NL','\ud83c\uddf3\ud83c\uddf1','Netherlands'],['NC','\ud83c\uddf3\ud83c\udde8','New Caledonia'],
        ['NZ','\ud83c\uddf3\ud83c\uddff','New Zealand'],['NI','\ud83c\uddf3\ud83c\uddee','Nicaragua'],
        ['NE','\ud83c\uddf3\ud83c\uddea','Niger'],['NG','\ud83c\uddf3\ud83c\uddec','Nigeria'],
        ['NU','\ud83c\uddf3\ud83c\uddfa','Niue'],['NF','\ud83c\uddf3\ud83c\uddeb','Norfolk Island'],
        ['MK','\ud83c\uddf2\ud83c\uddf0','North Macedonia'],['MP','\ud83c\uddf2\ud83c\uddf5','Northern Mariana Islands'],
        ['NO','\ud83c\uddf3\ud83c\uddf4','Norway'],['OM','\ud83c\uddf4\ud83c\uddf2','Oman'],
        ['PK','\ud83c\uddf5\ud83c\uddf0','Pakistan'],['PW','\ud83c\uddf5\ud83c\uddfc','Palau'],
        ['PS','\ud83c\uddf5\ud83c\uddf8','Palestine'],['PA','\ud83c\uddf5\ud83c\udde6','Panama'],
        ['PG','\ud83c\uddf5\ud83c\uddec','Papua New Guinea'],['PY','\ud83c\uddf5\ud83c\uddfe','Paraguay'],
        ['PE','\ud83c\uddf5\ud83c\uddea','Peru'],['PH','\ud83c\uddf5\ud83c\udded','Philippines'],
        ['PN','\ud83c\uddf5\ud83c\uddf3','Pitcairn Islands'],['PL','\ud83c\uddf5\ud83c\uddf1','Poland'],
        ['PT','\ud83c\uddf5\ud83c\uddf9','Portugal'],['PR','\ud83c\uddf5\ud83c\uddf7','Puerto Rico'],
        ['QA','\ud83c\uddf6\ud83c\udde6','Qatar'],['RE','\ud83c\uddf7\ud83c\uddea','Réunion'],
        ['RO','\ud83c\uddf7\ud83c\uddf4','Romania'],['RU','\ud83c\uddf7\ud83c\uddfa','Russia'],
        ['RW','\ud83c\uddf7\ud83c\uddfc','Rwanda'],['BL','\ud83c\udde7\ud83c\uddf1','Saint Barthélemy'],
        ['SH','\ud83c\uddf8\ud83c\udded','Saint Helena'],['KN','\ud83c\uddf0\ud83c\uddf3','Saint Kitts and Nevis'],
        ['LC','\ud83c\uddf1\ud83c\udde8','Saint Lucia'],['MF','\ud83c\uddf2\ud83c\uddeb','Saint Martin'],
        ['PM','\ud83c\uddf5\ud83c\uddf2','Saint Pierre and Miquelon'],['VC','\ud83c\uddfb\ud83c\udde8','Saint Vincent and the Grenadines'],
        ['WS','\ud83c\uddfc\ud83c\uddf8','Samoa'],['SM','\ud83c\uddf8\ud83c\uddf2','San Marino'],
        ['ST','\ud83c\uddf8\ud83c\uddf9','São Tomé and Príncipe'],['SA','\ud83c\uddf8\ud83c\udde6','Saudi Arabia'],
        ['SN','\ud83c\uddf8\ud83c\uddf3','Senegal'],['RS','\ud83c\uddf7\ud83c\uddf8','Serbia'],
        ['SC','\ud83c\uddf8\ud83c\udde8','Seychelles'],['SL','\ud83c\uddf8\ud83c\uddf1','Sierra Leone'],
        ['SG','\ud83c\uddf8\ud83c\uddec','Singapore'],['SX','\ud83c\uddf8\ud83c\uddfd','Sint Maarten'],
        ['SK','\ud83c\uddf8\ud83c\uddf0','Slovakia'],['SI','\ud83c\uddf8\ud83c\uddee','Slovenia'],
        ['SB','\ud83c\uddf8\ud83c\udde7','Solomon Islands'],['SO','\ud83c\uddf8\ud83c\uddf4','Somalia'],
        ['ZA','\ud83c\uddff\ud83c\udde6','South Africa'],['GS','\ud83c\uddec\ud83c\uddf8','South Georgia'],
        ['SS','\ud83c\uddf8\ud83c\uddf8','South Sudan'],['ES','\ud83c\uddea\ud83c\uddf8','Spain'],
        ['LK','\ud83c\uddf1\ud83c\uddf0','Sri Lanka'],['SD','\ud83c\uddf8\ud83c\udde9','Sudan'],
        ['SR','\ud83c\uddf8\ud83c\uddf7','Suriname'],['SJ','\ud83c\uddf8\ud83c\uddef','Svalbard and Jan Mayen'],
        ['SE','\ud83c\uddf8\ud83c\uddea','Sweden'],['CH','\ud83c\udde8\ud83c\udded','Switzerland'],
        ['SY','\ud83c\uddf8\ud83c\uddfe','Syria'],['TW','\ud83c\uddf9\ud83c\uddfc','Taiwan'],
        ['TJ','\ud83c\uddf9\ud83c\uddef','Tajikistan'],['TZ','\ud83c\uddf9\ud83c\uddff','Tanzania'],
        ['TH','\ud83c\uddf9\ud83c\udded','Thailand'],['TL','\ud83c\uddf9\ud83c\uddf1','Timor-Leste'],
        ['TG','\ud83c\uddf9\ud83c\uddec','Togo'],['TK','\ud83c\uddf9\ud83c\uddf0','Tokelau'],
        ['TO','\ud83c\uddf9\ud83c\uddf4','Tonga'],['TT','\ud83c\uddf9\ud83c\uddf9','Trinidad and Tobago'],
        ['TN','\ud83c\uddf9\ud83c\uddf3','Tunisia'],['TR','\ud83c\uddf9\ud83c\uddf7','Turkey'],
        ['TM','\ud83c\uddf9\ud83c\uddf2','Turkmenistan'],['TC','\ud83c\uddf9\ud83c\udde8','Turks and Caicos Islands'],
        ['TV','\ud83c\uddf9\ud83c\uddfb','Tuvalu'],['UG','\ud83c\uddfa\ud83c\uddec','Uganda'],
        ['UA','\ud83c\uddfa\ud83c\udde6','Ukraine'],['AE','\ud83c\udde6\ud83c\uddea','United Arab Emirates'],
        ['GB','\ud83c\uddec\ud83c\udde7','United Kingdom'],['US','\ud83c\uddfa\ud83c\uddf8','United States'],
        ['UM','\ud83c\uddfa\ud83c\uddf2','U.S. Minor Outlying Islands'],['UY','\ud83c\uddfa\ud83c\uddfe','Uruguay'],
        ['UZ','\ud83c\uddfa\ud83c\uddff','Uzbekistan'],['VU','\ud83c\uddfb\ud83c\uddfa','Vanuatu'],
        ['VE','\ud83c\uddfb\ud83c\uddea','Venezuela'],['VN','\ud83c\uddfb\ud83c\uddf3','Vietnam'],
        ['VG','\ud83c\uddfb\ud83c\uddec','British Virgin Islands'],['VI','\ud83c\uddfb\ud83c\uddee','U.S. Virgin Islands'],
        ['WF','\ud83c\uddfc\ud83c\uddeb','Wallis and Futuna'],['EH','\ud83c\uddea\ud83c\udded','Western Sahara'],
        ['YE','\ud83c\uddfe\ud83c\uddea','Yemen'],['ZM','\ud83c\uddff\ud83c\uddf2','Zambia'],
        ['ZW','\ud83c\uddff\ud83c\uddfc','Zimbabwe']
    ];
    var saved = sel.value;
    var placeholder = sel.querySelector('option[value=""]');
    sel.innerHTML = '';
    if (placeholder) sel.appendChild(placeholder);
    else {
        var ph = document.createElement('option');
        ph.value = ''; ph.disabled = true; ph.selected = true; ph.textContent = 'Select your country';
        sel.appendChild(ph);
    }
    countries.forEach(function (c) {
        var o = document.createElement('option');
        o.value = c[0]; o.textContent = c[1] + ' ' + c[2];
        sel.appendChild(o);
    });
    if (saved) sel.value = saved;
})();

/* ─── CLARITY BLOCK (injected before #about) ───────────────────────────── */
(function () {
    var aboutSection = document.getElementById('about');
    if (!aboutSection) return;
    if (document.getElementById('clarityBlock')) return;

    /* inject scoped styles */
    var style = document.createElement('style');
    style.textContent =
        '#clarityBlock{padding:5rem 0;border-top:1px solid var(--border-subtle)}' +
        '#clarityBlock .section-header{max-width:720px;margin-bottom:2.5rem}' +
        '#clarityBlock h2{font-family:"DM Serif Display",Georgia,serif;font-size:clamp(1.75rem,3.5vw,2.9rem);line-height:1.12;letter-spacing:-0.01em;color:var(--txt-accent,#f0f0f0);margin:0 0 0.6rem}' +
        '#clarityBlock .section-body{font-family:"Inter",sans-serif;font-size:1rem;line-height:1.75;color:var(--txt-secondary,#888);margin-top:0.6rem}' +
        '.cb-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1.25rem;margin-top:2.5rem}' +
        '.cb-card{background:var(--bg-card,#141414);border:1px solid var(--border-subtle,rgba(255,255,255,0.06));border-radius:12px;padding:1.6rem 1.4rem;transition:border-color .25s,box-shadow .25s}' +
        '.cb-card:hover{border-color:var(--border-default,rgba(255,255,255,0.10));box-shadow:0 4px 24px rgba(0,0,0,0.25)}' +
        '.cb-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:1rem;background:rgba(214,190,150,0.07);border:1px solid rgba(214,190,150,0.18)}' +
        '.cb-icon svg{width:18px;height:18px;color:rgba(214,190,150,0.85)}' +
        '.cb-card h4{font-family:"Inter",sans-serif;font-size:0.9rem;font-weight:600;color:var(--txt-primary,#f0f0f0);margin:0 0 0.5rem;letter-spacing:0.01em}' +
        '.cb-card p{font-family:"Inter",sans-serif;font-size:0.85rem;line-height:1.65;color:var(--txt-secondary,#888);margin:0}' +
        '.cb-benefits{display:flex;gap:2rem;margin-top:2.5rem;padding:1.5rem 1.8rem;border-radius:12px;background:var(--bg-elevated,#181818);border:1px solid var(--border-subtle,rgba(255,255,255,0.06))}' +
        '.cb-benefit{display:flex;align-items:flex-start;gap:0.7rem;flex:1}' +
        '.cb-benefit-icon{flex-shrink:0;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(159,204,138,0.1);border:1px solid rgba(159,204,138,0.2)}' +
        '.cb-benefit-icon svg{width:14px;height:14px;color:rgba(159,204,138,0.85)}' +
        '.cb-benefit-text h5{font-family:"Inter",sans-serif;font-size:0.82rem;font-weight:600;color:var(--txt-primary,#f0f0f0);margin:0 0 0.2rem}' +
        '.cb-benefit-text p{font-family:"Inter",sans-serif;font-size:0.8rem;color:var(--txt-secondary,#888);margin:0;line-height:1.55}' +
        '.cb-bottom{display:flex;gap:0.85rem;justify-content:center;margin-top:2.5rem;flex-wrap:wrap}' +
        '.cb-pill{display:inline-flex;align-items:center;gap:0.5rem;padding:0.55rem 1.2rem;border-radius:100px;font-family:"Inter",sans-serif;font-size:0.8rem;font-weight:500;letter-spacing:0.01em;transition:transform .2s}' +
        '.cb-pill:hover{transform:translateY(-1px)}' +
        '.cb-pill svg{width:13px;height:13px;flex-shrink:0}' +
        '.cb-pill-no{background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.10);color:rgba(248,113,113,0.65)}' +
        '.cb-pill-yes{background:rgba(159,204,138,0.06);border:1px solid rgba(159,204,138,0.18);color:rgba(159,204,138,0.85);font-weight:600}' +
        '@media(max-width:768px){.cb-grid{grid-template-columns:repeat(2,1fr)}.cb-benefits{flex-direction:column;gap:1rem}.cb-bottom{gap:0.5rem}}' +
        '@media(max-width:480px){.cb-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);

    var section = document.createElement('section');
    section.className = 'section';
    section.id = 'clarityBlock';
    section.setAttribute('aria-label', 'What this is');

    var svgSystem = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>';
    var svgShield = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
    var svgCalendar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    var svgTarget = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
    var svgCheck = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var svgX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    section.innerHTML =
        '<div class="container">' +
          '<div class="section-header" data-reveal>' +
            '<p class="label-tag">Clarity</p>' +
            '<h2>What this actually is</h2>' +
            '<p class="section-body">Not a course, not signals, not a bot &mdash; a structured execution system for funded&nbsp;challenges.</p>' +
          '</div>' +
          '<div class="cb-grid" data-reveal>' +
            '<div class="cb-card"><div class="cb-icon">' + svgSystem + '</div><h4>Trading System</h4><p>Structured US100 framework with defined entries, exits, and position&nbsp;sizing.</p></div>' +
            '<div class="cb-card"><div class="cb-icon">' + svgShield + '</div><h4>Risk Rules</h4><p>Fixed drawdown limits, exposure caps, and non-negotiable risk&nbsp;parameters.</p></div>' +
            '<div class="cb-card"><div class="cb-icon">' + svgCalendar + '</div><h4>Daily Process</h4><p>Pre-session checklist, trade logging, and structured daily&nbsp;review.</p></div>' +
            '<div class="cb-card"><div class="cb-icon">' + svgTarget + '</div><h4>Funded Validation</h4><p>55-trade cycle proving your process holds under funded&nbsp;conditions.</p></div>' +
          '</div>' +
          '<div class="cb-benefits" data-reveal>' +
            '<div class="cb-benefit"><div class="cb-benefit-icon">' + svgCheck + '</div><div class="cb-benefit-text"><h5>Know exactly what to do</h5><p>No guessing. Clear rules for every trading day.</p></div></div>' +
            '<div class="cb-benefit"><div class="cb-benefit-icon">' + svgCheck + '</div><div class="cb-benefit-text"><h5>Stop breaking rules</h5><p>Built-in discipline system that tracks violations.</p></div></div>' +
            '<div class="cb-benefit"><div class="cb-benefit-icon">' + svgCheck + '</div><div class="cb-benefit-text"><h5>Prove you’re funded-ready</h5><p>Documented validation that your process works.</p></div></div>' +
          '</div>' +
        '</div>';

    aboutSection.parentNode.insertBefore(section, aboutSection);
})();

/* ─── HOW IT WORKS (injected after clarity, before #about) ─────────────── */
(function () {
    var aboutSection = document.getElementById('about');
    if (!aboutSection) return;
    if (document.getElementById('howItWorks')) return;

    var style = document.createElement('style');
    style.textContent =
        '#howItWorks{padding:5rem 0;border-top:1px solid var(--border-subtle)}' +
        '#howItWorks .section-header{max-width:720px;margin-bottom:2.5rem}' +
        '#howItWorks h2{font-family:"DM Serif Display",Georgia,serif;font-size:clamp(1.75rem,3.5vw,2.9rem);line-height:1.12;letter-spacing:-0.01em;color:var(--txt-accent,#f0f0f0);margin:0 0 0.6rem}' +
        '#howItWorks .section-body{font-family:"Inter",sans-serif;font-size:1rem;line-height:1.75;color:var(--txt-secondary,#888);margin-top:0.6rem}' +
        '.hiw-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:2.5rem;position:relative}' +
        '.hiw-step{position:relative;padding:2rem 1.8rem;text-align:center}' +
        '.hiw-step:not(:last-child){border-right:1px solid var(--border-subtle,rgba(255,255,255,0.06))}' +
        '.hiw-num{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;font-family:"DM Serif Display",Georgia,serif;font-size:1.1rem;color:rgba(214,190,150,0.9);background:rgba(214,190,150,0.07);border:1px solid rgba(214,190,150,0.18);margin-bottom:1.2rem}' +
        '.hiw-step h4{font-family:"Inter",sans-serif;font-size:0.95rem;font-weight:600;color:var(--txt-primary,#f0f0f0);margin:0 0 0.5rem}' +
        '.hiw-step p{font-family:"Inter",sans-serif;font-size:0.85rem;line-height:1.65;color:var(--txt-secondary,#888);margin:0}' +
        '.hiw-step .hiw-price{display:inline-block;margin-top:0.8rem;font-family:"Inter",sans-serif;font-size:0.78rem;font-weight:600;color:rgba(214,190,150,0.7);letter-spacing:0.04em}' +
        '.hiw-arrow{position:absolute;top:50%;right:-12px;transform:translateY(-50%);z-index:2;width:24px;height:24px;border-radius:50%;background:var(--bg-base,#0a0a0a);border:1px solid var(--border-subtle,rgba(255,255,255,0.06));display:flex;align-items:center;justify-content:center}' +
        '.hiw-arrow svg{width:12px;height:12px;color:rgba(214,190,150,0.6)}' +
        '.hiw-note{margin-top:2rem;padding:1.4rem 1.8rem;border-radius:12px;background:var(--bg-elevated,#181818);border:1px solid var(--border-subtle,rgba(255,255,255,0.06));display:flex;align-items:flex-start;gap:0.8rem}' +
        '.hiw-note-icon{flex-shrink:0;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.18)}' +
        '.hiw-note-icon svg{width:15px;height:15px;color:rgba(96,165,250,0.8)}' +
        '.hiw-note p{font-family:"Inter",sans-serif;font-size:0.85rem;line-height:1.65;color:var(--txt-secondary,#888);margin:0}' +
        '.hiw-note strong{color:var(--txt-primary,#f0f0f0);font-weight:600}' +
        '@media(max-width:768px){.hiw-steps{grid-template-columns:1fr;gap:0}.hiw-step:not(:last-child){border-right:none;border-bottom:1px solid var(--border-subtle,rgba(255,255,255,0.06))}.hiw-arrow{top:auto;bottom:-12px;right:50%;transform:translateX(50%);}.hiw-arrow svg{transform:rotate(90deg)}}';
    document.head.appendChild(style);

    var sec = document.createElement('section');
    sec.className = 'section';
    sec.id = 'howItWorks';
    sec.setAttribute('aria-label', 'How it works');

    var svgArrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>';
    var svgInfo = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

    sec.innerHTML =
        '<div class="container">' +
          '<div class="section-header" data-reveal>' +
            '<p class="label-tag">Process</p>' +
            '<h2>How it works</h2>' +
            '<p class="section-body">Access is deliberately structured in stages. You cannot skip ahead &mdash; and that is the point.</p>' +
          '</div>' +
          '<div class="hiw-steps" data-reveal>' +
            '<div class="hiw-step">' +
              '<div class="hiw-num">1</div>' +
              '<h4>PREPARE</h4>' +
              '<p>Complete 10 compliant trades under controlled conditions. This is a mandatory qualification gate &mdash; it proves you can follow rules before risking more capital.</p>' +
              '<span class="hiw-price">29 &euro; &middot; one-time</span>' +
              '<div class="hiw-arrow">' + svgArrow + '</div>' +
            '</div>' +
            '<div class="hiw-step">' +
              '<div class="hiw-num">2</div>' +
              '<h4>Choose Your Challenge</h4>' +
              '<p>Once PREPARE is passed, you unlock the US100 Challenge &mdash; a 55-trade validation cycle with strict risk rules, session windows, and full documentation requirements.</p>' +
              '<span class="hiw-price">from 59 &euro;</span>' +
              '<div class="hiw-arrow">' + svgArrow + '</div>' +
            '</div>' +
            '<div class="hiw-step">' +
              '<div class="hiw-num">3</div>' +
              '<h4>Execute &amp; Validate</h4>' +
              '<p>Trade under funded-level conditions. Every trade is logged, scored, and measured against compliance standards. The system tells you if your process holds.</p>' +
              '<span class="hiw-price">55 trades &middot; 2 months max</span>' +
            '</div>' +
          '</div>' +
          '<div class="hiw-note" data-reveal>' +
            '<div class="hiw-note-icon">' + svgInfo + '</div>' +
            '<p><strong>Why the gate?</strong> Most traders fail funded challenges not because of bad strategy, but because they are not operationally ready. PREPARE exists to filter that out &mdash; so you don\'t spend 129&nbsp;&euro; on a challenge you\'re not yet equipped to pass. Think of it as a structural readiness check, not a paywall.</p>' +
          '</div>' +
        '</div>';

    aboutSection.parentNode.insertBefore(sec, aboutSection);
})();
