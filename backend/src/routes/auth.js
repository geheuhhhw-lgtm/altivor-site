'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authLimiter, resendLimiter } = require('../middleware/rateLimit');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { sendVerificationEmail } = require('../services/email');
const config = require('../config');

const router = express.Router();
const prisma = new PrismaClient();

const SALT_ROUNDS = 12;
const TOKEN_BYTES = 32;
const TOKEN_EXPIRY_MS = config.verification.tokenExpiryHours * 60 * 60 * 1000;
const JWT_COOKIE_NAME = 'altivor_session';

// ─── Walidacja ─────────────────────────────────────────────────────────────

function normalizeEmail(val) {
  return String(val || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

function createJwtToken(userId) {
  return jwt.sign({ userId }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

function setAuthCookie(res, token) {
  res.cookie(JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

function clearAuthCookie(res) {
  res.clearCookie(JWT_COOKIE_NAME);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    country: user.country,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    prepareStatus: user.prepareStatus,
    prepareStartedAt: user.prepareStartedAt,
    prepareCompletedAt: user.prepareCompletedAt,
    prepareCompliantTrades: user.prepareCompliantTrades,
    prepareNonCompliantTrades: user.prepareNonCompliantTrades,
    challengeStatus: user.challengeStatus,
    challengeStartedAt: user.challengeStartedAt,
    challengeCompletedAt: user.challengeCompletedAt,
    challengeTotalTrades: user.challengeTotalTrades,
    challengeCompliantTrades: user.challengeCompliantTrades
  };
}

// ─── POST /register ────────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const emailNorm = normalizeEmail(email);

    if (!emailNorm || !password) {
      return res.status(400).json({ error: 'Email i hasło są wymagane.' });
    }
    if (!isValidEmail(emailNorm)) {
      return res.status(400).json({ error: 'Nieprawidłowy format adresu email.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Hasło musi mieć minimum 8 znaków.' });
    }

    const existing = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (existing) {
      return res.status(409).json({ error: 'Konto z tym adresem email już istnieje.' });
    }

    const verificationToken = createToken();
    const tokenExpiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: emailNorm,
        passwordHash,
        emailVerified: false,
        verificationToken,
        tokenExpiresAt
      }
    });

    const verifyUrl = `${config.appUrl}/verify-email.html?token=${verificationToken}`;
    await sendVerificationEmail(emailNorm, verifyUrl);

    res.status(201).json({
      message: 'Konto utworzone. Sprawdź email, aby je zweryfikować.',
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified
      }
    });
  } catch (err) {
    console.error('[AUTH] register error:', err);
    res.status(500).json({ error: 'Błąd rejestracji. Spróbuj ponownie.' });
  }
});

// ─── GET /verify-email ─────────────────────────────────────────────────────

router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Nieprawidłowy lub brakujący token.' });
    }

    const user = await prisma.user.findFirst({
      where: { verificationToken: token }
    });

    if (!user) {
      return res.status(400).json({ error: 'Nieprawidłowy token weryfikacyjny.' });
    }

    if (!user.tokenExpiresAt || new Date() > user.tokenExpiresAt) {
      return res.status(400).json({ error: 'Token wygasł. Poproś o ponowne wysłanie maila.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        tokenExpiresAt: null
      }
    });

    res.json({
      message: 'Email zweryfikowany pomyślnie. Możesz się zalogować.',
      verified: true
    });
  } catch (err) {
    console.error('[AUTH] verify-email error:', err);
    res.status(500).json({ error: 'Błąd weryfikacji. Spróbuj ponownie.' });
  }
});

// ─── POST /login ───────────────────────────────────────────────────────────

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const emailNorm = normalizeEmail(email);

    if (!emailNorm || !password) {
      return res.status(400).json({ error: 'Email i hasło są wymagane.' });
    }

    const user = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (!user) {
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło.' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło.' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        error: 'Zweryfikuj email',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const token = createJwtToken(user.id);
    setAuthCookie(res, token);

    res.json({
      message: 'Zalogowano pomyślnie.',
      user: sanitizeUser(updatedUser)
    });
  } catch (err) {
    console.error('[AUTH] login error:', err);
    res.status(500).json({ error: 'Błąd logowania. Spróbuj ponownie.' });
  }
});

// ─── GET /me ────────────────────────────────────────────────────────────────

router.get('/me', async (req, res) => {
  try {
    const token = req.cookies[JWT_COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated', user: null });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      clearAuthCookie(res);
      return res.status(401).json({ error: 'Invalid session', user: null });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({ error: 'User not found', user: null });
    }

    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error('[AUTH] me error:', err);
    res.status(500).json({ error: 'Server error', user: null });
  }
});

