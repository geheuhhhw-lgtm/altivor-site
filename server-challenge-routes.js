'use strict';

const fs = require('fs');
const path = require('path');
const {
  createHttpError,
  startChallenge,
  addTrade,
  addWeeklyCheckin,
  addBrokerStatement,
  updateStatementParsedData,
  submitForReview,
  getChallengeById,
  getChallengeByUserId,
  getActiveChallengeByUserId,
  getReportsByChallengeId,
  SCREENSHOTS_DIR,
  STATEMENTS_DIR,
  CHALLENGE_DURATION_DAYS,
  WEEKLY_CHECKINS_REQUIRED,
  TRADES_REQUIRED,
  PROFIT_TARGET_PERCENT,
  MAX_DRAWDOWN_PERCENT,
  calculateDaysRemaining,
  calculateProfit,
  calculateDrawdown
} = require('./challenge-store');

const { parseStatement } = require('./statement-parser');
const { runFullVerification } = require('./verification-service');
const { getAuthenticatedUser } = require('./auth-store');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    
    // Handle JSON
    if (contentType.includes('application/json')) {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
        if (body.length > MAX_FILE_SIZE) {
          reject(createHttpError(413, 'Request too large.'));
        }
      });
      req.on('end', () => {
        try {
          resolve({ fields: JSON.parse(body || '{}'), files: {} });
        } catch (e) {
          reject(createHttpError(400, 'Invalid JSON.'));
        }
      });
      req.on('error', reject);
      return;
    }
    
    // Handle multipart/form-data
    if (!contentType.includes('multipart/form-data')) {
      reject(createHttpError(415, 'Unsupported content type. Use multipart/form-data or application/json.'));
      return;
    }

    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) {
      reject(createHttpError(400, 'Missing boundary in multipart request.'));
      return;
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];

    const chunks = [];
    let totalSize = 0;

    req.on('data', chunk => {
      totalSize += chunk.length;
      if (totalSize > MAX_FILE_SIZE) {
        reject(createHttpError(413, 'File too large. Maximum size is 10MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const result = parseMultipartBuffer(buffer, boundary);
        resolve(result);
      } catch (e) {
        reject(createHttpError(400, 'Failed to parse multipart data: ' + e.message));
      }
    });

    req.on('error', reject);
  });
}

function parseMultipartBuffer(buffer, boundary) {
  const fields = {};
  const files = {};
  
  const boundaryBuffer = Buffer.from('--' + boundary);
  const parts = [];
  
  let start = 0;
  let idx = buffer.indexOf(boundaryBuffer, start);
  
  while (idx !== -1) {
    if (start > 0) {
      // Extract part between boundaries (minus trailing \r\n)
      let partEnd = idx - 2;
      if (partEnd > start) {
        parts.push(buffer.slice(start, partEnd));
      }
    }
    start = idx + boundaryBuffer.length + 2; // Skip boundary and \r\n
    idx = buffer.indexOf(boundaryBuffer, start);
  }

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    
    const headerStr = part.slice(0, headerEnd).toString('utf8');
    const body = part.slice(headerEnd + 4);
    
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    if (filenameMatch) {
      // It's a file
      const filename = filenameMatch[1];
      const contentTypeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
      const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
      
      files[name] = {
        filename,
        contentType,
        data: body
      };
    } else {
      // It's a field
      fields[name] = body.toString('utf8');
    }
  }

  return { fields, files };
}

function saveFile(fileData, directory, prefix) {
  const ext = path.extname(fileData.filename) || '.bin';
  const filename = `${prefix}_${Date.now()}${ext}`;
  const filePath = path.join(directory, filename);
  
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(filePath, fileData.data);
  
  return filePath;
}

function sanitizeChallenge(challenge) {
  return {
    id: challenge.id,
    status: challenge.status,
    startDate: challenge.startDate,
    endDate: challenge.endDate,
    initialBalance: challenge.initialBalance,
    currentBalance: challenge.currentBalance,
    highWaterMark: challenge.highWaterMark,
    maxDrawdown: challenge.maxDrawdown,
    tradesCount: challenge.trades?.length || 0,
    weeklyCheckinsCount: challenge.weeklyCheckins?.length || 0,
    statementsCount: challenge.brokerStatements?.length || 0,
    failReason: challenge.failReason,
    daysRemaining: calculateDaysRemaining(challenge.endDate),
    currentProfit: calculateProfit(challenge.initialBalance, challenge.currentBalance),
    currentDrawdown: calculateDrawdown(challenge.highWaterMark, challenge.currentBalance),
    createdAt: challenge.createdAt,
    updatedAt: challenge.updatedAt
  };
}

// ═══ ROUTE HANDLER ════════════════════════════════════════════════════════

