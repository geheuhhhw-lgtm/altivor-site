# ALTIVOR — Specyfikacja Auth (Część 4)

---

## 13. Przykładowa implementacja

### 13.1 `register()` — backend

```javascript
async function registerUser(payload) {
    const input = validateRegisterPayload(payload || {});

    // Rate limit sprawdzony wcześniej w route handler

    const passwordHash = await hashPassword(input.password);
    const verification = generateVerificationToken();
    const tokenHash = hashToken(verification.token);
    const userId = createId('usr_');
    const now = new Date().toISOString();

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const insertResult = await client.query(`
            INSERT INTO users (
                id, first_name, last_name, username, address,
                email, email_normalized, password_hash,
                role, email_verified, account_status,
                subscription_status, challenge_status,
                failed_login_attempts, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,'active','inactive','none',0,$10,$10)
            ON CONFLICT (email_normalized) DO NOTHING
            RETURNING id, first_name, last_name, username, email, role,
                      email_verified, subscription_status, challenge_status,
                      account_status, created_at, updated_at, last_login_at
        `, [
            userId, input.firstName, input.lastName, input.username, input.address,
            input.email, input.email, passwordHash,
            isAdminEmail(input.email) ? 'admin' : 'user',
            now
        ]);

        if (insertResult.rows.length === 0) {
            await client.query('ROLLBACK');
            throw createHttpError(409, 'An account with this email already exists.');
        }

        await client.query(`
            INSERT INTO email_verification_tokens (user_id, token_hash, expires_at, created_at)
            VALUES ($1, $2, $3, NOW())
        `, [userId, tokenHash, verification.expiresAt]);

        await client.query(`
            INSERT INTO auth_audit_log (user_id, action, ip_address, metadata, created_at)
            VALUES ($1, 'register', $2, $3, NOW())
        `, [userId, null, JSON.stringify({ email: input.email })]);

        await client.query('COMMIT');

        return {
            user: sanitizeRow(insertResult.rows[0]),
            verificationToken: verification.token
        };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        // Obsługa unique violation jako fallback
        if (err.code === '23505' && String(err.constraint).includes('email')) {
            throw createHttpError(409, 'An account with this email already exists.');
        }
        throw err;
    } finally {
        client.release();
    }
}
```

### 13.2 `login()` — backend

```javascript
async function authenticateUser(email, password, reqMeta) {
    const emailNormalized = normalizeEmail(email);
    const passwordValue = String(password || '');

    if (!isValidEmail(emailNormalized) || !passwordValue) {
        throw createHttpError(400, 'Email and password are required.');
    }

    const userResult = await db.query(
        'SELECT * FROM users WHERE email_normalized = $1 AND deleted_at IS NULL',
        [emailNormalized]
    );
    const user = userResult.rows[0];

    if (!user || !user.password_hash) {
        // Timing attack mitigation — hash dummy password
        await hashPassword('dummy-password-to-waste-time');
        throw createHttpError(401, 'Invalid email or password.');
    }

    // Lockout check
    if (user.account_status === 'locked' && user.locked_until) {
        const lockedUntil = new Date(user.locked_until);
        if (lockedUntil > new Date()) {
            const minutesLeft = Math.ceil((lockedUntil - Date.now()) / 60000);
            throw createHttpError(423, `Account temporarily locked. Try again in ${minutesLeft} minute(s).`);
        }
        // Lockout expired — will be reset after successful password check
    }

    // Password verification
    const { valid, needsRehash } = await verifyPassword(passwordValue, user.password_hash);

    if (!valid) {
        await incrementFailedLoginAttempts(user.id);
        await auditLog(user.id, 'login_failed', reqMeta);
        throw createHttpError(401, 'Invalid email or password.');
    }

    // Success — reset failed attempts
    await resetFailedLoginAttempts(user.id);

    // Rehash legacy scrypt → argon2id
    if (needsRehash) {
        const newHash = await hashPassword(passwordValue);
        await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, user.id]);
    }

    // Email verified?
    if (!user.email_verified) {
        throw createHttpError(403, 'Please verify your email address before logging in. Check your inbox for the verification link.');
    }

    // Account active?
    if (user.account_status === 'blocked') {
        throw createHttpError(403, 'This account is blocked.');
    }

    // Update last_login_at
    await db.query('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);

    await auditLog(user.id, 'login_success', reqMeta);

    return sanitizeRow(user);
}
```

