'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const CHALLENGES_FILE = path.join(DATA_DIR, 'challenges.json');
const REPORTS_FILE = path.join(DATA_DIR, 'verification-reports.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const SCREENSHOTS_DIR = path.join(UPLOADS_DIR, 'screenshots');
const STATEMENTS_DIR = path.join(UPLOADS_DIR, 'statements');

// Challenge constants
const CHALLENGE_DURATION_DAYS = 60;
const WEEKLY_CHECKINS_REQUIRED = 8;
const TRADES_REQUIRED = 55;
const PROFIT_TARGET_PERCENT = 6;
const MAX_DRAWDOWN_PERCENT = 10;

const CHALLENGE_STATUSES = ['active', 'pending_review', 'passed', 'failed'];
const TRADE_VALIDATION_STATUSES = ['pending', 'matched', 'mismatch', 'extra', 'missing'];

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

function ensureDirectories() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  fs.mkdirSync(STATEMENTS_DIR, { recursive: true });
}

function ensureStore(filePath, defaultData) {
  ensureDirectories();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

function readStore(filePath, defaultData) {
  ensureStore(filePath, defaultData);
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw ? JSON.parse(raw) : defaultData;
}

function writeStore(filePath, data) {
  ensureDirectories();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function withMutation(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.catch(() => {});
  return run;
}

// ═══ CHALLENGES ═══════════════════════════════════════════════════════════

function readChallenges() {
  return readStore(CHALLENGES_FILE, { challenges: [] });
}

function writeChallenges(store) {
  writeStore(CHALLENGES_FILE, store);
}

function findChallengeById(store, challengeId) {
  return store.challenges.find(c => c.id === challengeId) || null;
}

function findChallengeByUserId(store, userId) {
  return store.challenges.find(c => c.userId === userId && c.status === 'active') || null;
}

function findLatestChallengeByUserId(store, userId) {
  const userChallenges = store.challenges
    .filter(c => c.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return userChallenges[0] || null;
}

function calculateDaysRemaining(endDate) {
  if (!endDate) return null;
  const end = new Date(endDate);
  const now = new Date();
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function calculateProfit(initialBalance, currentBalance) {
  if (!initialBalance || initialBalance === 0) return 0;
  return ((currentBalance - initialBalance) / initialBalance) * 100;
}

function calculateDrawdown(highWaterMark, currentBalance) {
  if (!highWaterMark || highWaterMark === 0) return 0;
  const drawdown = ((highWaterMark - currentBalance) / highWaterMark) * 100;
  return Math.max(0, drawdown);
}

async function startChallenge(userId, initialBalance) {
  return withMutation(async () => {
    const store = readChallenges();
    
    // Check if user already has active challenge
    const existing = findChallengeByUserId(store, userId);
    if (existing) {
      throw createHttpError(400, 'You already have an active challenge.');
    }
    
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + CHALLENGE_DURATION_DAYS);
    
    const challenge = {
      id: createId('chl_'),
      userId,
      status: 'active',
      startDate: now.toISOString(),
      endDate: endDate.toISOString(),
      initialBalance: parseFloat(initialBalance),
      currentBalance: parseFloat(initialBalance),
      highWaterMark: parseFloat(initialBalance),
      maxDrawdown: 0,
      trades: [],
      weeklyCheckins: [],
      brokerStatements: [],
      failReason: null,
      adminNotes: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    
    store.challenges.push(challenge);
    writeChallenges(store);
    
    return challenge;
  });
}

async function addTrade(challengeId, tradeData, screenshotPath) {
  return withMutation(async () => {
    const store = readChallenges();
    const challenge = findChallengeById(store, challengeId);
    
    if (!challenge) {
      throw createHttpError(404, 'Challenge not found.');
    }
    
    if (challenge.status !== 'active') {
      throw createHttpError(400, 'Challenge is not active.');
    }
    
    const trade = {
      id: createId('trd_'),
      tradeNumber: challenge.trades.length + 1,
      symbol: tradeData.symbol,
      direction: tradeData.direction,
      lotSize: parseFloat(tradeData.lotSize),
      entryPrice: parseFloat(tradeData.entryPrice),
      exitPrice: parseFloat(tradeData.exitPrice),
      stopLoss: parseFloat(tradeData.stopLoss) || null,
      takeProfit: parseFloat(tradeData.takeProfit) || null,
      pnl: parseFloat(tradeData.pnl),
      pnlPercent: parseFloat(tradeData.pnlPercent) || null,
      entryTime: tradeData.entryTime || null,
      exitTime: tradeData.exitTime || null,
      screenshotPath: screenshotPath || null,
      notes: tradeData.notes || '',
      validationStatus: 'pending',
      validationNotes: null,
      createdAt: nowIso()
    };
    
    challenge.trades.push(trade);
    
    // Update balance if PnL provided
    if (trade.pnl) {
      challenge.currentBalance += trade.pnl;
      if (challenge.currentBalance > challenge.highWaterMark) {
        challenge.highWaterMark = challenge.currentBalance;
      }
      
      // Check drawdown
      const currentDrawdown = calculateDrawdown(challenge.highWaterMark, challenge.currentBalance);
      if (currentDrawdown > challenge.maxDrawdown) {
        challenge.maxDrawdown = currentDrawdown;
      }
      
      // Auto-fail if drawdown exceeded
      if (currentDrawdown >= MAX_DRAWDOWN_PERCENT) {
        challenge.status = 'failed';
        challenge.failReason = 'drawdown_exceeded';
      }
    }
    
    challenge.updatedAt = nowIso();
    writeChallenges(store);
    
    return { challenge, trade };
  });
}

async function addWeeklyCheckin(challengeId, checkinData, screenshotPath) {
  return withMutation(async () => {
    const store = readChallenges();
    const challenge = findChallengeById(store, challengeId);
    
    if (!challenge) {
      throw createHttpError(404, 'Challenge not found.');
    }
    
    if (challenge.status !== 'active') {
      throw createHttpError(400, 'Challenge is not active.');
    }
    
    const checkin = {
      id: createId('chk_'),
      weekNumber: challenge.weeklyCheckins.length + 1,
      equityValue: parseFloat(checkinData.equityValue),
      screenshotPath: screenshotPath || null,
      notes: checkinData.notes || '',
      createdAt: nowIso()
    };
    
    challenge.weeklyCheckins.push(checkin);
    
    // Update current balance
    challenge.currentBalance = checkin.equityValue;
    if (challenge.currentBalance > challenge.highWaterMark) {
      challenge.highWaterMark = challenge.currentBalance;
    }
    
    // Check drawdown
    const currentDrawdown = calculateDrawdown(challenge.highWaterMark, challenge.currentBalance);
    if (currentDrawdown > challenge.maxDrawdown) {
      challenge.maxDrawdown = currentDrawdown;
    }
    
    if (currentDrawdown >= MAX_DRAWDOWN_PERCENT) {
      challenge.status = 'failed';
      challenge.failReason = 'drawdown_exceeded';
    }
    
    challenge.updatedAt = nowIso();
    writeChallenges(store);
    
    return { challenge, checkin };
  });
}

async function addBrokerStatement(challengeId, statementData, filePath) {
  return withMutation(async () => {
    const store = readChallenges();
    const challenge = findChallengeById(store, challengeId);
    
    if (!challenge) {
      throw createHttpError(404, 'Challenge not found.');
    }
    
    if (challenge.status !== 'active') {
      throw createHttpError(400, 'Challenge is not active.');
    }
    
    const statement = {
      id: createId('stm_'),
      filePath,
      fileType: statementData.fileType || 'unknown',
      originalFileName: statementData.originalFileName,
      parsedData: null,
      parseStatus: 'pending',
      parseError: null,
      createdAt: nowIso()
    };
    
    challenge.brokerStatements.push(statement);
    challenge.updatedAt = nowIso();
    writeChallenges(store);
    
    return { challenge, statement };
  });
}

async function updateStatementParsedData(challengeId, statementId, parsedData, parseStatus, parseError) {
  return withMutation(async () => {
    const store = readChallenges();
    const challenge = findChallengeById(store, challengeId);
    
    if (!challenge) {
      throw createHttpError(404, 'Challenge not found.');
    }
    
    const statement = challenge.brokerStatements.find(s => s.id === statementId);
    if (!statement) {
      throw createHttpError(404, 'Statement not found.');
    }
    
    statement.parsedData = parsedData;
    statement.parseStatus = parseStatus;
    statement.parseError = parseError || null;
    
    challenge.updatedAt = nowIso();
    writeChallenges(store);
    
    return { challenge, statement };
  });
}

async function submitForReview(challengeId) {
  return withMutation(async () => {
    const store = readChallenges();
    const challenge = findChallengeById(store, challengeId);
    
    if (!challenge) {
      throw createHttpError(404, 'Challenge not found.');
    }
    
    if (challenge.status !== 'active') {
      throw createHttpError(400, 'Challenge is not active.');
    }
    
    // Check minimum requirements
    if (challenge.trades.length < TRADES_REQUIRED) {
      throw createHttpError(400, `You need at least ${TRADES_REQUIRED} trades to submit for review. You have ${challenge.trades.length}.`);
    }
    
    if (challenge.weeklyCheckins.length < WEEKLY_CHECKINS_REQUIRED) {
      throw createHttpError(400, `You need at least ${WEEKLY_CHECKINS_REQUIRED} weekly check-ins. You have ${challenge.weeklyCheckins.length}.`);
    }
    
    if (challenge.brokerStatements.length === 0) {
      throw createHttpError(400, 'You must upload at least one broker statement.');
    }
    
    challenge.status = 'pending_review';
    challenge.updatedAt = nowIso();
    writeChallenges(store);
    
    return challenge;
  });
}

async function getChallengeById(challengeId) {
  const store = readChallenges();
  return findChallengeById(store, challengeId);
}

async function getChallengeByUserId(userId) {
  const store = readChallenges();
  return findLatestChallengeByUserId(store, userId);
}

async function getActiveChallengeByUserId(userId) {
  const store = readChallenges();
  return findChallengeByUserId(store, userId);
}

// ═══ ADMIN FUNCTIONS ══════════════════════════════════════════════════════

async function listChallenges(filters = {}) {
  const store = readChallenges();
  let challenges = store.challenges;
  
  if (filters.status) {
    challenges = challenges.filter(c => c.status === filters.status);
  }
  
  if (filters.userId) {
    challenges = challenges.filter(c => c.userId === filters.userId);
  }
  
  // Sort by updatedAt desc
  challenges.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  
  return challenges;
}

async function approveChallenge(challengeId, adminUserId, notes) {
  return withMutation(async () => {
    const store = readChallenges();
    const challenge = findChallengeById(store, challengeId);
    
    if (!challenge) {
      throw createHttpError(404, 'Challenge not found.');
    }
    
    if (challenge.status !== 'pending_review') {
      throw createHttpError(400, 'Challenge is not pending review.');
    }
    
    challenge.status = 'passed';
    challenge.adminNotes = notes || null;
    challenge.reviewedBy = adminUserId;
    challenge.reviewedAt = nowIso();
    challenge.updatedAt = nowIso();
    
    writeChallenges(store);
    return challenge;
  });
}

async function rejectChallenge(challengeId, adminUserId, reason, notes) {
  return withMutation(async () => {
    const store = readChallenges();
    const challenge = findChallengeById(store, challengeId);
    
    if (!challenge) {
      throw createHttpError(404, 'Challenge not found.');
    }
    
    if (challenge.status !== 'pending_review') {
      throw createHttpError(400, 'Challenge is not pending review.');
    }
    
    challenge.status = 'failed';
    challenge.failReason = reason || 'admin_rejected';
    challenge.adminNotes = notes || null;
    challenge.reviewedBy = adminUserId;
    challenge.reviewedAt = nowIso();
    challenge.updatedAt = nowIso();
    
    writeChallenges(store);
    return challenge;
  });
}

async function updateTradeValidation(challengeId, tradeId, validationStatus, validationNotes) {
  return withMutation(async () => {
    const store = readChallenges();
    const challenge = findChallengeById(store, challengeId);
    
    if (!challenge) {
      throw createHttpError(404, 'Challenge not found.');
    }
    
    const trade = challenge.trades.find(t => t.id === tradeId);
    if (!trade) {
      throw createHttpError(404, 'Trade not found.');
    }
    
    trade.validationStatus = validationStatus;
    trade.validationNotes = validationNotes || null;
    
    challenge.updatedAt = nowIso();
    writeChallenges(store);
    
    return { challenge, trade };
  });
}

// ═══ VERIFICATION REPORTS ═════════════════════════════════════════════════

function readReports() {
  return readStore(REPORTS_FILE, { reports: [] });
}

function writeReports(store) {
  writeStore(REPORTS_FILE, store);
}

async function createVerificationReport(challengeId, reportData) {
  return withMutation(async () => {
    const store = readReports();
    
    const report = {
      id: createId('rpt_'),
      challengeId,
      statementId: reportData.statementId,
      totalSelfReported: reportData.totalSelfReported,
      totalInStatement: reportData.totalInStatement,
      matchedCount: reportData.matchedCount,
      mismatchCount: reportData.mismatchCount,
      missingCount: reportData.missingCount,
      extraCount: reportData.extraCount,
      flags: reportData.flags || [],
      matchDetails: reportData.matchDetails || [],
      createdAt: nowIso()
    };
    
    store.reports.push(report);
    writeReports(store);
    
    return report;
  });
}

async function getReportsByChallengeId(challengeId) {
  const store = readReports();
  return store.reports.filter(r => r.challengeId === challengeId);
}

// ═══ EXPORTS ══════════════════════════════════════════════════════════════

module.exports = {
  // Constants
  CHALLENGE_DURATION_DAYS,
  WEEKLY_CHECKINS_REQUIRED,
  TRADES_REQUIRED,
  PROFIT_TARGET_PERCENT,
  MAX_DRAWDOWN_PERCENT,
  SCREENSHOTS_DIR,
  STATEMENTS_DIR,
  
  // Helpers
  createHttpError,
  createId,
  calculateDaysRemaining,
  calculateProfit,
  calculateDrawdown,
  
  // Challenge operations
  startChallenge,
  addTrade,
  addWeeklyCheckin,
  addBrokerStatement,
  updateStatementParsedData,
  submitForReview,
  getChallengeById,
  getChallengeByUserId,
  getActiveChallengeByUserId,
  
  // Admin operations
  listChallenges,
  approveChallenge,
  rejectChallenge,
  updateTradeValidation,
  
  // Reports
  createVerificationReport,
  getReportsByChallengeId
};
