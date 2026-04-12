# ALTIVOR Auth API — Weryfikacja email

System weryfikacji adresu email dla platformy SaaS (fintech/trading).

## Struktura plików

```
backend/
├── prisma/
│   └── schema.prisma      # Schemat bazy PostgreSQL
├── src/
│   ├── index.js           # Punkt wejścia Express
│   ├── config.js          # Konfiguracja z .env
│   ├── routes/
│   │   └── auth.js        # Rejestracja, login, weryfikacja, resend
│   ├── services/
│   │   └── email.js       # Wysyłka emaili (Nodemailer)
│   ├── middleware/
│   │   └── rateLimit.js   # Rate limiting
│   └── templates/
│       └── verification-email.html
├── .env.example
├── package.json
└── README.md
```

## Endpointy

| Metoda | Endpoint | Opis |
|--------|----------|------|
| POST | `/api/auth/register` | Rejestracja (email, password) |
| GET | `/api/auth/verify-email?token=...` | Weryfikacja email |
| POST | `/api/auth/login` | Logowanie (blokada jeśli `email_verified=false`) |
| POST | `/api/auth/resend-verification` | Ponowne wysłanie maila weryfikacyjnego |

## Uruchomienie

### 1. Zainstaluj zależności

```bash
cd backend
npm install
```

### 2. Skonfiguruj bazę i zmienne

```bash
cp .env.example .env
```

Edytuj `.env` — uzupełnij m.in.:

- `DATABASE_URL` — connection string PostgreSQL
- `APP_URL` — adres frontendu (np. `http://localhost:8090`)
- `SMTP_*` — dane SMTP do wysyłki maili

### 3. Utwórz tabelę w bazie

```bash
npm run db:push
```

lub z migracjami:

```bash
npm run db:migrate
```

### 4. Uruchom serwer

```bash
npm start
```

API działa domyślnie na `http://localhost:3001`.

### 5. Frontend

Upewnij się, że frontend (ALTIVOR) działa np. na `http://localhost:8090`.  
Link w mailu weryfikacyjnym prowadzi do `{APP_URL}/verify-email.html?token=...`.

## Konfiguracja SMTP

### Gmail

1. Włącz 2FA na koncie Google.
2. Wygeneruj „Hasło aplikacji”: https://myaccount.google.com/apppasswords
3. W `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=twoj.email@gmail.com
   SMTP_PASS=wygenerowane_haslo_16_znakow
   ```

### Mailtrap (testy)

1. Załóż konto na https://mailtrap.io
2. Skopiuj dane SMTP z inboxa
3. Ustaw w `.env` zgodnie z Mailtrap

## Bezpieczeństwo

- Hasła hashowane przez bcrypt (12 rund)
- Token weryfikacyjny: `crypto.randomBytes(32)` (64 znaki hex)
- Czas ważności tokenu: 24 godziny
- Rate limit: 5 prób auth / 15 min, 3 maile resend / godzinę
- Helmet dla nagłówków HTTP
- CORS z ograniczeniem do `APP_URL`

## Testowanie bez SMTP

Jeśli SMTP nie jest skonfigurowany, emaile są wypisywane w konsoli (link weryfikacyjny), a wysyłka działa w trybie symulacji.
