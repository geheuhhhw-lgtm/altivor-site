'use strict';

try {
  require('dotenv').config();
} catch (_) {
  // dotenv optional
}

module.exports = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: (process.env.APP_URL || 'http://localhost:8090').replace(/\/$/, ''),
  
  jwt: {
    secret: process.env.JWT_SECRET || 'altivor-dev-secret-change-in-production',
    expiresIn: '7d'
  },

  database: {
    url: process.env.DATABASE_URL
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },

  mail: {
    fromName: process.env.MAIL_FROM_NAME || 'ALTIVOR INSTITUTE',
    fromEmail: process.env.MAIL_FROM_EMAIL || 'noreply@altivor.institute'
  },

  verification: {
    tokenExpiryHours: 24
  },

  rateLimit: {
    authWindowMs: 15 * 60 * 1000,      // 15 minut
    authMax: 5,                         // max 5 prób logowania/rejestracji
    resendWindowMs: 60 * 60 * 1000,    // 1 godzina
    resendMax: 3                        // max 3 maile weryfikacyjne na godzinę
  }
};