async function maybeHandleChallengeRoute(req, res, reqUrl) {
  if (!reqUrl.pathname.startsWith('/api/challenge/')) {
    return false;
  }

  try {
    const user = getAuthenticatedUser(req);
    
    // ─── GET /api/challenge/constants ─────────────────────────────────────
    if (reqUrl.pathname === '/api/challenge/constants') {
      if (req.method !== 'GET') {
        methodNotAllowed(res);
        return true;
      }
      
      sendJson(res, 200, {
        CHALLENGE_DURATION_DAYS,
        WEEKLY_CHECKINS_REQUIRED,
        TRADES_REQUIRED,
        PROFIT_TARGET_PERCENT,
        MAX_DRAWDOWN_PERCENT
      });
      return true;
    }

    // All other routes require authentication
    if (!user) {
      unauthorized(res);
      return true;
    }

    // ─── GET /api/challenge/current ───────────────────────────────────────
    if (reqUrl.pathname === '/api/challenge/current') {
      if (req.method !== 'GET') {
        methodNotAllowed(res);
        return true;
      }
      
      const challenge = await getChallengeByUserId(user.id);
      if (!challenge) {
        sendJson(res, 200, { challenge: null });
        return true;
      }
      
      sendJson(res, 200, {
        challenge: sanitizeChallenge(challenge),
        trades: challenge.trades || [],
        weeklyCheckins: challenge.weeklyCheckins || [],
        statements: (challenge.brokerStatements || []).map(s => ({
          id: s.id,
          fileType: s.fileType,
          originalFileName: s.originalFileName,
          parseStatus: s.parseStatus,
          createdAt: s.createdAt
        }))
      });
      return true;
    }

    // ─── POST /api/challenge/start ────────────────────────────────────────
    if (reqUrl.pathname === '/api/challenge/start') {
      if (req.method !== 'POST') {
        methodNotAllowed(res);
        return true;
      }
      
      const { fields } = await parseMultipart(req);
      const initialBalance = parseFloat(fields.initialBalance);
      
      if (!initialBalance || initialBalance <= 0) {
        sendJson(res, 400, { error: 'Initial balance is required and must be positive.' });
        return true;
      }
      
      const challenge = await startChallenge(user.id, initialBalance);
      
      sendJson(res, 201, {
        message: 'Challenge started successfully.',
        challenge: sanitizeChallenge(challenge)
      });
      return true;
    }

    // ─── POST /api/challenge/trade ────────────────────────────────────────
    if (reqUrl.pathname === '/api/challenge/trade') {
      if (req.method !== 'POST') {
        methodNotAllowed(res);
        return true;
      }
      
      const activeChallenge = await getActiveChallengeByUserId(user.id);
      if (!activeChallenge) {
        sendJson(res, 400, { error: 'No active challenge found. Start a challenge first.' });
        return true;
      }
      
      const { fields, files } = await parseMultipart(req);
      
      // Validate required fields
      if (!fields.symbol || !fields.direction || !fields.entryPrice || !fields.exitPrice) {
        sendJson(res, 400, { error: 'Missing required fields: symbol, direction, entryPrice, exitPrice.' });
        return true;
      }
      
      // Save screenshot if provided
      let screenshotPath = null;
      if (files.screenshot) {
        screenshotPath = saveFile(files.screenshot, SCREENSHOTS_DIR, `trade_${user.id}`);
      }
      
      const { challenge, trade } = await addTrade(activeChallenge.id, {
        symbol: fields.symbol,
        direction: fields.direction,
        lotSize: fields.lotSize,
        entryPrice: fields.entryPrice,
        exitPrice: fields.exitPrice,
        stopLoss: fields.stopLoss,
        takeProfit: fields.takeProfit,
        pnl: fields.pnl,
        pnlPercent: fields.pnlPercent,
        entryTime: fields.entryTime,
        exitTime: fields.exitTime,
        notes: fields.notes
      }, screenshotPath);
      
      sendJson(res, 201, {
        message: `Trade #${trade.tradeNumber} logged successfully.`,
        trade,
        challenge: sanitizeChallenge(challenge)
      });
      return true;
    }

    // ─── POST /api/challenge/checkin ──────────────────────────────────────
    if (reqUrl.pathname === '/api/challenge/checkin') {
      if (req.method !== 'POST') {
        methodNotAllowed(res);
        return true;
      }
      
      const activeChallenge = await getActiveChallengeByUserId(user.id);
      if (!activeChallenge) {
        sendJson(res, 400, { error: 'No active challenge found.' });
        return true;
      }
      
      const { fields, files } = await parseMultipart(req);
      
      if (!fields.equityValue) {
        sendJson(res, 400, { error: 'Equity value is required.' });
        return true;
      }
      
      // Save screenshot if provided
      let screenshotPath = null;
      if (files.screenshot) {
        screenshotPath = saveFile(files.screenshot, SCREENSHOTS_DIR, `checkin_${user.id}`);
      }
      
      const { challenge, checkin } = await addWeeklyCheckin(activeChallenge.id, {
        equityValue: fields.equityValue,
        notes: fields.notes
      }, screenshotPath);
      
      sendJson(res, 201, {
        message: `Week ${checkin.weekNumber} check-in recorded.`,
        checkin,
        challenge: sanitizeChallenge(challenge)
      });
      return true;
    }

    // ─── POST /api/challenge/statement ────────────────────────────────────
    if (reqUrl.pathname === '/api/challenge/statement') {
      if (req.method !== 'POST') {
        methodNotAllowed(res);
        return true;
      }
      
      const activeChallenge = await getActiveChallengeByUserId(user.id);
      if (!activeChallenge) {
        sendJson(res, 400, { error: 'No active challenge found.' });
        return true;
      }
      
      const { fields, files } = await parseMultipart(req);
      
      if (!files.statement) {
        sendJson(res, 400, { error: 'Statement file is required.' });
        return true;
      }
      
      // Save statement file
      const filePath = saveFile(files.statement, STATEMENTS_DIR, `statement_${user.id}`);
      const ext = path.extname(files.statement.filename).toLowerCase();
      
      // Add statement to challenge
      const { challenge, statement } = await addBrokerStatement(activeChallenge.id, {
        fileType: ext.replace('.', '') || 'unknown',
        originalFileName: files.statement.filename
      }, filePath);
      
      // Try to parse the statement
      let parsedData = null;
      let parseStatus = 'pending';
      let parseError = null;
      
      try {
        parsedData = parseStatement(filePath);
        parseStatus = parsedData.trades.length > 0 ? 'success' : 'no_trades';
        
        if (parsedData.parseErrors && parsedData.parseErrors.length > 0) {
          parseError = parsedData.parseErrors.join('; ');
        }
      } catch (e) {
        parseStatus = 'failed';
        parseError = e.message;
      }
      
      // Update statement with parsed data
      await updateStatementParsedData(activeChallenge.id, statement.id, parsedData, parseStatus, parseError);
      
      // Run verification if parsing succeeded
      let verificationResult = null;
      if (parseStatus === 'success' && parsedData) {
        try {
          verificationResult = await runFullVerification(challenge, parsedData);
        } catch (e) {
          console.error('Verification failed:', e.message);
        }
      }
      
      sendJson(res, 201, {
        message: 'Statement uploaded and processed.',
        statement: {
          id: statement.id,
          fileType: statement.fileType,
          parseStatus,
          parseError,
          tradesFound: parsedData?.trades?.length || 0
        },
        verification: verificationResult ? {
          isClean: verificationResult.summary.isClean,
          matchRate: verificationResult.summary.matchRate,
          criticalFlags: verificationResult.summary.criticalFlags,
          warningFlags: verificationResult.summary.warningFlags
        } : null,
        challenge: sanitizeChallenge(challenge)
      });
      return true;
    }

    // ─── POST /api/challenge/submit ───────────────────────────────────────
    if (reqUrl.pathname === '/api/challenge/submit') {
      if (req.method !== 'POST') {
        methodNotAllowed(res);
        return true;
      }
      
      const activeChallenge = await getActiveChallengeByUserId(user.id);
      if (!activeChallenge) {
        sendJson(res, 400, { error: 'No active challenge found.' });
        return true;
      }
      
      const challenge = await submitForReview(activeChallenge.id);
      
      sendJson(res, 200, {
        message: 'Challenge submitted for review.',
        challenge: sanitizeChallenge(challenge)
      });
      return true;
    }

    // ─── GET /api/challenge/reports ───────────────────────────────────────
    if (reqUrl.pathname === '/api/challenge/reports') {
      if (req.method !== 'GET') {
        methodNotAllowed(res);
        return true;
      }
      
      const challenge = await getChallengeByUserId(user.id);
      if (!challenge) {
        sendJson(res, 200, { reports: [] });
        return true;
      }
      
      const reports = await getReportsByChallengeId(challenge.id);
      
      sendJson(res, 200, { reports });
      return true;
    }

    // Not found
    sendJson(res, 404, { error: 'Challenge endpoint not found.' });
    return true;

  } catch (error) {
    console.error('[challenge] Error:', error.message);
    sendJson(res, error.statusCode || 500, {
      error: error.message || 'Challenge request failed.'
    });
    return true;
  }
}

module.exports = {
  maybeHandleChallengeRoute
};
