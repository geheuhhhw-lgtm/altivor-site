# ALTIVOR — Specyfikacja Auth (Część 3)

---

## 8. Backend API — kompletna referencja

### 8.1 `POST /api/auth/register`

**Cel:** Tworzenie nowego konta.

**Request:**
```json
{
    "firstName": "John",
    "lastName": "Doe",
    "username": "johndoe_trader",
    "email": "John@Example.COM",
    "address": "123 Main Street, London, UK",
    "password": "SecureP@ss1",
    "passwordConfirm": "SecureP@ss1",
    "consent": true
}
```

**Walidacja:** Wszystkie pola wymagane. Email: format + normalize. Password: min 8, 1 upper, 1 digit, 1 special, max 128. passwordConfirm === password. consent === true.

**201 Created:**
```json
{
    "authenticated": false,
    "user": {
        "id": "usr_a1b2c3d4",
        "firstName": "John",
        "lastName": "Doe",
        "username": "johndoe_trader",
        "email": "john@example.com",
        "role": "user",
        "emailVerified": false,
        "subscriptionStatus": "inactive",
        "challengeStatus": "none",
        "accountStatus": "active",
        "createdAt": "2026-03-24T14:05:00.000Z",
        "updatedAt": "2026-03-24T14:05:00.000Z",
        "lastLoginAt": null
    },
    "message": "Registration successful. Please check your email to verify your account."
}
```

**Errors:** `400` (walidacja), `409` (duplikat email), `429` (rate limit).

---

### 8.2 `POST /api/auth/login`

**Cel:** Uwierzytelnienie + utworzenie sesji.

**Request:**
```json
{ "email": "john@example.com", "password": "SecureP@ss1", "remember": false }
```

**Walidacja:** email nie pusty + format. password nie pusty.

**200 OK:**
```
Set-Cookie: altivor_session=sess_xyz.hmac; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
```
```json
{
    "authenticated": true,
    "user": {
        "id": "usr_a1b2c3d4",
        "firstName": "John",
        "lastName": "Doe",
        "username": "johndoe_trader",
        "email": "john@example.com",
        "role": "user",
        "emailVerified": true,
        "subscriptionStatus": "active",
        "challengeStatus": "active",
        "accountStatus": "active",
        "createdAt": "2026-03-24T14:05:00.000Z",
        "updatedAt": "2026-03-24T15:00:00.000Z",
        "lastLoginAt": "2026-03-24T15:00:00.000Z"
    }
}
```

`remember: true` → Max-Age=2592000 (30d). `false` → Max-Age=604800 (7d).

**Errors:** `400` (puste pola), `401` (zły email/hasło), `403` (niezweryfikowany / zablokowany), `423` (lockout), `429` (rate limit).

---

### 8.3 `POST /api/auth/logout`

**Cel:** Zakończenie sesji.

**Request:** Brak body. Cookie `altivor_session` wymagany.

**200 OK:**
```
Set-Cookie: altivor_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0
```
```json
{ "authenticated": false, "user": null }
```

Zawsze 200 — nawet bez aktywnej sesji.

---

### 8.4 `POST /api/auth/forgot-password`

**Cel:** Inicjacja resetu hasła.

**Request:**
```json
{ "email": "john@example.com" }
```

**200 OK (ZAWSZE — nie ujawnia istnienia konta):**
```json
{ "message": "If an account exists with that email, a password reset link has been sent." }
```

**Errors:** `400` (zły format email), `429` (rate limit).

---

### 8.5 `POST /api/auth/reset-password`

**Cel:** Ustawienie nowego hasła.

**Request:**
```json
{
    "token": "abc123def456...",
    "password": "NewSecureP@ss2",
    "passwordConfirm": "NewSecureP@ss2"
}
```

**200 OK:**
```json
{ "message": "Password has been reset successfully. You can now sign in with your new password." }
```

**Errors:** `400` (token invalid/expired, słabe hasło, hasła nie pasują).

---

