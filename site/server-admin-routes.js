'use strict';

const {
  getAuthenticatedUser,
  isAdminUser,
  listUsers,
  getUserById,
  updateUserById
} = require('./auth-store');

const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
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

function requireAdminUser(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'Authentication required.' });
    return null;
  }
  if (!isAdminUser(user)) {
    sendJson(res, 403, { error: 'Forbidden.' });
    return null;
  }
  return user;
}

function extractUserId(pathname) {
  const match = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function maybeHandleAdminApiRoute(req, res, reqUrl) {
  if (!reqUrl.pathname.startsWith('/api/admin/')) {
    return false;
  }

  try {
    const adminUser = requireAdminUser(req, res);
    if (!adminUser) {
      return true;
    }

    if (reqUrl.pathname === '/api/admin/users') {
      if (req.method !== 'GET') {
        methodNotAllowed(res);
        return true;
      }
      sendJson(res, 200, {
        users: listUsers()
      });
      return true;
    }

    const userId = extractUserId(reqUrl.pathname);
    if (userId) {
      if (req.method === 'GET') {
        const user = getUserById(userId);
        if (!user) {
          sendJson(res, 404, { error: 'User not found.' });
          return true;
        }
        sendJson(res, 200, { user });
        return true;
      }

      if (req.method === 'PATCH') {
        const payload = await parseRequestPayload(req);
        const user = await updateUserById(userId, payload || {});
        sendJson(res, 200, { user });
        return true;
      }

      methodNotAllowed(res);
      return true;
    }

    sendJson(res, 404, { error: 'Not found.' });
    return true;
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || 'Admin request failed.'
    });
    return true;
  }
}

module.exports = {
  maybeHandleAdminApiRoute
};