// ─── POST /logout ───────────────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Wylogowano pomyślnie.' });
});

// ─── POST /resend-verification ─────────────────────────────────────────────

router.post('/resend-verification', resendLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const emailNorm = normalizeEmail(email);

    if (!emailNorm) {
      return res.status(400).json({ error: 'Adres email jest wymagany.' });
    }

    const user = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (!user) {
      return res.json({
        message: 'Jeśli konto istnieje, email weryfikacyjny został wysłany.'
      });
    }

    if (user.emailVerified) {
      return res.json({ message: 'Email został już zweryfikowany. Możesz się zalogować.' });
    }

    const verificationToken = createToken();
    const tokenExpiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken, tokenExpiresAt }
    });

    const verifyUrl = `${config.appUrl}/verify-email.html?token=${verificationToken}`;
    await sendVerificationEmail(emailNorm, verifyUrl);

    res.json({
      message: 'Email weryfikacyjny został wysłany ponownie. Sprawdź skrzynkę.'
    });
  } catch (err) {
    console.error('[AUTH] resend-verification error:', err);
    res.status(500).json({ error: 'Błąd wysyłki. Spróbuj ponownie później.' });
  }
});

// ─── POST /forgot-password ──────────────────────────────────────────────────

router.post('/forgot-password', resendLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const emailNorm = normalizeEmail(email);

    if (!emailNorm) {
      return res.status(400).json({ error: 'Adres email jest wymagany.' });
    }

    // Always return success to prevent email enumeration
    const successMsg = 'Jeśli konto istnieje, kod resetujący został wysłany na email.';

    const user = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (!user) {
      return res.json({ message: successMsg });
    }

    // Generate 6-digit code
    const resetCode = String(Math.floor(100000 + Math.random() * 900000));
    const resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: { resetCode, resetCodeExpires }
    });

    // Send email with reset code (placeholder - will work when email is configured)
    try {
      const { sendPasswordResetEmail } = require('../services/email');
      await sendPasswordResetEmail(emailNorm, resetCode);
    } catch (emailErr) {
      console.log('[AUTH] Password reset email not sent (email service not configured):', emailErr.message);
      // In development, log the code for testing
      if (config.nodeEnv === 'development') {
        console.log(`[AUTH] DEV MODE - Reset code for ${emailNorm}: ${resetCode}`);
      }
    }

    res.json({ message: successMsg });
  } catch (err) {
    console.error('[AUTH] forgot-password error:', err);
    res.status(500).json({ error: 'Błąd wysyłki. Spróbuj ponownie później.' });
  }
});

// ─── POST /verify-reset-code ────────────────────────────────────────────────

router.post('/verify-reset-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    const emailNorm = normalizeEmail(email);

    if (!emailNorm || !code) {
      return res.status(400).json({ error: 'Email i kod są wymagane.' });
    }

    const user = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (!user || !user.resetCode || user.resetCode !== code) {
      return res.status(400).json({ error: 'Nieprawidłowy kod.' });
    }

    if (!user.resetCodeExpires || new Date() > user.resetCodeExpires) {
      return res.status(400).json({ error: 'Kod wygasł. Poproś o nowy kod.' });
    }

    res.json({ valid: true, message: 'Kod poprawny. Możesz ustawić nowe hasło.' });
  } catch (err) {
    console.error('[AUTH] verify-reset-code error:', err);
    res.status(500).json({ error: 'Błąd weryfikacji. Spróbuj ponownie.' });
  }
});

// ─── POST /reset-password ───────────────────────────────────────────────────

router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const emailNorm = normalizeEmail(email);

    if (!emailNorm || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, kod i nowe hasło są wymagane.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Hasło musi mieć minimum 8 znaków.' });
    }

    const user = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (!user || !user.resetCode || user.resetCode !== code) {
      return res.status(400).json({ error: 'Nieprawidłowy kod.' });
    }

    if (!user.resetCodeExpires || new Date() > user.resetCodeExpires) {
      return res.status(400).json({ error: 'Kod wygasł. Poproś o nowy kod.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetCode: null,
        resetCodeExpires: null
      }
    });

    res.json({ message: 'Hasło zostało zmienione. Możesz się zalogować.' });
  } catch (err) {
    console.error('[AUTH] reset-password error:', err);
    res.status(500).json({ error: 'Błąd zmiany hasła. Spróbuj ponownie.' });
  }
});

module.exports = router;