### 8.6 `GET /api/auth/verify-email?token=...`

**Cel:** Weryfikacja emaila z linku.

**Sukces:** `302 → /verify-email.html?status=success`

**Error:** `302 → /verify-email.html?status=error&message=<url_encoded>`

---

### 8.7 `POST /api/auth/resend-verification`

**Cel:** Ponowna wysyłka emaila weryfikacyjnego.

**Request:**
```json
{ "email": "john@example.com" }
```

**200 OK:**
```json
{ "message": "If an unverified account exists with that email, a verification link has been sent." }
```

**Errors:** `400` (zły format, już zweryfikowany), `429` (cooldown 60s).

---

### 8.8 `GET /api/auth/me`

**Cel:** Stan aktualnej sesji.

**Zalogowany (200):**
```json
{ "authenticated": true, "user": { ... } }
```

**Niezalogowany (200):**
```json
{ "authenticated": false, "user": null }
```

---

## 9. Baza danych i modele

### 9.1 Decyzja: migracja JSON → PostgreSQL

**Obecne:** `data/users.json` + in-memory `Map()` sesji.

**Problemy:** brak transakcji, brak indeksów (O(n) lookup), utrata sesji przy restarcie, brak constraintów, nie-produkcyjne.

**Docelowe:** PostgreSQL 16+ z `pg` (node-postgres).

### 9.2 Tabela `users`

```sql
CREATE TABLE users (
    id                    VARCHAR(64) PRIMARY KEY,
    first_name            VARCHAR(100) NOT NULL,
    last_name             VARCHAR(100) NOT NULL,
    username              VARCHAR(100) NOT NULL,
    address               TEXT NOT NULL DEFAULT '',
    email                 VARCHAR(320) NOT NULL,
    email_normalized      VARCHAR(320) NOT NULL,
    password_hash         TEXT NOT NULL,
    role                  VARCHAR(20) NOT NULL DEFAULT 'user',
    email_verified        BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified_at     TIMESTAMPTZ,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    account_status        VARCHAR(20) NOT NULL DEFAULT 'active'
                          CHECK (account_status IN ('active', 'locked', 'blocked')),
    subscription_status   VARCHAR(20) NOT NULL DEFAULT 'inactive'
                          CHECK (subscription_status IN ('inactive', 'active', 'suspended')),
    challenge_status      VARCHAR(20) NOT NULL DEFAULT 'none'
                          CHECK (challenge_status IN ('none','pending','active','qualified','disqualified')),
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until          TIMESTAMPTZ,
    deleted_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at         TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_users_email_normalized ON users (email_normalized);
CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_account_status ON users (account_status);
```

### 9.3 Tabela `email_verification_tokens`

```sql
CREATE TABLE email_verification_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(128) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_evt_user_id ON email_verification_tokens (user_id);
CREATE INDEX idx_evt_token_hash ON email_verification_tokens (token_hash);
```

Relacja: 1 user → 0..1 token (UNIQUE na user_id). Stary token zastępowany nowym.

### 9.4 Tabela `password_reset_tokens`

```sql
CREATE TABLE password_reset_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(128) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_prt_user_id ON password_reset_tokens (user_id);
CREATE INDEX idx_prt_token_hash ON password_reset_tokens (token_hash);
```

Relacja: 1 user → 0..1 token. Stary usuwany przed generowaniem nowego.

### 9.5 Tabela `sessions`

```sql
CREATE TABLE sessions (
    id          VARCHAR(64) PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);
```

Relacja: 1 user → 0..N sesji (wiele urządzeń).

### 9.6 Tabela `auth_audit_log`

```sql
CREATE TABLE auth_audit_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     VARCHAR(64),
    action      VARCHAR(50) NOT NULL,
    ip_address  INET,
    user_agent  TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aal_user_id ON auth_audit_log (user_id);
CREATE INDEX idx_aal_action ON auth_audit_log (action);
CREATE INDEX idx_aal_created_at ON auth_audit_log (created_at);
```