### 13.3 `checkEmailUnique()` — backend

```javascript
async function checkEmailUnique(email) {
    const emailNormalized = normalizeEmail(email);
    if (!isValidEmail(emailNormalized)) {
        throw createHttpError(400, 'Enter a valid email address.');
    }
    const result = await db.query(
        'SELECT id FROM users WHERE email_normalized = $1 LIMIT 1',
        [emailNormalized]
    );
    return result.rows.length === 0;
}
```

Uwaga: Ta funkcja NIE jest eksponowana jako publiczny endpoint (information leakage). Używana wewnętrznie jako pre-check przed INSERT.

### 13.4 `verifyEmail()` — backend

```javascript
async function verifyEmailToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
        throw createHttpError(400, 'Invalid verification token.');
    }

    const tokenHash = hashToken(rawToken);

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const tokenResult = await client.query(
            'SELECT * FROM email_verification_tokens WHERE token_hash = $1',
            [tokenHash]
        );

        if (tokenResult.rows.length === 0) {
            await client.query('ROLLBACK');
            throw createHttpError(400, 'Invalid verification token.');
        }

        const tokenRow = tokenResult.rows[0];

        if (new Date(tokenRow.expires_at) <= new Date()) {
            await client.query('ROLLBACK');
            throw createHttpError(400, 'Verification token has expired. Please request a new one.');
        }

        await client.query(
            'UPDATE users SET email_verified = true, email_verified_at = NOW(), updated_at = NOW() WHERE id = $1',
            [tokenRow.user_id]
        );

        await client.query(
            'DELETE FROM email_verification_tokens WHERE user_id = $1',
            [tokenRow.user_id]
        );

        await client.query(
            `INSERT INTO auth_audit_log (user_id, action, created_at) VALUES ($1, 'email_verified', NOW())`,
            [tokenRow.user_id]
        );

        await client.query('COMMIT');
        return { userId: tokenRow.user_id };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}
```

### 13.5 `forgotPassword()` — backend

```javascript
async function forgotPassword(email, reqMeta) {
    const emailNormalized = normalizeEmail(email);

    if (!isValidEmail(emailNormalized)) {
        throw createHttpError(400, 'Enter a valid email address.');
    }

    // ZAWSZE zwracamy sukces — nie ujawniamy istnienia konta
    const GENERIC_MESSAGE = 'If an account exists with that email, a password reset link has been sent.';

    const userResult = await db.query(
        'SELECT id, first_name, email, email_verified FROM users WHERE email_normalized = $1 AND deleted_at IS NULL',
        [emailNormalized]
    );
    const user = userResult.rows[0];

    // Jeśli user nie istnieje lub niezweryfikowany — zwróć generyczny msg, nie rób nic
    if (!user || !user.email_verified) {
        return { message: GENERIC_MESSAGE };
    }

    // Unieważnij stare tokeny
    await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

    // Generuj nowy token
    const reset = generatePasswordResetToken();
    const tokenHash = hashToken(reset.token);

    await db.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, NOW())',
        [user.id, tokenHash, reset.expiresAt]
    );

    await auditLog(user.id, 'password_reset_requested', reqMeta);

    // Fire-and-forget email
    const resetUrl = `${BASE_URL}/reset-password.html?token=${encodeURIComponent(reset.token)}`;
    sendPasswordResetEmail(user, resetUrl).catch(err => {
        console.error('[auth] Failed to send reset email:', err.message);
    });

    return { message: GENERIC_MESSAGE };
}
```

### 13.6 `resetPassword()` — backend

