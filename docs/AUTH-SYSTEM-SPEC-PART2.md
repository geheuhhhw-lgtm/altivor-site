# ALTIVOR — Specyfikacja Auth (Część 2)

---

## 4. Rejestracja — pełny flow

### 4.1 Frontend

#### Kliknięcie „Register"
```
openModal('registerModal') → #registerModal.classList.add('active') → body.classList.add('modal-open')
```

#### Wymagane pola

| Pole | ID | Typ | Autocomplete | Walidacja |
|------|----|-----|-------------|-----------|
| First Name | `regFirstName` | text | given-name | required, min 1 char po trim |
| Last Name | `regLastName` | text | family-name | required, min 1 char po trim |
| Username | `regUsername` | text | username | required, min 1 char po trim |
| Email | `regEmail` | email | email | required, format email |
| Address | `regAddress` | text | street-address | required, min 1 char po trim |
| Password | `regPassword` | password | new-password | min 8, 1 uppercase, 1 cyfra, 1 special |
| Confirm Password | `regPasswordConfirm` | password | new-password | === Password |
| Consent | `regConsent` | checkbox | — | checked required |

#### Walidacja klienta

```javascript
function validateRegisterForm(form) {
    const pw = form.querySelector('[name="password"]').value;
    const pw2 = form.querySelector('[name="passwordConfirm"]').value;
    const consent = form.querySelector('[name="consent"]');
    const pwErr = document.getElementById('regPwError');
    const consentErr = document.getElementById('regConsentError');

    if (pw !== pw2) { showErr(pwErr, 'Passwords do not match.'); return false; }
    if (pw.length < 8 || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw) || !/[^a-zA-Z0-9]/.test(pw)) {
        showErr(pwErr, 'Min 8 chars, 1 uppercase, 1 number, 1 special character.');
        return false;
    }
    hideErr(pwErr);
    if (consent && !consent.checked) { showErr(consentErr); return false; }
    hideErr(consentErr);
    return true;
}
```

#### Normalizacja emaila (klient)
```javascript
payload.email = (payload.email || '').trim().toLowerCase();
```

#### Blokowanie submitu
Jeśli `validateRegisterForm()` → `false`, request nie jest wysyłany.

#### Request do API
```javascript
await requestJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
        firstName, lastName, username, email, address,
        password, passwordConfirm, consent: true
    })
});
```

### 4.2 Backend

#### Odbiór i walidacja
```javascript
const payload = await parseRequestPayload(req);  // limit 64KB
const input = validateRegisterPayload(payload);
```

Walidacja backendu (auth-store.js `validateRegisterPayload`):
- Wszystkie pola nie puste po trim.
- Email: `isValidEmail()` regex + normalize.
- Password: min 8 znaków, 1 uppercase, 1 cyfra, 1 special char, max 128 znaków.
- passwordConfirm === password.
- consent === true.

#### Normalizacja emaila (backend — zawsze)
```javascript
function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
```

#### Sprawdzenie unikalności + race condition

**Obecne (JSON store):** `withMutation()` serializuje operacje przez Promise queue.

**Docelowe (PostgreSQL):**
```sql
INSERT INTO users (id, first_name, last_name, username, address, email, email_normalized, password_hash, ...)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ...)
ON CONFLICT (email_normalized) DO NOTHING
RETURNING id;
```
Jeśli `RETURNING` puste → `409 Conflict`.

#### Hashowanie hasła

**Decyzja: Argon2id** (migracja ze scrypt).

Uzasadnienie: zwycięzca Password Hashing Competition, rekomendacja OWASP, odporny na GPU i side-channel.

```javascript
const argon2 = require('argon2');
const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 };

async function hashPassword(password) { return argon2.hash(password, ARGON2_OPTS); }

async function verifyPassword(password, storedHash) {
    if (storedHash.startsWith('scrypt$')) {
        return { valid: await verifyScryptLegacy(password, storedHash), needsRehash: true };
    }
    return { valid: await argon2.verify(storedHash, password), needsRehash: false };
}
```

