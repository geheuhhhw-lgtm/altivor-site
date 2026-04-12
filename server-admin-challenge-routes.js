'use strict';

const {
  createHttpError,
  listChallenges,
  getChallengeById,
  approveChallenge,
  rejectChallenge,
  updateTradeValidation,
  getReportsByChallengeId,
  calculateDaysRemaining,
  calculateProfit,
  calculateDrawdown
} = require('./challenge-store');

const { getAuthenticatedUser, isAdminUser, getUserById } = require('./auth-store');

// ═══ HELPERS ══════════════════════════════════════════════════════════════

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: 'Method not allowed.' });
}

function unauthorized(res) {
  sendJson(res, 401, { error: 'Authentication required.' });
}

function forbidden(res) {
  sendJson(res, 403, { error: 'Admin access required.' });
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 64 * 1024) {
        reject(createHttpError(413, 'Request too large.'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(createHttpError(400, 'Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function enrichChallenge(challenge) {
  return {
    ...challenge,
    daysRemaining: calculateDaysRemaining(challenge.endDate),
    currentProfit: calculateProfit(challenge.initialBalance, challenge.currentBalance),
    currentDrawdown: calculateDrawdown(challenge.highWaterMark, challenge.currentBalance)
  };
}

// ═══ ROUTE HANDLER ════════════════════════════════════════════════════════

async function maybeHandleAdminChallengeRoute(req, res, reqUrl) {
  if (!reqUrl.pathname.startsWith('/api/admin/challenges')) {
    return false;
  }

  try {
    const user = getAuthenticatedUser(req);
    
    if (!user) {
      unauthorized(res);
      return true;
    }
    
    if (!isAdminUser(user)) {
      forbidden(res);
      return true;
    }

    // ─── GET /api/admin/challenges ────────────────────────────────────────
    if (reqUrl.pathname === '/api/admin/challenges') {
      if (req.method !== 'GET') {
        methodNotAllowed(res);
        return true;
      }
      
      const status = reqUrl.searchParams.get('status');
      const userId = reqUrl.searchParams.get('userId');
      
      const challenges = await listChallenges({ status, userId });
      
      // Enrich with user info and calculated fields
      const enrichedChallenges = await Promise.all(challenges.map(async (challenge) => {
        const challengeUser = getUserById ? getUserById(challenge.userId) : null;
        return {
          ...enrichChallenge(challenge),
          user: challengeUser ? {
            id: challengeUser.id,
            email: challengeUser.email,
            firstName: challengeUser.firstName,
            lastName: challengeUser.lastName
          } : null
        };
      }));
      
      sendJson(res, 200, {
        challenges: enrichedChallenges,
        total: enrichedChallenges.length
      });
      return true;
    }

    // ─── GET /api/admin/challenges/:id ────────────────────────────────────
    const detailMatch = reqUrl.pathname.match(/^\/api\/admin\/challenges\/([^\/]+)$/);
    if (detailMatch && req.method === 'GET') {
      const challengeId = detailMatch[1];
      const challenge = await getChallengeById(challengeId);
      
      if (!challenge) {
        sendJson(res, 404, { error: 'Challenge not found.' });
        return true;
      }
      
      const challengeUser = getUserById ? getUserById(challenge.userId) : null;
      const reports = await getReportsByChallengeId(challengeId);
      
      sendJson(res, 200, {
        challenge: enrichChallenge(challenge),
        user: challengeUser ? {
          id: challengeUser.id,
          email: challengeUser.email,
          firstName: challengeUser.firstName,
          lastName: challengeUser.lastName,
          username: challengeUser.username
        } : null,
        trades: challenge.trades || [],
        weeklyCheckins: challenge.weeklyCheckins || [],
        brokerStatements: challenge.brokerStatements || [],
        verificationReports: reports
      });
      return true;
    }

    // ─── GET /api/admin/challenges/:id/comparison ─────────────────────────
    const comparisonMatch = reqUrl.pathname.match(/^\/api\/admin\/challenges\/([^\/]+)\/comparison$/);
    if (comparisonMatch && req.method === 'GET') {
      const challengeId = comparisonMatch[1];
      const challenge = await getChallengeById(challengeId);
      
      if (!challenge) {
        sendJson(res, 404, { error: 'Challenge not found.' });
        return true;
      }
      
      const reports = await getReportsByChallengeId(challengeId);
      const latestReport = reports[reports.length - 1];
      
      if (!latestReport) {
        sendJson(res, 200, {
          comparison: null,
          message: 'No verification report available. User needs to upload a broker statement.'
        });
        return true;
      }
      
      sendJson(res, 200, {
        comparison: {
          summary: {
            totalSelfReported: latestReport.totalSelfReported,
            totalInStatement: latestReport.totalInStatement,
            matchedCount: latestReport.matchedCount,
            mismatchCount: latestReport.mismatchCount,
            missingCount: latestReport.missingCount,
            extraCount: latestReport.extraCount
          },
          flags: latestReport.flags,
          matchDetails: latestReport.matchDetails
        }
      });
      return true;
    }

    // ─── POST /api/admin/challenges/:id/approve ───────────────────────────
    const approveMatch = reqUrl.pathname.match(/^\/api\/admin\/challenges\/([^\/]+)\/approve$/);
    if (approveMatch && req.method === 'POST') {
      const challengeId = approveMatch[1];
      const body = await readRequestBody(req);
      
      const challenge = await approveChallenge(challengeId, user.id, body.notes);
      
      sendJson(res, 200, {
        message: 'Challenge approved.',
        challenge: enrichChallenge(challenge)
      });
      return true;
    }

    // ─── POST /api/admin/challenges/:id/reject ────────────────────────────
    const rejectMatch = reqUrl.pathname.match(/^\/api\/admin\/challenges\/([^\/]+)\/reject$/);
    if (rejectMatch && req.method === 'POST') {
      const challengeId = rejectMatch[1];
      const body = await readRequestBody(req);
      
      if (!body.reason) {
        sendJson(res, 400, { error: 'Rejection reason is required.' });
        return true;
      }
      
      const challenge = await rejectChallenge(challengeId, user.id, body.reason, body.notes);
      
      sendJson(res, 200, {
        message: 'Challenge rejected.',
        challenge: enrichChallenge(challenge)
      });
      return true;
    }

    // ─── POST /api/admin/challenges/:id/trades/:tradeId/validate ──────────
    const validateMatch = reqUrl.pathname.match(/^\/api\/admin\/challenges\/([^\/]+)\/trades\/([^\/]+)\/validate$/);
    if (validateMatch && req.method === 'POST') {
      const challengeId = validateMatch[1];
      const tradeId = validateMatch[2];
      const body = await readRequestBody(req);
      
      if (!body.validationStatus) {
        sendJson(res, 400, { error: 'Validation status is required.' });
        return true;
      }
      
      const { challenge, trade } = await updateTradeValidation(
        challengeId,
        tradeId,
        body.validationStatus,
        body.validationNotes
      );
      
      sendJson(res, 200, {
        message: 'Trade validation updated.',
        trade
      });
      return true;
    }

    // Not found
    sendJson(res, 404, { error: 'Admin challenge endpoint not found.' });
    return true;

  } catch (error) {
    console.error('[admin-challenge] Error:', error.message);
    sendJson(res, error.statusCode || 500, {
      error: error.message || 'Admin request failed.'
    });
    return true;
  }
}

module.exports = {
  maybeHandleAdminChallengeRoute
};