```javascript
async function resetPassword(payload) {
    const rawToken = String(payload.token || '');
    const password = String(payload.password || '');
    const passwordConfirm = String(payload.passwordConfirm || '');

    if (!rawToken) {
        throw createHttpError(400, 'Invalid or expired reset link.');
    }

    // Walidacja siły hasła
    if (password.length < 8) throw createHttpError(400, 'Password must be at least 8 characters.');
    if (password.length > 128) throw createHttpError(400, 'Password is too long.');
    if (!/[A-Z]/.test(password)) throw createHttpError(400, 'Password must contain at least one uppercase letter.');
    if (!/[0-9]/.test(password)) throw createHttpError(400, 'Password must contain at least one number.');
    if (!/[^a-zA-Z0-9]/.test(password)) throw createHttpError(400, 'Password must contain at least one special character.');
    if (password !== passwordConfirm) throw createHttpError(400, 'Passwords do not match.');

    const tokenHash = hashToken(rawToken);

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const tokenResult = await client.query(
            'SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL',
            [tokenHash]
        );

        if (tokenResult.rows.length === 0) {
            await client.query('ROLLBACK');
            throw createHttpError(400, 'Invalid or expired reset link.');
        }

        const tokenRow = tokenResult.rows[0];

        if (new Date(tokenRow.expires_at) <= new Date()) {
            await client.query('ROLLBACK');
            throw createHttpError(400, 'Reset link has expired. Please request a new one.');
        }

        const newHash = await hashPassword(password);

        // Update hasła
        await client.query(
            'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [newHash, tokenRow.user_id]
        );

        // Unieważnij WSZYSTKIE sesje tego usera
        await client.query('DELETE FROM sessions WHERE user_id = $1', [tokenRow.user_id]);

        // Unieważnij WSZYSTKIE tokeny resetu
        await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [tokenRow.user_id]);

        // Audit
        await client.query(
            `INSERT INTO auth_audit_log (user_id, action, created_at) VALUES ($1, 'password_reset_completed', NOW())`,
            [tokenRow.user_id]
        );

        await client.query('COMMIT');

        return { message: 'Password has been reset successfully. You can now sign in with your new password.' };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}
```

### 13.7 Helper functions

```javascript
const crypto = require('crypto');

function createId(prefix) {
    return `${prefix}${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')}`;
}