Migracja: przy udanym logowaniu, jeśli `needsRehash`, rehash do Argon2id.

#### Zapis do DB (transakcja)
1. `INSERT INTO users (...)` z `ON CONFLICT DO NOTHING`.
2. `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)`.
3. `COMMIT`. Jeśli krok 2 fail → `ROLLBACK`.

#### Token weryfikacyjny
```javascript
function generateVerificationToken() {
    const rawToken = crypto.randomBytes(32).toString('hex');   // 64 hex chars
    const expiresAt = new Date(Date.now() + 24*60*60*1000).toISOString();  // 24h
    return { token: rawToken, expiresAt };
}
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
```
**W DB przechowywany jest SHA-256 hash tokenu — nigdy plaintext.**

#### Wysyłka emaila
Fire-and-forget — nie blokuje odpowiedzi. Jeśli fail → log server-side, user może poprosić o resend.
```javascript
sendVerificationEmail(user, verification.token).catch(err => {
    console.error('[auth] Failed to send verification email:', err.message);
});
```

#### Odpowiedź
```json
HTTP 201
{ "authenticated": false, "user": { "id": "usr_...", "emailVerified": false, ... },
  "message": "Registration successful. Please check your email to verify your account." }
```

### 4.3 Email verification

#### Link aktywacyjny
```
https://altivor.institute/api/auth/verify-email?token=<raw_token>
```

#### Endpoint `GET /api/auth/verify-email?token=...`
1. Hash tokenu: `SHA-256(token)`.
2. `SELECT * FROM email_verification_tokens WHERE token_hash = $1`.
3. Sprawdzenie `expires_at > NOW()`.
4. `UPDATE users SET email_verified = true, email_verified_at = NOW() WHERE id = $user_id`.
5. `DELETE FROM email_verification_tokens WHERE user_id = $user_id`.
6. `302 → /verify-email.html?status=success`.

Jeśli token nieważny/wygasły → `302 → /verify-email.html?status=error&message=...`.

#### Wygasły token
Strona error z formularzem resend. User wpisuje email → `POST /api/auth/resend-verification`.

#### Resend
- Cooldown: 60 sekund.
- Stary token zastępowany nowym.
- Produkcja: generyczny komunikat (nie ujawniamy istnienia konta). Obecna implementacja zwraca 404 — **wymaga zmiany** na 200 z generycznym msg.

### 4.4 Komunikaty

| Sytuacja | HTTP | Komunikat |
|----------|------|-----------|
| Sukces | 201 | "Registration successful. Check your email." |
| Istniejący email | 409 | "An account with this email already exists." |
| Brak pól | 400 | "All registration fields are required." |
| Zły email | 400 | "Enter a valid email address." |
| Słabe hasło | 400 | "Password must be at least 8 characters..." |
| Hasła nie pasują | 400 | "Passwords do not match." |
| Brak consent | 400 | "You must accept the terms." |
| Konto zweryfikowane | 400 | "This email is already verified." |
| Wygasły token | 400 | "Verification token expired. Request a new one." |

---

## 5. Logowanie — pełny flow

### 5.1 Frontend

**Formularz:** email (`#loginEmail`), password (`#loginPassword`), remember me (`#loginRemember`).

**Walidacja:** email i hasło nie puste (natywne `required` + `type="email"`).

**Request:**
```javascript
await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, remember: rememberEl.checked })
});
```

**Po sukcesie:**
- `updateAuthUi(response.user)` — ukrywa Login/Register, pokazuje Logout (+ Admin Panel jeśli admin).
- `closeModalForForm(form)`.
- `localStorage` remember me: `altivor_remembered_user`.

**Po błędzie:**
- `clearSensitiveFields(form)` — czyści hasło ZAWSZE.
- `setFormStatus(form, error.message)`.

### 5.2 Backend — sekwencja sprawdzeń