Relacja: NO CASCADE — audit zachowany nawet po usunięciu usera.

Akcje logowane: `register`, `login_success`, `login_failed`, `logout`, `email_verified`, `password_reset_requested`, `password_reset_completed`, `account_locked`, `account_blocked`.

### 9.7 Automatyczne czyszczenie (cron / scheduled)

```sql
-- Co godzinę:
DELETE FROM sessions WHERE expires_at < NOW();
DELETE FROM email_verification_tokens WHERE expires_at < NOW();
DELETE FROM password_reset_tokens WHERE expires_at < NOW();
```

---

## 10. Bezpieczeństwo

### 10.1 Hashowanie haseł

**Argon2id** — parametry w sekcji 4.2.

### 10.2 Polityka haseł

| Reguła | Wartość |
|--------|---------|
| Min długość | 8 znaków |
| Wymagane | 1 uppercase, 1 cyfra, 1 special char |
| Max długość | 128 znaków (ochrona przed DoS przy hashowaniu) |
| Opcjonalnie (przyszłość) | zxcvbn score ≥ 2 |

### 10.3 Rate limiting

| Endpoint | Limit | Okno |
|----------|-------|------|
| `POST /auth/login` | 10 req/IP | 15 min |
| `POST /auth/register` | 5 req/IP | 60 min |
| `POST /auth/forgot-password` | 3 req/IP | 60 min |
| `POST /auth/resend-verification` | 3 req/IP | 60 min |
| `POST /auth/reset-password` | 5 req/IP | 60 min |

Implementacja: in-memory `Map` per IP (produkcja: Redis).

```javascript
const rateLimits = new Map();
function rateLimit(key, maxReq, windowMs) {
    const now = Date.now();
    const entry = rateLimits.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
    entry.count++;
    rateLimits.set(key, entry);
    if (entry.count > maxReq) {
        const err = createHttpError(429, 'Too many requests. Please try again later.');
        err.retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        throw err;
    }
}
```

### 10.4 Account lockout

5 nieudanych prób → lockout 15 min. Patrz sekcja 5.3.

### 10.5 CAPTCHA

**Kiedy:**
- Rejestracja — zawsze.
- Forgot-password — zawsze.
- Login — po 3 failach z tego samego IP.

**Wybór:** hCaptcha (GDPR-friendly, darmowy).

```javascript
async function verifyCaptcha(token) {
    const r = await fetch('https://hcaptcha.com/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `response=${token}&secret=${process.env.HCAPTCHA_SECRET}`
    });
    return (await r.json()).success === true;
}
```

Frontend: `<div class="h-captcha" data-sitekey="...">` wewnątrz formularzy (nie zmienia designu — captcha renderuje się w kontenerze).

### 10.6 CSRF

Nie wymagany osobny token — `SameSite=Strict` cookie + JSON `Content-Type` (formularz HTML nie wysyła JSON bez JS, JS blokowany przez CORS).

Dodatkowy check nagłówka `Origin`:
```javascript
function validateOrigin(req) {
    const origin = req.headers.origin || '';
    const allowed = process.env.ALTIVOR_BASE_URL || 'http://localhost:8090';
    if (origin && !origin.startsWith(allowed)) throw createHttpError(403, 'Invalid origin.');
}
```

### 10.7 XSS

- Komunikaty błędów wstawiane przez `textContent` (nie `innerHTML`).
- Odpowiedzi API: `Content-Type: application/json`.
- Dane użytkownika escapowane w szablonach HTML.
- CSP header (rekomendacja): `Content-Security-Policy: default-src 'self'; script-src 'self'`.

### 10.8 SQL Injection

- Wszystkie zapytania: parametryzowane (`$1, $2, ...`), nigdy string concatenation.
- Biblioteka `pg` automatycznie escapuje parametry.

### 10.9 Bezpieczne przechowywanie tokenów

