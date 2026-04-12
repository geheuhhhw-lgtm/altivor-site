# ALTIVOR — Specyfikacja Techniczna Systemu Rejestracji i Logowania

**Wersja:** 1.0 | **Data:** 2026-03-24 | **Status:** Do wdrożenia

---

## Spis treści

1. [Cel systemu i założenia biznesowe](#1-cel-systemu)
2. [Architektura systemu](#2-architektura)
3. [Integracja istniejącego UI](#3-integracja-ui)
4. [Rejestracja — pełny flow](#4-rejestracja)
5. [Logowanie — pełny flow](#5-logowanie)
6. [Wymuszenie „1 email = 1 konto"](#6-unikalnosc-email)
7. [Reset hasła](#7-reset-hasla)
8. [Backend API](#8-api)
9. [Baza danych](#9-baza-danych)
10. [Bezpieczeństwo](#10-bezpieczenstwo)
11. [Scenariusze brzegowe](#11-edge-cases)
12. [Request lifecycle](#12-lifecycle)
13. [Przykładowa implementacja](#13-implementacja)
14. [Testy](#14-testy)
15. [Wdrożenie produkcyjne](#15-wdrozenie)

---

## 1. Cel systemu i założenia biznesowe

### 1.1 Po co istnieją rejestracja i logowanie

Altivor to platforma fintech (US100 Framework, 45 Trade Cycle). System auth:
- Kontroluje dostęp do chronionych zasobów (PnL, Trading Log, Execution Checklist, Calendar, Calculators).
- Identyfikuje użytkownika — przypisanie danych do konta.
- Zabezpiecza operacje — tylko zweryfikowany, aktywny user ma dostęp.
- Spełnia wymogi regulacyjne — consent tracking, audit trail.

### 1.2 Zasady tworzenia kont

| Reguła | Implementacja |
|--------|--------------|
| 1 email = 1 konto | UNIQUE constraint w DB + walidacja backend + frontend |
| Wymagane pola | `firstName`, `lastName`, `username`, `email`, `password`, `passwordConfirm`, `address`, `consent` |
| Weryfikacja email obowiązkowa | Konto `unverified` do kliknięcia linku |
| Consent wymagany | Checkbox Terms, Privacy, Risk Disclosure, Refund, Challenge Rules |

### 1.3 Reguła „1 email = 1 konto"

- Email normalizowany: `trim() + toLowerCase()` — frontend i backend.
- Pole `email_normalized` (UNIQUE INDEX) w DB.
- Próba rejestracji na istniejący email → `409` + komunikat.

### 1.4 Konto niezweryfikowane

Istnieje w DB, ale:
- Nie może się zalogować → `403`.
- Nie ma sesji.
- Może otrzymać ponowny email weryfikacyjny.
- Token wygasa po 24h.

### 1.5 Stany konta

| Stan | Warunek | Opis |
|------|---------|------|
| **unverified** | `email_verified=false` | Nie może się logować |
| **active** | `email_verified=true`, `account_status='active'` | Pełny dostęp |
| **locked** | `account_status='locked'` | Brute-force lockout, auto-unlock po `locked_until` |
| **blocked** | `account_status='blocked'` | Ręczna blokada admina |
| **soft-deleted** | `deleted_at IS NOT NULL` | Oznaczone jako usunięte, email zarezerwowany |

---

## 2. Architektura systemu

### 2.1 High-level

```
Browser ◄──HTTPS/JSON──► Node.js HTTP (8090) ──► PostgreSQL
                                │
                                ▼
                          SMTP (Nodemailer)
```

### 2.2 Komponenty

| Komponent | Pliki |
|-----------|-------|
| Frontend — auth UI, walidacja, API calls | `script.js` (auth IIFE), inline `<script>` w HTML |
| Backend — HTTP server | `server.js` |
| Backend — Auth routes | `server-auth-routes.js` |
| Backend — Auth store (logika biznesowa) | `auth-store.js` |
| Backend — Email service | `email-service.js` |
| DB | **Migracja z JSON → PostgreSQL** |

### 2.3 Decyzja: Session cookie (nie JWT)

**Wybór: HttpOnly session cookie z HMAC-signed session ID.**

Uzasadnienie:
- HttpOnly → JS nie ma dostępu → eliminacja kradzieży tokenu przez XSS.
- Natychmiastowe unieważnianie sesji (usunięcie z DB) — krytyczne przy resecie hasła.
- Prostota — jeden cookie, zero zarządzania tokenami po stronie klienta.
- Altivor to SPA-like z server-side routing, nie mikroserwisy — JWT niepotrzebny.
- Już zaimplementowane w `auth-store.js`.

### 2.4 Przechowywanie sesji

| Element | Gdzie | Dlaczego |
|---------|-------|----------|
| Session ID (signed) | HttpOnly, Secure, SameSite=Strict cookie | Niedostępny dla JS |
| Session data | Tabela `sessions` w PostgreSQL | Trwałość, łatwe unieważnianie |
| Session secret | Env var `ALTIVOR_SESSION_SECRET` | Nigdy w kodzie |

---

## 3. Integracja istniejącego UI bez zmiany designu

### 3.1 Istniejące elementy (nie zmieniamy wizualnie)

| Element | Selektor |
|---------|----------|
| Login button (nav) | `#openLoginBtn` |
| Register button (nav) | `#openRegisterBtn` |
| Login modal | `#loginModal` → `.auth-modal` |
| Register modal | `#registerModal` → `.auth-modal--wide` |
| Login form | `#loginForm` |
| Register form | `#registerForm` |
| Submit buttons | `.auth-submit` |
| Password error | `#regPwError` |
| Consent error | `#regConsentError` |
| Forgot password | `.auth-forgot-link` |
| Verify email page | `verify-email.html` |

### 3.2 Podpięcie przycisków — już działa

```
Register → openModal('registerModal') → handleRegister(event) → submitRegisterForm()
Login → openModal('loginModal') → handleLogin(event) → submitLoginForm()
```

Auth IIFE w `script.js` nadpisuje `window.handleLogin` / `window.handleRegister`.
Dodatkowo `interceptAuthSubmit` przechwytuje submit na capture phase.

### 3.3 Stany interakcji

**Loading state** — dodać do CSS (bez zmiany designu):

```css
.auth-submit[disabled] { opacity: 0.6; cursor: not-allowed; pointer-events: none; }
.auth-submit.is-loading { position: relative; color: transparent; }
.auth-submit.is-loading::after {
    content: ''; position: absolute; width: 18px; height: 18px;
    top: 50%; left: 50%; margin: -9px 0 0 -9px;
    border: 2px solid currentColor; border-right-color: transparent;
    border-radius: 50%; animation: auth-spin 0.6s linear infinite;
}
@keyframes auth-spin { to { transform: rotate(360deg); } }
```

Rozszerzenie `setFormBusy()`:
```javascript
function setFormBusy(form, busy) {
    var submitBtn = form.querySelector('.auth-submit');
    form.querySelectorAll('button, input').forEach(el => { el.disabled = Boolean(busy); });
    if (submitBtn) submitBtn.classList.toggle('is-loading', Boolean(busy));
}
```

**Error state** — już zaimplementowane: `setFormStatus()` tworzy `[data-auth-status]` z klasą `.auth-field-error.visible`.

**Success — rejestracja:** `closeModal()` → redirect na `verify-email.html`.
**Success — logowanie:** `updateAuthUi()` → ukrywa Login/Register, pokazuje Logout.

### 3.4 Debounce

Obecne `setFormBusy(true)` disabluje inputy. Dodatkowy guard:

```javascript
let _loginInFlight = false;
async function submitLoginForm(form) {
    if (_loginInFlight) return;
    _loginInFlight = true;
    try { /* ... */ } finally { _loginInFlight = false; setFormBusy(form, false); }
}
```

Analogicznie dla register.

### 3.5 Komunikaty

| Sytuacja | Komunikat | Gdzie |
|----------|-----------|-------|
| Rejestracja sukces | Redirect → verify-email.html | Osobna strona |
| Istniejący email | "An account with this email already exists." | `[data-auth-status]` |
| Hasła nie pasują | "Passwords do not match." | `#regPwError` |
| Login sukces | Modal zamknięty, UI update | Brak komunikatu |
| Błędne dane login | "Invalid email or password." | `[data-auth-status]` |
| Niezweryfikowany | "Please verify your email..." | `[data-auth-status]` |
| Konto zablokowane | "This account is blocked." | `[data-auth-status]` |
| Konto locked | "Account temporarily locked. Try again in X min." | `[data-auth-status]` |
| Rate limit | "Too many attempts. Please try again later." | `[data-auth-status]` |
| Sieć | "Network error. Please try again." | `[data-auth-status]` |

Kontynuacja specyfikacji → `AUTH-SYSTEM-SPEC-PART2.md`
