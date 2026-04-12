'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSION_COOKIE_NAME = 'altivor_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const ADMIN_EMAIL = 'aleksanderdobieszewski@gmail.com';
const SESSION_SECRET = process.env.ALTIVOR_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SUBSCRIPTION_STATUSES = ['inactive', 'active', 'suspended'];
const CHALLENGE_STATUSES = ['none', 'pending', 'active', 'qualified', 'disqualified'];
const ACCOUNT_STATUSES = ['active', 'blocked'];

const sessions = new Map();
let mutationQueue = Promise.resolve();

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID()}`;
  }
  return `${prefix}${crypto.randomBytes(16).toString('hex')}`;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isAdminEmail(value) {
  return normalizeEmail(value) === ADMIN_EMAIL;
}

function resolveRole(user) {
  return isAdminEmail(user.emailNormalized || user.email) ? 'admin' : 'user';
}

function normalizeEnum(value, allowedValues, fallback) {
  return allowedValues.includes(value) ? value : fallback;
}

function normalizeStoredUser(user) {
  const emailNormalized = normalizeEmail(user.emailNormalized || user.email);
  const createdAt = user.createdAt || nowIso();
  const updatedAt = user.updatedAt || createdAt;
  return {
    id: String(user.id || createId('usr_')),
    firstName: String(user.firstName || '').trim(),
    lastName: String(user.lastName || '').trim(),
    username: String(user.username || '').trim(),
    address: String(user.address || '').trim(),
    email: emailNormalized,
    emailNormalized,
    passwordHash: String(user.passwordHash || ''),
    role: resolveRole({ emailNormalized, role: user.role }),
    emailVerified: user.emailVerified === true,
    verificationToken: user.verificationToken || null,
    tokenExpiresAt: user.tokenExpiresAt || null,
    lastVerificationSentAt: user.lastVerificationSentAt || null,
    subscriptionStatus: normalizeEnum(user.subscriptionStatus, SUBSCRIPTION_STATUSES, 'inactive'),
    challengeStatus: normalizeEnum(user.challengeStatus, CHALLENGE_STATUSES, 'none'),
    accountStatus: normalizeEnum(user.accountStatus, ACCOUNT_STATUSES, 'active'),
    createdAt,
    updatedAt,
    lastLoginAt: user.lastLoginAt || null
  };
}

function sanitizeUser(user) {
  const normalized = normalizeStoredUser(user);
  return {
    id: normalized.id,
    firstName: normalized.firstName,
    lastName: normalized.lastName,
    username: normalized.username,
    address: normalized.address,
    email: normalized.email,
    role: normalized.role,
    emailVerified: normalized.emailVerified,
    subscriptionStatus: normalized.subscriptionStatus,
    challengeStatus: normalized.challengeStatus,
    accountStatus: normalized.accountStatus,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    lastLoginAt: normalized.lastLoginAt
  };
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2), 'utf8');
  }
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(USERS_FILE, 'utf8');
  const parsed = raw ? JSON.parse(raw) : { users: [] };
  if (!parsed || !Array.isArray(parsed.users)) {
    throw new Error('Invalid user store format');
  }
  return {
    users: parsed.users.map(normalizeStoredUser)
  };
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users: store.users.map(normalizeStoredUser) }, null, 2), 'utf8');
}

function withMutation(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.catch(() => {});
  return run;
}

function findUserByEmail(store, emailNormalized) {
  return store.users.find((user) => normalizeEmail(user.emailNormalized || user.email) === emailNormalized) || null;
}

function findUserById(store, userId) {
  return store.users.find((user) => user.id === userId) || null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toBoolean(value) {
  return value === true || value === 'true' || value === '1' || value === 1 || value === 'on';
}

function validateRegisterPayload(payload) {
  const firstName = String(payload.firstName || '').trim();
  const lastName = String(payload.lastName || '').trim();
  const username = String(payload.username || '').trim();
  const address = String(payload.address || '').trim();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || '');
  const passwordConfirm = String(payload.passwordConfirm || '');
  const consent = toBoolean(payload.consent);

  if (!firstName || !lastName || !username || !address) {
    throw createHttpError(400, 'All registration fields are required.');
  }
  if (!isValidEmail(email)) {
    throw createHttpError(400, 'Enter a valid email address.');
  }
  if (password.length < 8) {
    throw createHttpError(400, 'Password must be at least 8 characters long.');
  }
  if (password !== passwordConfirm) {
    throw createHttpError(400, 'Passwords do not match.');
  }
  if (!consent) {
    throw createHttpError(400, 'You must accept the terms to create an account.');
  }

  return {
    firstName,
    lastName,
    username,
    address,
    email,
    password
  };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derivedKey).toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const salt = parts[1];
  const expected = Buffer.from(parts[2], 'hex');
  const derivedKey = await scryptAsync(password, salt, expected.length);
  const actual = Buffer.from(derivedKey);
  if (actual.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(actual, expected);
}

async function registerUser(payload) {
  return withMutation(async () => {
    const input = validateRegisterPayload(payload || {});
    const store = readStore();
    if (findUserByEmail(store, input.email)) {
      throw createHttpError(409, 'An account with this email already exists.');
    }

    const { generateVerificationToken } = require('./email-service');
    const timestamp = nowIso();
    const verification = generateVerificationToken();
    const user = {
      id: createId('usr_'),
      firstName: input.firstName,
      lastName: input.lastName,
      username: input.username,
      address: input.address,
      email: input.email,
      emailNormalized: input.email,
      passwordHash: await hashPassword(input.password),
      role: isAdminEmail(input.email) ? 'admin' : 'user',
      emailVerified: false,
      verificationToken: verification.token,
      tokenExpiresAt: verification.expiresAt,
      lastVerificationSentAt: timestamp,
      subscriptionStatus: 'inactive',
      challengeStatus: 'none',
      accountStatus: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      lastLoginAt: null
    };

    store.users.push(user);
    writeStore(store);
    return { sanitized: sanitizeUser(user), verificationToken: verification.token };
  });
}

async function authenticateUser(email, password) {
  const emailNormalized = normalizeEmail(email);
  const passwordValue = String(password || '');

  if (!isValidEmail(emailNormalized) || !passwordValue) {
    throw createHttpError(400, 'Email and password are required.');
  }

  return withMutation(async () => {
    const store = readStore();
    const user = findUserByEmail(store, emailNormalized);
    if (!user || !user.passwordHash) {
      throw createHttpError(401, 'Invalid email or password.');
    }

    const passwordValid = await verifyPassword(passwordValue, user.passwordHash);
    if (!passwordValid) {
      throw createHttpError(401, 'Invalid email or password.');
    }

    if (!user.emailVerified) {
      throw createHttpError(403, 'Please verify your email address before logging in. Check your inbox for the verification link.');
    }

    if (user.accountStatus === 'blocked') {
      throw createHttpError(403, 'This account is blocked.');
    }

    user.lastLoginAt = nowIso();
    user.updatedAt = user.lastLoginAt;
    user.role = resolveRole(user);
    writeStore(store);
    return sanitizeUser(user);
  });
}

function listUsers() {
  const store = readStore();
  return store.users
    .map(sanitizeUser)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getUserById(userId) {
  const store = readStore();
  const user = findUserById(store, String(userId || ''));
  return user ? sanitizeUser(user) : null;
}

async function updateUserById(userId, payload) {
  return withMutation(async () => {
    const store = readStore();
    const user = findUserById(store, String(userId || ''));
    if (!user) {
      throw createHttpError(404, 'User not found.');
    }

    const nextSubscriptionStatus = payload && payload.subscriptionStatus;
    const nextChallengeStatus = payload && payload.challengeStatus;
    const nextAccountStatus = payload && payload.accountStatus;

    if (nextSubscriptionStatus !== undefined) {
      if (!SUBSCRIPTION_STATUSES.includes(nextSubscriptionStatus)) {
        throw createHttpError(400, 'Invalid subscription status.');
      }
      user.subscriptionStatus = nextSubscriptionStatus;
    }

    if (nextChallengeStatus !== undefined) {
      if (!CHALLENGE_STATUSES.includes(nextChallengeStatus)) {
        throw createHttpError(400, 'Invalid challenge status.');
      }
      user.challengeStatus = nextChallengeStatus;
    }

    if (nextAccountStatus !== undefined) {
      if (!ACCOUNT_STATUSES.includes(nextAccountStatus)) {
        throw createHttpError(400, 'Invalid account status.');
      }
      if (isAdminEmail(user.emailNormalized || user.email) && nextAccountStatus !== 'active') {
        throw createHttpError(400, 'The admin account cannot be blocked through the admin API.');
      }
      user.accountStatus = nextAccountStatus;
    }

    user.role = resolveRole(user);
    user.updatedAt = nowIso();
    writeStore(store);
    return sanitizeUser(user);
  });
}

function findUserByToken(store, token) {
  if (!token) return null;
  return store.users.find((u) => u.verificationToken === token) || null;
}

async function verifyEmailToken(token) {
  return withMutation(async () => {
    const { isTokenExpired } = require('./email-service');
    const store = readStore();
    const user = findUserByToken(store, String(token || ''));
    if (!user) {
      throw createHttpError(400, 'Invalid verification token.');
    }
    if (isTokenExpired(user.tokenExpiresAt)) {
      throw createHttpError(400, 'Verification token has expired. Please request a new one.');
    }
    user.emailVerified = true;
    user.verificationToken = null;
    user.tokenExpiresAt = null;
    user.updatedAt = nowIso();
    writeStore(store);
    return sanitizeUser(user);
  });
}

async function regenerateVerificationToken(email) {
  return withMutation(async () => {
    const { generateVerificationToken } = require('./email-service');
    const emailNormalized = normalizeEmail(email);
    if (!isValidEmail(emailNormalized)) {
      throw createHttpError(400, 'Enter a valid email address.');
    }
    const store = readStore();
    const user = findUserByEmail(store, emailNormalized);
    if (!user) {
      throw createHttpError(404, 'No account found with this email.');
    }
    if (user.emailVerified) {
      throw createHttpError(400, 'This email is already verified.');
    }

    const RESEND_COOLDOWN_MS = 60 * 1000;
    if (user.lastVerificationSentAt) {
      const lastSent = new Date(user.lastVerificationSentAt).getTime();
      if (Date.now() - lastSent < RESEND_COOLDOWN_MS) {
        throw createHttpError(429, 'Please wait at least 60 seconds before requesting another verification email.');
      }
    }

    const verification = generateVerificationToken();
    user.verificationToken = verification.token;
    user.tokenExpiresAt = verification.expiresAt;
    user.lastVerificationSentAt = nowIso();
    user.updatedAt = user.lastVerificationSentAt;
    writeStore(store);
    return { sanitized: sanitizeUser(user), verificationToken: verification.token, raw: user };
  });
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (!session || session.expiresAt <= now) {
      sessions.delete(sessionId);
    }
  }
}

function signSessionId(sessionId) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(sessionId).digest('hex');
}

function buildSignedSessionId(sessionId) {
  return `${sessionId}.${signSessionId(sessionId)}`;
}

function readCookies(req) {
  const header = String((req && req.headers && req.headers.cookie) || '');
  return header.split(';').reduce((acc, part) => {
    const index = part.indexOf('=');
    if (index === -1) return acc;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value || '');
    return acc;
  }, {});
}

function getSessionIdFromRequest(req) {
  const cookies = readCookies(req);
  const rawValue = cookies[SESSION_COOKIE_NAME];
  if (!rawValue) return null;
  const parts = String(rawValue).split('.');
  if (parts.length !== 2) return null;
  const sessionId = parts[0];
  const signature = parts[1];
  const expected = signSessionId(sessionId);
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
  return sessionId;
}

function isSecureRequest(req) {
  if (!req) return false;
  if (req.socket && req.socket.encrypted) return true;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return forwardedProto === 'https';
}

function buildCookie(req, value, maxAgeSeconds) {
  const parts = [`${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function startSession(req, user) {
  pruneExpiredSessions();
  const sessionId = createId('sess_');
  sessions.set(sessionId, {
    userId: user.id,
    email: normalizeEmail(user.email),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return buildCookie(req, buildSignedSessionId(sessionId), Math.floor(SESSION_TTL_MS / 1000));
}

function endSession(req) {
  const sessionId = getSessionIdFromRequest(req);
  if (sessionId) {
    sessions.delete(sessionId);
  }
  return buildCookie(req, '', 0);
}

function getAuthenticatedUser(req) {
  pruneExpiredSessions();
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  const store = readStore();
  const user = findUserById(store, session.userId);
  if (!user) {
    sessions.delete(sessionId);
    return null;
  }

  const normalized = normalizeStoredUser(user);
  if (normalized.accountStatus === 'blocked') {
    sessions.delete(sessionId);
    return null;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  session.email = normalized.email;
  return normalized;
}

function isAdminUser(user) {
  if (!user) return false;
  return resolveRole(user) === 'admin';
}

module.exports = {
  ADMIN_EMAIL,
  SESSION_COOKIE_NAME,
  createHttpError,
  registerUser,
  authenticateUser,
  verifyEmailToken,
  regenerateVerificationToken,
  listUsers,
  getUserById,
  updateUserById,
  getAuthenticatedUser,
  isAdminUser,
  sanitizeUser,
  startSession,
  endSession,
  normalizeEmail
};