| Token | Przechowywanie w DB | W transporcie |
|-------|---------------------|---------------|
| Verification | SHA-256 hash | Plaintext w URL emaila (jednorazowy) |
| Password reset | SHA-256 hash | Plaintext w URL emaila (jednorazowy) |
| Session ID | Plaintext (ID) | HMAC-signed w HttpOnly cookie |

### 10.10 Cookie security

```
altivor_session=<signed_id>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
```

- **HttpOnly:** JS nie ma dostępu → eliminacja XSS kradzieży sesji.
- **Secure:** tylko HTTPS (w production).
- **SameSite=Strict:** brak wysyłania w cross-origin requestach.
- **HMAC signature:** `crypto.createHmac('sha256', SESSION_SECRET).update(sessionId)` → ochrona przed session ID forgery.

### 10.11 Email verification jako warunek dostępu

Niezweryfikowane konto:
- Nie może się zalogować (403).
- Nie ma sesji.
- Nie ma dostępu do żadnych zasobów chronionych.

### 10.12 2FA (przyszłościowe rozszerzenie)

Nie w MVP. Architektura gotowa:
- Pole `totp_secret` w tabeli `users` (encrypted).
- Po udanym login z hasłem → etap 2: formularz TOTP.
- Sesja tworzona dopiero po obu faktorach.
- Backup codes w osobnej tabeli.

---

## 11. Scenariusze brzegowe i wyjątki

### 11.1 Rejestracja na istniejący email

Backend: `ON CONFLICT DO NOTHING` → brak INSERT → `409 "An account with this email already exists."`.
Frontend: komunikat pod formularzem.

### 11.2 Dwa równoczesne requesty rejestracji

Patrz sekcja 6. `ON CONFLICT` + UNIQUE INDEX gwarantuje, że dokładnie jeden INSERT się powiedzie.

### 11.3 Login bez zweryfikowanego emaila

Backend sprawdza `email_verified` PO weryfikacji hasła (żeby nie ujawniać, czy konto istnieje).
Odpowiedź: `403 "Please verify your email address before logging in."`.

### 11.4 Błędne hasło wiele razy

1-4 próby: `401 "Invalid email or password."` + inkrementacja `failed_login_attempts`.
5. próba: `401` + lockout konta na 15 min.
6+ prób: `423 "Account temporarily locked. Try again in X min."`.
Po wygaśnięciu lockouta: reset `failed_login_attempts`, `account_status` → `active`.

### 11.5 Wygasły token aktywacyjny

`GET /api/auth/verify-email?token=...` → token w DB, ale `expires_at < NOW()`.
Redirect: `302 → /verify-email.html?status=error&message=Token+expired`.
Strona error z formularzem resend.

### 11.6 Wygasły token resetu hasła

`POST /api/auth/reset-password` → lookup w DB: `expires_at < NOW()`.
Odpowiedź: `400 "Invalid or expired reset link."`.
Strona error z linkiem "Request new reset".

### 11.7 Kilka resetów hasła uruchomionych równocześnie

`UNIQUE INDEX idx_prt_user_id` → max 1 token per user.
Przed INSERT nowego tokenu: `DELETE FROM password_reset_tokens WHERE user_id = $1`.
Stary token unieważniony, nowy aktywny.

### 11.8 Konto usunięte (soft-delete) lub zablokowane

**Soft-deleted:** `deleted_at IS NOT NULL` → `authenticateUser()` traktuje jak nieistniejące → `401`.
**Blocked:** `account_status = 'blocked'` → `403 "This account is blocked."` (po weryfikacji hasła).

### 11.9 Literówki i normalizacja emaila

- Frontend: `trim().toLowerCase()` przed wysłaniem.
- Backend: `normalizeEmail()` — ten sam `trim().toLowerCase()`.
- DB: kolumna `email_normalized` z UNIQUE INDEX.
- `John@Example.COM` → `john@example.com` na obu warstwach.
- Gmail `+` aliasing (`john+test@gmail.com` vs `john@gmail.com`): traktowane jako **różne adresy**. Nie stripujemy `+tag` — to celowa decyzja, bo nie wszystkie providery obsługują aliasing identycznie.