```javascript
// 1. Walidacja inputu
if (!isValidEmail(emailNormalized) || !password) throw 400;

// 2. Pobranie usera
const user = await db.query('SELECT * FROM users WHERE email_normalized = $1', [emailNormalized]);
if (!user) throw 401 "Invalid email or password.";

// 3. Lockout check
if (user.account_status === 'locked' && user.locked_until > now) {
    throw 423 "Account temporarily locked. Try again in X min.";
}

// 4. Weryfikacja hasła
const valid = await verifyPassword(password, user.password_hash);
if (!valid) {
    await incrementFailedLoginAttempts(user.id);   // → lockout po 5 próbach
    throw 401 "Invalid email or password.";
}

// 5. Reset failed attempts
await resetFailedLoginAttempts(user.id);

// 6. Rehash legacy scrypt → argon2id
if (needsRehash) await updatePasswordHash(user.id, password);

// 7. Email verified?
if (!user.email_verified) throw 403 "Please verify your email.";

// 8. Account active?
if (user.account_status === 'blocked') throw 403 "This account is blocked.";

// 9. Tworzenie sesji
const sessionId = createId('sess_');
await db.query('INSERT INTO sessions ...', [sessionId, user.id, expiresAt, ip, userAgent]);

// 10. Update last_login_at
await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

// 11. Set-Cookie + response
```

**Komunikat `"Invalid email or password."` jest identyczny** dla nieistniejącego konta i błędnego hasła.

### 5.3 Brute-force protection

```javascript
const MAX_FAILED = 5;
const LOCKOUT_MS = 15 * 60 * 1000;   // 15 min

async function incrementFailedLoginAttempts(userId) {
    const r = await db.query(
        'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1 RETURNING failed_login_attempts',
        [userId]
    );
    if (r.rows[0].failed_login_attempts >= MAX_FAILED) {
        await db.query(
            'UPDATE users SET account_status = $1, locked_until = $2 WHERE id = $3',
            ['locked', new Date(Date.now() + LOCKOUT_MS).toISOString(), userId]
        );
    }
}
```

### 5.4 Sesja — szczegóły cookie

```
Set-Cookie: altivor_session=sess_xyz.hmac; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
```

| Flaga | Wartość | Cel |
|-------|---------|-----|
| HttpOnly | tak | JS nie ma dostępu |
| Secure | tak (production) | Tylko HTTPS |
| SameSite | Strict | Brak cross-site |
| Max-Age | 604800 (7d) / 2592000 (30d remember) | TTL |
| Path | / | Cała domena |

### 5.5 Błędy logowania

| HTTP | Komunikat | Kiedy |
|------|-----------|-------|
| 400 | "Email and password are required." | Puste pola |
| 401 | "Invalid email or password." | Zły email LUB hasło |
| 403 | "Please verify your email." | Niezweryfikowany |
| 403 | "This account is blocked." | Blokada admina |
| 423 | "Account locked. Try again in X min." | Brute-force |
| 429 | "Too many attempts." | Rate limit IP |

---

## 6. Twarde wymuszenie „1 email = 1 konto"

### 3 warstwy ochrony

**Warstwa 1 — Frontend:** `trim().toLowerCase()` przed wysłaniem. UX only — niezaufana.

**Warstwa 2 — Backend:** `SELECT id FROM users WHERE email_normalized = $1` przed INSERT. Logiczna walidacja.

**Warstwa 3 — DB constraint:**
```sql
CREATE UNIQUE INDEX idx_users_email_normalized ON users (email_normalized);
```
Ostatnia linia obrony — nawet jeśli backend zawiedzie (race condition).

### Dwa równoczesne requesty

```sql
INSERT INTO users (..., email_normalized, ...)
VALUES (..., $1, ...)
ON CONFLICT (email_normalized) DO NOTHING
RETURNING id;
```
- Request 1: INSERT OK, `RETURNING id` ma wiersz.
- Request 2: `ON CONFLICT DO NOTHING`, `RETURNING` puste → backend zwraca 409.

### Fallback bez ON CONFLICT

```javascript
try { await db.query('INSERT INTO users ...'); }
catch (err) {
    if (err.code === '23505' && err.constraint === 'idx_users_email_normalized')
        throw createHttpError(409, 'An account with this email already exists.');
    throw err;
}
```

