'use strict';

const {
  registerUser,
  authenticateUser,
  verifyEmailToken,
  regenerateVerificationToken,
  getAuthenticatedUser,
  sanitizeUser,
  startSession,
  endSession
} = require('./auth-store');
const { sendVerificationEmail } = require('./email-service');

const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res, statusCode, payload, extraHeaders) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(extraHeaders || {})
  });
  res.end(body);
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: 'Method not allowed.' });
}

function parseUrlEncoded(rawBody) {
  const params = new URLSearchParams(rawBody);
  const payload = {};
  for (const [key, value] of params.entries()) {
    payload[key] = value;
  }
  return payload;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let rawBody = '';
    let totalBytes = 0;

    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        const error = new Error('Request body too large.');
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      rawBody += chunk.toString('utf8');
    });

    req.on('end', () => resolve(rawBody));
    req.on('error', reject);
  });
}

async function parseRequestPayload(req) {
  const rawBody = await readRequestBody(req);
  if (!rawBody) return {};

  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType === 'application/json' || !contentType) {
    try {
      return JSON.parse(rawBody);
    } catch (_) {
      const error = new Error('Invalid JSON payload.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (contentType === 'application/x-www-form-urlencoded') {
    return parseUrlEncoded(rawBody);
  }

  const error = new Error('Unsupported content type.');
  error.statusCode = 415;
  throw error;
}

function sendAuthState(res, user, extraHeaders) {
  sendJson(res, 200, {
    authenticated: Boolean(user),
    user: user ? sanitizeUser(user) : null
  }, extraHeaders);
}

async function maybeHandleAuthRoute(req, res, reqUrl) {
  if (!reqUrl.pathname.startsWith('/api/auth/')) {
    return false;
  }

  try {
    if (reqUrl.pathname === '/api/auth/me') {
      if (req.method !== 'GET') {
        methodNotAllowed(res);
        return true;
      }
      const user = getAuthenticatedUser(req);
      sendAuthState(res, user);
      return true;
    }

    if (reqUrl.pathname === '/api/auth/register') {
      if (req.method !== 'POST') {
        methodNotAllowed(res);
        return true;
      }
      const payload = await parseRequestPayload(req);
      const result = await registerUser(payload);
      const user = result.sanitized;
      const token = result.verificationToken;

      sendVerificationEmail(user, token).catch(function (err) {
        console.error('[auth] Failed to send verification email:', err.message);
      });

      sendJson(res, 201, {
        authenticated: false,
        user,
        message: 'Registration successful. Please check your email to verify your account.'
      });
      return true;
    }

    if (reqUrl.pathname === '/api/auth/verify-email') {
      if (req.method !== 'GET') {
        methodNotAllowed(res);
        return true;
      }
      const token = reqUrl.searchParams.get('token');
      try {
        await verifyEmailToken(token);
        res.writeHead(302, { 'Location': '/verify-email.html?status=success' });
        res.end();
      } catch (err) {
        const msg = encodeURIComponent(err.message || 'Verification failed.');
        res.writeHead(302, { 'Location': '/verify-email.html?status=error&message=' + msg });
        res.end();
      }
      return true;
    }

    if (reqUrl.pathname === '/api/auth/resend-verification') {
      if (req.method !== 'POST') {
        methodNotAllowed(res);
        return true;
      }
      const payload = await parseRequestPayload(req);
      const result = await regenerateVerificationToken(payload.email);

      sendVerificationEmail(result.sanitized, result.verificationToken).catch(function (err) {
        console.error('[auth] Failed to send verification email:', err.message);
      });

      sendJson(res, 200, {
        message: 'Verification email sent. Please check your inbox.'
      });
      return true;
    }

    if (reqUrl.pathname === '/api/auth/login') {
      if (req.method !== 'POST') {
        methodNotAllowed(res);
        return true;
      }
      const payload = await parseRequestPayload(req);
      const user = await authenticateUser(payload.email, payload.password);
      const sessionCookie = startSession(req, user);
      sendJson(res, 200, {
        authenticated: true,
        user
      }, {
        'Set-Cookie': sessionCookie
      });
      return true;
    }

    if (reqUrl.pathname === '/api/auth/logout') {
      if (req.method !== 'POST') {
        methodNotAllowed(res);
        return true;
      }
      const expiredCookie = endSession(req);
      sendJson(res, 200, {
        authenticated: false,
        user: null
      }, {
        'Set-Cookie': expiredCookie
      });
      return true;
    }

    sendJson(res, 404, { error: 'Not found.' });
    return true;
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || 'Authentication request failed.'
    });
    return true;
  }
}

module.exports = {
  maybeHandleAuthRoute
};