### 11.10 Inny email przy logowaniu niż przy rejestracji

Normalizacja rozwiązuje case/whitespace: `" John@Example.COM "` i `"john@example.com"` → to samo konto.
Jeśli user wpisuje zupełnie inny adres → `401 "Invalid email or password."` (konto nie istnieje).

---

## 12. Logika request lifecycle krok po kroku

### 12.1 Rejestracja

```
1. [Frontend] User klika "Register" → openModal('registerModal')
2. [Frontend] User wypełnia formularz
3. [Frontend] User klika "Create Account"
4. [Frontend] validateRegisterForm() — jeśli false → STOP, pokaż błąd
5. [Frontend] setFormBusy(true) — disable inputy, spinner na buttonie
6. [Frontend] fetch POST /api/auth/register z JSON body
7. [Backend]  parseRequestPayload() — parse JSON, limit 64KB
8. [Backend]  rateLimit('register:' + ip, 5, 3600000) — jeśli przekroczony → 429
9. [Backend]  validateRegisterPayload() — jeśli invalid → 400
10. [Backend] hashPassword(input.password) — Argon2id
11. [Backend] BEGIN TRANSACTION
12. [Backend] INSERT INTO users ... ON CONFLICT DO NOTHING RETURNING id
13. [Backend] Jeśli RETURNING puste → ROLLBACK → 409 "email already exists"
14. [Backend] generateVerificationToken() → hashToken()
15. [Backend] INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
16. [Backend] INSERT INTO auth_audit_log (user_id, 'register', ip, ua)
17. [Backend] COMMIT
18. [Backend] sendVerificationEmail(user, rawToken) — fire-and-forget
19. [Backend] sendJson(res, 201, { authenticated: false, user, message })
20. [Frontend] closeModalForForm(form) → form.reset()
21. [Frontend] window.location.href = '/verify-email.html'
```

**Rollback:** Jeśli krok 15 lub 16 fail → ROLLBACK, user NIE jest zapisany. Odpowiedź: `500`.

### 12.2 Logowanie

```
1.  [Frontend] User klika "Login" → openModal('loginModal')
2.  [Frontend] User wpisuje email + hasło
3.  [Frontend] User klika "Sign In"
4.  [Frontend] setFormBusy(true) — spinner
5.  [Frontend] fetch POST /api/auth/login z JSON body
6.  [Backend]  parseRequestPayload()
7.  [Backend]  rateLimit('login:' + ip, 10, 900000) — jeśli przekroczony → 429
8.  [Backend]  normalizeEmail(payload.email)
9.  [Backend]  SELECT * FROM users WHERE email_normalized = $1
10. [Backend]  Jeśli nie znaleziono → 401 "Invalid email or password."
11. [Backend]  Jeśli account_status='locked' i locked_until > NOW() → 423
12. [Backend]  verifyPassword(payload.password, user.password_hash)
13. [Backend]  Jeśli hasło złe → incrementFailedLoginAttempts() → 401
14. [Backend]  resetFailedLoginAttempts() — sukces, reset countera
15. [Backend]  Jeśli needsRehash → UPDATE password_hash (scrypt → argon2id)
16. [Backend]  Jeśli !email_verified → 403
17. [Backend]  Jeśli account_status='blocked' → 403
18. [Backend]  createId('sess_') → INSERT INTO sessions
19. [Backend]  UPDATE users SET last_login_at = NOW()
20. [Backend]  INSERT INTO auth_audit_log (user_id, 'login_success', ip, ua)
21. [Backend]  buildSignedSessionId() → buildCookie() → Set-Cookie header
22. [Backend]  sendJson(res, 200, { authenticated: true, user })
23. [Frontend] updateAuthUi(response.user) — ukryj Login/Register, pokaż Logout
24. [Frontend] Remember me → localStorage
25. [Frontend] closeModalForForm(form) → form.reset() → clearSensitiveFields()
```