function normalizeEmail(v) {
    return String(v || '').trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function generateVerificationToken() {
    return {
        token: crypto.randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
}

function generatePasswordResetToken() {
    return {
        token: crypto.randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()  // 1h
    };
}

function createHttpError(statusCode, message) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

async function auditLog(userId, action, meta) {
    try {
        await db.query(
            'INSERT INTO auth_audit_log (user_id, action, ip_address, user_agent, metadata, created_at) VALUES ($1,$2,$3,$4,$5,NOW())',
            [userId, action, meta?.ip || null, meta?.userAgent || null, meta?.extra ? JSON.stringify(meta.extra) : null]
        );
    } catch (err) {
        console.error('[audit] Failed to log:', action, err.message);
    }
}
```

---

## 14. Testy

### 14.1 Unit tests

Framework: `jest` lub `node:test`.

| Test | Opis |
|------|------|
| `normalizeEmail` | `" John@Example.COM " → "john@example.com"` |
| `isValidEmail` | Poprawne i niepoprawne formaty |
| `hashPassword / verifyPassword` | Round-trip: hash → verify = true |
| `verifyPassword` (legacy) | scrypt hash → verify = true + needsRehash |
| `hashToken` | Deterministyczny SHA-256 |
| `generateVerificationToken` | 64 hex chars, expiresAt w przyszłości |
| `generatePasswordResetToken` | 64 hex chars, expiresAt = +1h |
| `validateRegisterPayload` | Poprawne dane → OK, brak pól → error, słabe hasło → error |
| `buildSignedSessionId / verify` | Signature match + tamper detection |
| `rateLimit` | Limit nie przekroczony → OK, przekroczony → throw 429 |
| `createHttpError` | Poprawny statusCode i message |

### 14.2 Integration tests

| Test | Opis |
|------|------|
| **Poprawna rejestracja** | POST /auth/register z poprawnymi danymi → 201, user w DB, token w DB, email wysłany |
| **Rejestracja na istniejący email** | POST /auth/register z duplikatem → 409, jeden user w DB |
| **Równoczesna rejestracja (ten sam email)** | 2x POST /auth/register równocześnie → jeden 201, drugi 409, jeden user w DB |
| **Poprawne logowanie** | POST /auth/login z poprawnymi danymi → 200, Set-Cookie, session w DB |
| **Błędne hasło** | POST /auth/login z złym hasłem → 401, failed_login_attempts++ |
| **Login kontem niezweryfikowanym** | POST /auth/login → 403 |
| **Login kontem zablokowanym** | POST /auth/login → 403 |
| **Account lockout** | 5x błędne hasło → konto locked, 6. próba → 423 |
| **Lockout expiry** | Po 15 min → ponowne logowanie OK |
| **Weryfikacja emaila** | GET /auth/verify-email?token=valid → user.email_verified=true, token usunięty |
| **Wygasły token weryfikacyjny** | GET /auth/verify-email?token=expired → error |
| **Resend verification** | POST /auth/resend-verification → nowy token, stary nadpisany |
| **Resend cooldown** | POST /auth/resend-verification 2x w 30s → 429 |
| **Reset hasła — pełny flow** | forgot → reset → login z nowym hasłem OK |
| **Reset hasła — stare sesje** | Po resecie → stare sesje usunięte, GET /auth/me → unauthenticated |
| **Reset hasła — wygasły token** | POST /auth/reset-password z expired token → 400 |
| **Reset hasła — użyty token** | POST /auth/reset-password 2x → pierwszy OK, drugi 400 |
| **Logout** | POST /auth/logout → sesja usunięta, cookie wyczyszczony |
| **GET /auth/me z sesją** | → 200 { authenticated: true } |
| **GET /auth/me bez sesji** | → 200 { authenticated: false } |

### 14.3 E2E tests

Framework: Playwright.

| Test | Opis |
|------|------|
| **Register happy path** | Klik Register → wypełnij formularz → submit → redirect verify-email.html |
| **Register — password mismatch** | Wpisz różne hasła → błąd inline, formularz nie wysłany |
| **Register — weak password** | Wpisz krótkie hasło → błąd inline |
| **Register — no consent** | Odznacz checkbox → błąd, scroll do consent |
| **Register — duplicate email** | Zarejestruj 2x ten sam email → komunikat pod formularzem |
| **Login happy path** | Klik Login → wpisz dane → submit → modal zamknięty, Logout visible |
| **Login — wrong password** | Wpisz złe hasło → komunikat błędu, hasło wyczyszczone |
| **Login — unverified** | Login bez weryfikacji → komunikat "verify email" |
| **Forgot password** | Klik "Forgot password?" → formularz email → submit → komunikat sukcesu |
| **Reset password** | Otwórz /reset-password.html?token=valid → formularz → submit → sukces |
| **Verify email** | Otwórz /api/auth/verify-email?token=valid → redirect → "Email Verified" |
| **Loading state** | Submit formularza → button disabled + spinner → po odpowiedzi normalne |
| **Modal close on Escape** | Otwórz modal → naciśnij Escape → modal zamknięty |
| **Modal close on backdrop** | Klik tło → modal zamknięty |
| **Remember me** | Zaloguj z "Remember me" → zamknij browser → otwórz → email pre-filled |
| **Logout** | Zaloguj → klik Logout → Login/Register visible, Logout hidden |
| **Auth state persistence** | Zaloguj → refresh strony → nadal zalogowany (GET /auth/me) |

### 14.4 Przykładowe testy (pseudokod)

```javascript
// Unit test: normalizeEmail
test('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail(' John@Example.COM ')).toBe('john@example.com');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
});

// Integration test: register + duplicate
test('register rejects duplicate email', async () => {
    const payload = { firstName:'A', lastName:'B', username:'ab', address:'X',
                      email:'test@test.com', password:'SecureP@1', passwordConfirm:'SecureP@1', consent:true };
    const r1 = await request.post('/api/auth/register').send(payload);
    expect(r1.status).toBe(201);
    const r2 = await request.post('/api/auth/register').send(payload);
    expect(r2.status).toBe(409);
    expect(r2.body.error).toContain('already exists');
});

// Integration test: concurrent register
test('concurrent register — only one succeeds', async () => {
    const payload = { firstName:'C', lastName:'D', username:'cd', address:'Y',
                      email:'race@test.com', password:'SecureP@1', passwordConfirm:'SecureP@1', consent:true };
    const [r1, r2] = await Promise.all([
        request.post('/api/auth/register').send(payload),
        request.post('/api/auth/register').send(payload),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
});

// Integration test: login invalidates old sessions after reset
test('password reset invalidates all sessions', async () => {
    // Setup: registered + verified user with active session
    const loginRes = await request.post('/api/auth/login').send({ email, password });
    const cookie = loginRes.headers['set-cookie'];
    
    // Trigger password reset
    await forgotPassword(email);
    const token = getResetTokenFromDB(email);
    await request.post('/api/auth/reset-password').send({ token, password: 'NewP@ss1', passwordConfirm: 'NewP@ss1' });
    
    // Old session should be invalid
    const meRes = await request.get('/api/auth/me').set('Cookie', cookie);
    expect(meRes.body.authenticated).toBe(false);
    
    // New password should work
    const newLogin = await request.post('/api/auth/login').send({ email, password: 'NewP@ss1' });
    expect(newLogin.status).toBe(200);
});
```

---

## 15. Wdrożenie produkcyjne

### 15.1 SMTP / dostawca emaili

**Wybór: Amazon SES lub Postmark** dla produkcji. Gmail SMTP dla dev/staging.

| Środowisko | Provider | Konfiguracja |
|------------|----------|-------------|
| dev | Gmail SMTP / console fallback | `SMTP_HOST=smtp.gmail.com`, App Password |
| staging | Amazon SES (sandbox) | Zweryfikowane adresy only |
| production | Amazon SES / Postmark | Domain verified, DKIM, SPF, DMARC |

Obecny fallback (console log gdy brak SMTP) — zachować dla dev.

### 15.2 Zmienne środowiskowe

```env
# ─── Core ────────────────────────────────────────────────
NODE_ENV=production                       # production | staging | development
PORT=8090
ALTIVOR_BASE_URL=https://altivor.institute

# ─── Session ─────────────────────────────────────────────
ALTIVOR_SESSION_SECRET=<64-char-random>   # WYMAGANE w produkcji, nie auto-generate

# ─── Database ────────────────────────────────────────────
DATABASE_URL=postgres://user:pass@host:5432/altivor?sslmode=require

# ─── SMTP ────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@altivor.institute
SMTP_PASS=<app-password>
SMTP_FROM=ALTIVOR INSTITUTE <noreply@altivor.institute>

# ─── CAPTCHA ─────────────────────────────────────────────
HCAPTCHA_SITEKEY=<sitekey>
HCAPTCHA_SECRET=<secret>

# ─── Rate limiting (opcjonalnie Redis) ───────────────────
REDIS_URL=redis://localhost:6379          # Opcjonalne, fallback na in-memory
```

### 15.3 Przechowywanie sekretów

| Sekret | Gdzie | Nigdy |
|--------|-------|-------|
| `ALTIVOR_SESSION_SECRET` | Env var, secrets manager (Vault/AWS SSM) | W kodzie, w repo, w logach |
| `SMTP_PASS` | Env var, secrets manager | W kodzie |
| `DATABASE_URL` | Env var, secrets manager | W kodzie |
| `HCAPTCHA_SECRET` | Env var | W kodzie, w frontendzie |

**Produkcja:** Użyć AWS Secrets Manager, HashiCorp Vault, lub Fly.io secrets.
**Nigdy:** commity `.env` do repo (`.gitignore`), logi z hasłami/tokenami.

### 15.4 Logowanie zdarzeń

| Zdarzenie | Poziom | Dane logowane | Dane NIGDY nie logowane |
|-----------|--------|--------------|------------------------|
| Rejestracja sukces | INFO | userId, email, timestamp | hasło |
| Rejestracja fail (duplikat) | WARN | email, timestamp | — |
| Login sukces | INFO | userId, email, IP, timestamp | hasło, cookie |
| Login fail | WARN | email, IP, timestamp, reason | hasło |
| Account lockout | WARN | userId, email, IP, failedAttempts | — |
| Email verified | INFO | userId, timestamp | token |
| Password reset requested | INFO | email (nie userId — nie ujawniamy), timestamp | — |
| Password reset completed | INFO | userId, timestamp | hasło, token |
| Session created | DEBUG | sessionId, userId, IP | — |
| Session destroyed | DEBUG | sessionId | — |
| SMTP error | ERROR | email (to), error message | token, link |
| Rate limit hit | WARN | IP, endpoint, count | — |

**Dane NIGDY nie logowane:** hasła (plaintext), tokeny (raw), session cookies, pełne requesty body.

### 15.5 Monitoring błędów

**Narzędzie:** Sentry (lub Datadog, Bugsnag).

```javascript
// Integracja Sentry w server.js:
const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV });

// W catch blocks:
catch (error) {
    if (error.statusCode >= 500) Sentry.captureException(error);
    // ... respond to client
}
```

### 15.6 Ochrona przed spamem rejestracyjnym

1. **Rate limiting:** 5 rejestracji/IP/godzinę.
2. **hCaptcha:** na formularzu rejestracji — zawsze.
3. **Email verification:** konto bezużyteczne bez weryfikacji.
4. **Honeypot field (opcjonalnie):** ukryte pole w formularzu — jeśli wypełnione → odrzuć (bot).
5. **Cron cleanup:** usuwanie niezweryfikowanych kont starszych niż 7 dni.

```sql
-- Co 24h:
DELETE FROM users WHERE email_verified = false AND created_at < NOW() - INTERVAL '7 days';
```

### 15.7 Rate limit per endpoint

| Endpoint | Limit | Okno | Klucz |
|----------|-------|------|-------|
| POST /auth/register | 5 | 60 min | IP |
| POST /auth/login | 10 | 15 min | IP |
| POST /auth/login | 5 | 15 min | email (account lockout) |
| POST /auth/forgot-password | 3 | 60 min | IP |
| POST /auth/resend-verification | 3 | 60 min | IP + email cooldown 60s |
| POST /auth/reset-password | 5 | 60 min | IP |

### 15.8 Środowiska

| Cecha | dev | staging | production |
|-------|-----|---------|------------|
| DB | SQLite / local PG | PG (cloud) | PG (cloud, replicas) |
| SMTP | Console fallback | SES sandbox | SES / Postmark |
| Session secret | Auto-generated | Static env var | Secrets manager |
| CAPTCHA | Disabled | Enabled (test keys) | Enabled (production keys) |
| Rate limiting | Relaxed (100x) | Normal | Normal |
| Secure cookie | No (HTTP) | Yes | Yes |
| Sentry | Disabled | Enabled | Enabled |
| Audit log | Console | DB | DB + export |
| HTTPS | No | Yes (TLS) | Yes (TLS) |

### 15.9 Logi audytowe vs operacyjne

| Typ | Przechowywanie | Retencja | Przykłady |
|-----|---------------|----------|-----------|
| **Audit log** (tabela `auth_audit_log`) | DB, archiwizacja | Min 1 rok (regulacje) | register, login, logout, verify, reset, block |
| **Logi operacyjne** (stdout/file) | Log aggregator (ELK/Datadog) | 30-90 dni | Requesty HTTP, błędy, SMTP errors |
| **Logi NIGDY nie przechowywane** | — | — | Hasła, raw tokeny, pełne cookies |

### 15.10 Metryki do monitorowania

| Metryka | Cel | Alert |
|---------|-----|-------|
| Rejestracje/dzień | Wzrost/spadek adoption | Spike > 10x = bot attack |
| Login success rate | Health check auth | < 80% = problem |
| Login failure rate | Brute-force detection | > 50 failed/min = alert |
| Account lockouts/h | Brute-force monitoring | > 10 = investigate |
| Email delivery rate | SMTP health | < 95% = SMTP problem |
| Email bounce rate | List hygiene | > 5% = investigate |
| Session count | Active users | — |
| Password reset requests/h | Anomaly detection | Spike > 5x = phishing |
| API latency p95 | Performance | > 2s = investigate |
| DB connection pool | Infrastructure | > 80% utilized = scale |
| Rate limit hits/h | Abuse detection | Spike = attack |
| Verification completion rate | Funnel health | < 50% = email delivery issue |

---

## Podsumowanie decyzji architektonicznych

| Decyzja | Wybór | Uzasadnienie |
|---------|-------|-------------|
| Autoryzacja | Session cookie (HttpOnly) | XSS-proof, instant revocation, prostota |
| Hashowanie haseł | Argon2id | OWASP recommendation, GPU-resistant |
| Baza danych | PostgreSQL | Transakcje, indeksy, constrainty, produkcyjny |
| Session store | PostgreSQL table | Trwałość przy restarcie, łatwe unieważnianie |
| Token storage | SHA-256 hash w DB | Ochrona przed DB leak |
| Email verification | Obowiązkowa, 24h TTL | Warunek dostępu, anti-spam |
| Password reset TTL | 1 godzina | Krótsze okno ataku |
| Rate limiting | Per-IP, in-memory (Redis prod) | Ochrona przed brute-force i spam |
| CAPTCHA | hCaptcha | GDPR-friendly, darmowy |
| Email reuse po soft-delete | NIE | Ochrona danych powiązanych z emailem |
| 2FA | Nie w MVP, architektura gotowa | Przyszłościowe rozszerzenie |
| Monitoring | Sentry + audit log | Produkcyjne wymagania |
| Frontend design | Bez zmian wizualnych | Tylko logika, walidacja, stany interakcji |