### Reuse emaila po soft-delete

**Decyzja: NIE.** UNIQUE INDEX obejmuje wszystkie rekordy (łącznie z `deleted_at IS NOT NULL`).

Uzasadnienie: dane (logi, historia) powiązane z emailem. Nowe konto z tym samym emailem = ryzyko powiązania danych. Przywracanie → kontakt z supportem.

---

## 7. Reset hasła / odzyskiwanie konta

### 7.1 Flow

1. User klika `.auth-forgot-link` w login modal.
2. JS podmienia zawartość `.auth-modal` na formularz "Reset Password" (dynamicznie, te same klasy CSS — bez zmiany designu).
3. User wpisuje email → `POST /api/auth/forgot-password`.
4. Backend ZAWSZE: `200 "If an account exists, a reset link has been sent."` — nie ujawnia istnienia konta.
5. Wewnętrznie: jeśli konto istnieje i jest verified → generuj token, wyślij email.
6. Email z linkiem: `https://altivor.institute/reset-password.html?token=<raw_token>`.
7. User klika link → `reset-password.html` z formularzem nowego hasła.
8. Submit → `POST /api/auth/reset-password` z `{ token, password, passwordConfirm }`.

### 7.2 Token resetu

```javascript
function generatePasswordResetToken() {
    return {
        token: crypto.randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()  // 1h TTL
    };
}
```

- **TTL: 1 godzina** (krótszy niż verification — bardziej wrażliwa operacja).
- Przechowywanie: **SHA-256 hash** w `password_reset_tokens`, nie plaintext.
- Jednorazowy — usuwany po użyciu.
- Max 1 aktywny token na usera (stary usuwany przed generowaniem nowego).

### 7.3 Po udanym resecie

```javascript
// 1. Hash tokenu i lookup
const tokenHash = hashToken(payload.token);
const tokenRow = await db.query('SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL', [tokenHash]);
if (!tokenRow.rows.length) throw 400 "Invalid or expired reset link.";

// 2. Walidacja nowego hasła (identyczna polityka jak rejestracja)
// 3. Hash nowego hasła (Argon2id)
const newHash = await hashPassword(payload.password);

// 4. Update hasła
await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);

// 5. Unieważnienie WSZYSTKICH sesji
await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);

// 6. Unieważnienie WSZYSTKICH tokenów resetu
await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

// 7. Odpowiedź
return { message: "Password reset. You can now sign in." };
```

### 7.4 Formularz „Forgot Password" (dynamiczny)

```javascript
function showForgotPasswordForm() {
    const modal = document.querySelector('#loginModal .auth-modal');
    modal.dataset.originalContent = modal.innerHTML;
    modal.innerHTML = `
        <button class="auth-close" onclick="closeModal('loginModal')" aria-label="Close">&#x2715;</button>
        <div class="auth-logo"><img src="logo.png" alt="ALTIVOR" class="brand-logo-img auth-logo-img" draggable="false"/></div>
        <h2 class="auth-title">Reset Password</h2>
        <p class="auth-sub">Enter your email and we'll send a reset link.</p>
        <form class="auth-form" id="forgotPasswordForm">
            <div class="auth-field">
                <label for="forgotEmail">Email Address</label>
                <input type="email" id="forgotEmail" name="email" placeholder="your@email.com" required autocomplete="email"/>
            </div>
            <button type="submit" class="btn btn-primary auth-submit">Send Reset Link</button>
        </form>
        <p class="auth-switch"><a href="#" onclick="restoreLoginForm();return false;">Back to Sign In</a></p>`;
    // bind submit handler...
}
```

### 7.5 Strona `reset-password.html` (nowa)

Analogiczna do `verify-email.html`:
- Odczyt `?token=` z URL.
- Formularz: nowe hasło + potwierdzenie.
- Walidacja hasła (identyczna jak rejestracja).
- Submit → `POST /api/auth/reset-password`.
- Sukces → komunikat + link "Sign In".
- Error → komunikat + link "Request new reset link".

Kontynuacja → `AUTH-SYSTEM-SPEC-PART3.md`