**Sesja tworzona w kroku 18** — dopiero po WSZYSTKICH walidacjach.
**Email wysyłany:** nigdy (logowanie nie generuje emaili).

### 12.3 Weryfikacja emaila

```
1. [User]     Klika link w emailu → GET /api/auth/verify-email?token=abc
2. [Backend]  hashToken('abc') → SHA-256
3. [Backend]  SELECT * FROM email_verification_tokens WHERE token_hash = $hash
4. [Backend]  Jeśli nie znaleziono → 302 /verify-email.html?status=error&message=Invalid+token
5. [Backend]  Jeśli expires_at < NOW() → 302 ...?status=error&message=Token+expired
6. [Backend]  BEGIN TRANSACTION
7. [Backend]  UPDATE users SET email_verified=true, email_verified_at=NOW() WHERE id=$userId
8. [Backend]  DELETE FROM email_verification_tokens WHERE user_id=$userId
9. [Backend]  INSERT INTO auth_audit_log (user_id, 'email_verified', ...)
10. [Backend] COMMIT
11. [Backend] 302 → /verify-email.html?status=success
12. [Frontend] verify-email.html pokazuje "Email Verified" + link "Sign In"
```

### 12.4 Reset hasła

```
1.  [Frontend] User klika "Forgot password?" → showForgotPasswordForm()
2.  [Frontend] User wpisuje email → submit
3.  [Frontend] fetch POST /api/auth/forgot-password
4.  [Backend]  rateLimit('forgot:' + ip, 3, 3600000)
5.  [Backend]  normalizeEmail(email)
6.  [Backend]  SELECT * FROM users WHERE email_normalized = $1
7.  [Backend]  Jeśli nie znaleziono LUB !email_verified → SKIP (nie generuj tokenu)
8.  [Backend]  DELETE FROM password_reset_tokens WHERE user_id = $userId (stary token)
9.  [Backend]  generatePasswordResetToken() → hashToken()
10. [Backend]  INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
11. [Backend]  sendPasswordResetEmail(user, rawToken) — fire-and-forget
12. [Backend]  INSERT INTO auth_audit_log (user_id, 'password_reset_requested', ...)
13. [Backend]  200 "If an account exists, a reset link has been sent." — ZAWSZE
14. [Frontend] Pokazuje komunikat sukcesu (niezależnie od tego, czy konto istnieje)

15. [User]    Klika link w emailu → /reset-password.html?token=abc
16. [Frontend] Formularz: nowe hasło + potwierdzenie
17. [Frontend] Walidacja siły hasła (identyczna jak rejestracja)
18. [Frontend] fetch POST /api/auth/reset-password { token, password, passwordConfirm }
19. [Backend]  hashToken(token) → SELECT FROM password_reset_tokens WHERE token_hash=$hash AND expires_at > NOW() AND used_at IS NULL
20. [Backend]  Jeśli nie znaleziono → 400 "Invalid or expired reset link."
21. [Backend]  validateNewPassword(password, passwordConfirm)
22. [Backend]  hashPassword(password) — Argon2id
23. [Backend]  BEGIN TRANSACTION
24. [Backend]  UPDATE users SET password_hash = $newHash, updated_at = NOW()
25. [Backend]  DELETE FROM sessions WHERE user_id = $userId — unieważnij WSZYSTKIE sesje
26. [Backend]  DELETE FROM password_reset_tokens WHERE user_id = $userId
27. [Backend]  INSERT INTO auth_audit_log (user_id, 'password_reset_completed', ...)
28. [Backend]  COMMIT
29. [Backend]  200 "Password reset. You can now sign in."
30. [Frontend] Komunikat sukcesu + link "Sign In"
```

**Rollback:** Jeśli krok 25-27 fail → ROLLBACK, hasło NIE jest zmienione.

Kontynuacja → `AUTH-SYSTEM-SPEC-PART4.md`
