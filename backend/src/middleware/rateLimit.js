'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');

const authLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowMs,
  max: config.rateLimit.authMax,
  message: { error: 'Zbyt wiele prób. Spróbuj ponownie za 15 minut.' },
  standardHeaders: true,
  legacyHeaders: false
});

const resendLimiter = rateLimit({
  windowMs: config.rateLimit.resendWindowMs,
  max: config.rateLimit.resendMax,
  message: { error: 'Zbyt wiele prób wysyłki. Spróbuj ponownie za godzinę.' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  authLimiter,
  resendLimiter
};
