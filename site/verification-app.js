/**
 * ALTIVOR INSTITUTE — Verification Center Application
 * Challenge verification system with backend API integration
 * Falls back to localStorage for unauthenticated users
 */

(function() {
  'use strict';

  // ═══ CONSTANTS ═══════════════════════════════════════════════════════════
  const STORAGE_KEY = 'altivor_challenge_v1';
  const API_BASE = '/api/challenge';
  
  // Will be loaded from backend
  let CHALLENGE_DURATION_DAYS = 60;
  let WEEKLY_CHECKINS_REQUIRED = 8;
  let TRADES_REQUIRED = 55;
  let PROFIT_TARGET_PERCENT = 6;
  let MAX_DRAWDOWN_PERCENT = 10;

  // ═══ STATE ═══════════════════════════════════════════════════════════════
  let isAuthenticated = false;
  let challengeData = {
    status: 'not_started', // not_started, active, pending_review, passed, failed
    startDate: null,
    endDate: null,
    initialBalance: 0,
    currentBalance: 0,
    highWaterMark: 0,
    maxDrawdown: 0,
    currentProfit: 0,
    daysRemaining: null,
    weeklyCheckins: [],
    trades: [],
    brokerStatements: [],
    failReason: null,
    passedDate: null
  };

  // ═══ API HELPERS ═════════════════════════════════════════════════════════
  async function apiRequest(endpoint, options = {}) {
    const url = API_BASE + endpoint;
    const config = {
      headers: {
        'Accept': 'application/json'
      },
      credentials: 'same-origin',
      ...options
    };
    
    // Don't set Content-Type for FormData (browser will set it with boundary)
    if (options.body && !(options.body instanceof FormData)) {
      config.headers['Content-Type'] = 'application/json';
    }
    
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    
    return data;
  }

  async function checkAuth() {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
      const data = await response.json();
      isAuthenticated = data.authenticated === true;
      return isAuthenticated;
    } catch (e) {
      isAuthenticated = false;
      return false;
    }
  }

  // ═══ INITIALIZATION ══════════════════════════════════════════════════════
  async function init() {
    // Load constants from backend
    try {
      const constants = await apiRequest('/constants');
      CHALLENGE_DURATION_DAYS = constants.CHALLENGE_DURATION_DAYS || 60;
      WEEKLY_CHECKINS_REQUIRED = constants.WEEKLY_CHECKINS_REQUIRED || 8;
      TRADES_REQUIRED = constants.TRADES_REQUIRED || 55;
      PROFIT_TARGET_PERCENT = constants.PROFIT_TARGET_PERCENT || 6;
      MAX_DRAWDOWN_PERCENT = constants.MAX_DRAWDOWN_PERCENT || 10;
    } catch (e) {
      console.warn('Failed to load constants from backend, using defaults');
    }
    
    await loadData();
    syncToVerificationStores();
    renderDashboard();
    setupEventListeners();
  }

  async function loadData() {
    // Check if user is authenticated
    await checkAuth();
    
    if (isAuthenticated) {
      // Load from backend
      try {
        const data = await apiRequest('/current');
        if (data.challenge) {
          challengeData = {
            id: data.challenge.id,
            status: data.challenge.status,
            startDate: data.challenge.startDate,
            endDate: data.challenge.endDate,
            initialBalance: data.challenge.initialBalance,
            currentBalance: data.challenge.currentBalance,
            highWaterMark: data.challenge.highWaterMark,
            maxDrawdown: data.challenge.maxDrawdown,
            currentProfit: data.challenge.currentProfit,
            daysRemaining: data.challenge.daysRemaining,
            weeklyCheckins: data.weeklyCheckins || [],
            trades: data.trades || [],
            brokerStatements: data.statements || [],
            failReason: data.challenge.failReason,
            passedDate: null
          };
        } else {
          // No challenge yet
          challengeData.status = 'not_started';
        }
        return;
      } catch (e) {
        console.warn('Failed to load from backend, falling back to localStorage:', e.message);
      }
    }
    
    // Fallback to localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        challengeData = { ...challengeData, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to load challenge data:', e);
    }
  }

  function saveDataLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(challengeData));
    } catch (e) {
      console.warn('Failed to save challenge data:', e);
    }
  }

  // ═══ CALCULATIONS ════════════════════════════════════════════════════════
  function calculateDaysRemaining() {
    if (!challengeData.endDate) return null;
    const end = new Date(challengeData.endDate);
    const now = new Date();
    const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  function calculateCurrentProfit() {
    if (!challengeData.initialBalance || challengeData.initialBalance === 0) return 0;
    return ((challengeData.currentBalance - challengeData.initialBalance) / challengeData.initialBalance) * 100;
  }

  function calculateDrawdown() {
    if (!challengeData.highWaterMark || challengeData.highWaterMark === 0) return 0;
    const drawdown = ((challengeData.highWaterMark - challengeData.currentBalance) / challengeData.highWaterMark) * 100;
    return Math.max(0, drawdown);
  }

  function updateHighWaterMark(balance) {
    if (balance > challengeData.highWaterMark) {
      challengeData.highWaterMark = balance;
    }
  }

  function checkDrawdownLimit() {
    const currentDrawdown = calculateDrawdown();
    if (currentDrawdown > challengeData.maxDrawdown) {
      challengeData.maxDrawdown = currentDrawdown;
    }
    if (currentDrawdown >= MAX_DRAWDOWN_PERCENT) {
      failChallenge('drawdown_exceeded');
      return true;
    }
    return false;
  }

  function checkChallengeCompletion() {
    if (challengeData.status !== 'active') return;

    const daysRemaining = calculateDaysRemaining();
    const profit = calculateCurrentProfit();
    const tradesCompleted = challengeData.trades.length;
    const weeklyCheckinsCompleted = challengeData.weeklyCheckins.length;

    // Check if time is up
    if (daysRemaining === 0) {
      // Check if all requirements are met
      if (profit >= PROFIT_TARGET_PERCENT && 
          tradesCompleted >= TRADES_REQUIRED && 
          weeklyCheckinsCompleted >= WEEKLY_CHECKINS_REQUIRED &&
          challengeData.brokerStatement) {
        passChallenge();
      } else {
        let reason = 'requirements_not_met';
        if (profit < PROFIT_TARGET_PERCENT) reason = 'profit_target_not_reached';
        else if (tradesCompleted < TRADES_REQUIRED) reason = 'trades_incomplete';
        else if (weeklyCheckinsCompleted < WEEKLY_CHECKINS_REQUIRED) reason = 'weekly_checkins_incomplete';
        else if (!challengeData.brokerStatement) reason = 'statement_not_submitted';
        failChallenge(reason);
      }
    }
  }

  function passChallenge() {
    challengeData.status = 'passed';
    challengeData.passedDate = new Date().toISOString();
    saveDataLocal();
    syncToVerificationStores();
    renderDashboard();
  }

  function failChallenge(reason) {
    challengeData.status = 'failed';
    challengeData.failReason = reason;
    saveDataLocal();
    syncToVerificationStores();
    renderDashboard();
  }

  // ═══ CHALLENGE MANAGEMENT ════════════════════════════════════════════════
  async function startChallenge(initialBalance) {
    if (isAuthenticated) {
      try {
        const formData = new FormData();
        formData.append('initialBalance', initialBalance);
        
        const result = await apiRequest('/start', {
          method: 'POST',
          body: formData
        });
        
        if (result.challenge) {
          challengeData = {
            id: result.challenge.id,
            status: result.challenge.status,
            startDate: result.challenge.startDate,
            endDate: result.challenge.endDate,
            initialBalance: result.challenge.initialBalance,
            currentBalance: result.challenge.currentBalance,
            highWaterMark: result.challenge.highWaterMark,
            maxDrawdown: result.challenge.maxDrawdown,
            currentProfit: result.challenge.currentProfit,
            daysRemaining: result.challenge.daysRemaining,
            weeklyCheckins: [],
            trades: [],
            brokerStatements: [],
            failReason: null,
            passedDate: null
          };
        }
        renderDashboard();
        return;
      } catch (e) {
        console.error('Failed to start challenge via API:', e.message);
        alert('Error: ' + e.message);
        return;
      }
    }
    
    // Fallback to localStorage
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + CHALLENGE_DURATION_DAYS);

    challengeData = {
      status: 'active',
      startDate: now.toISOString(),
      endDate: endDate.toISOString(),
      initialBalance: parseFloat(initialBalance),
      currentBalance: parseFloat(initialBalance),
      highWaterMark: parseFloat(initialBalance),
      maxDrawdown: 0,
      currentProfit: 0,
      weeklyCheckins: [],
      trades: [],
      brokerStatements: [],
      failReason: null,
      passedDate: null
    };

    saveDataLocal();
    syncToVerificationStores();
    renderDashboard();
  }

  function updateBalance(newBalance) {
    newBalance = parseFloat(newBalance);
    challengeData.currentBalance = newBalance;
    updateHighWaterMark(newBalance);
    challengeData.currentProfit = calculateCurrentProfit();
    
    if (!checkDrawdownLimit()) {
      saveDataLocal();
      syncToVerificationStores();
      renderDashboard();
    }
  }

  // ═══ WEEKLY CHECK-IN ═════════════════════════════════════════════════════
  async function addWeeklyCheckin(data) {
    if (isAuthenticated && challengeData.id) {
      try {
        const formData = new FormData();
        formData.append('equityValue', data.equityValue);
        if (data.notes) formData.append('notes', data.notes);
        if (data.screenshotFile) formData.append('screenshot', data.screenshotFile);
        
        const result = await apiRequest('/checkin', {
          method: 'POST',
          body: formData
        });
        
        if (result.checkin) {
          challengeData.weeklyCheckins.push(result.checkin);
        }
        if (result.challenge) {
          challengeData.currentBalance = result.challenge.currentBalance;
          challengeData.highWaterMark = result.challenge.highWaterMark;
          challengeData.maxDrawdown = result.challenge.maxDrawdown;
          challengeData.status = result.challenge.status;
        }
        renderDashboard();
        return result.checkin;
      } catch (e) {
        console.error('Failed to add checkin via API:', e.message);
        alert('Error: ' + e.message);
        return null;
      }
    }
    
    // Fallback to localStorage
    const checkin = {
      id: Date.now(),
      date: new Date().toISOString(),
      weekNumber: challengeData.weeklyCheckins.length + 1,
      equityScreenshot: data.screenshot,
      equityValue: parseFloat(data.equityValue),
      notes: data.notes || ''
    };

    challengeData.weeklyCheckins.push(checkin);
    updateBalance(data.equityValue);
    saveDataLocal();
    syncToVerificationStores();
    renderDashboard();
    return checkin;
  }

  // ═══ TRADE LOGGING ═══════════════════════════════════════════════════════
  async function addTrade(tradeData) {
    if (isAuthenticated && challengeData.id) {
      try {
        const formData = new FormData();
        formData.append('symbol', tradeData.symbol || 'US100');
        formData.append('direction', tradeData.direction);
        formData.append('lotSize', tradeData.positionSize || tradeData.lotSize || 0);
        formData.append('entryPrice', tradeData.entryPrice);
        formData.append('exitPrice', tradeData.exitPrice);
        if (tradeData.stopLoss) formData.append('stopLoss', tradeData.stopLoss);
        if (tradeData.takeProfit) formData.append('takeProfit', tradeData.takeProfit);
        formData.append('pnl', tradeData.pnl);
        if (tradeData.pnlPercent) formData.append('pnlPercent', tradeData.pnlPercent);
        if (tradeData.entryTime) formData.append('entryTime', tradeData.entryTime);
        if (tradeData.exitTime) formData.append('exitTime', tradeData.exitTime);
        if (tradeData.notes) formData.append('notes', tradeData.notes);
        if (tradeData.screenshotFile) formData.append('screenshot', tradeData.screenshotFile);
        
        const result = await apiRequest('/trade', {
          method: 'POST',
          body: formData
        });
        
        if (result.trade) {
          challengeData.trades.push(result.trade);
        }
        if (result.challenge) {
          challengeData.currentBalance = result.challenge.currentBalance;
          challengeData.highWaterMark = result.challenge.highWaterMark;
          challengeData.maxDrawdown = result.challenge.maxDrawdown;
          challengeData.status = result.challenge.status;
          challengeData.failReason = result.challenge.failReason;
        }
        renderDashboard();
        return result.trade;
      } catch (e) {
        console.error('Failed to add trade via API:', e.message);
        alert('Error: ' + e.message);
        return null;
      }
    }
    
    // Fallback to localStorage
    const trade = {
      id: Date.now(),
      tradeNumber: challengeData.trades.length + 1,
      date: tradeData.date || new Date().toISOString(),
      direction: tradeData.direction,
      entryPrice: parseFloat(tradeData.entryPrice),
      exitPrice: parseFloat(tradeData.exitPrice),
      stopLoss: parseFloat(tradeData.stopLoss),
      takeProfit: parseFloat(tradeData.takeProfit),
      positionSize: parseFloat(tradeData.positionSize),
      pnl: parseFloat(tradeData.pnl),
      pnlPercent: parseFloat(tradeData.pnlPercent),
      entryTime: tradeData.entryTime || null,
      exitTime: tradeData.exitTime || null,
      screenshot: tradeData.screenshot,
      notes: tradeData.notes || '',
      compliant: validateTrade(tradeData)
    };

    // Attach scoring metadata if provided
    if (tradeData._scoring) {
      trade._scoring = tradeData._scoring;
    }

    challengeData.trades.push(trade);

    // Auto-update balance from trade PnL
    if (trade.pnl && !isNaN(trade.pnl)) {
      challengeData.currentBalance += trade.pnl;
      updateHighWaterMark(challengeData.currentBalance);
      challengeData.currentProfit = calculateCurrentProfit();
      challengeData.maxDrawdown = Math.max(challengeData.maxDrawdown, calculateDrawdown());
    }

    runScoringEngine();
    saveDataLocal();
    syncToVerificationStores();
    checkDrawdownLimit();
    renderDashboard();
    return trade;
  }

  function validateTrade(trade) {
    // Basic validation rules
    const issues = [];

    if (!trade.stopLoss || trade.stopLoss <= 0) {
      issues.push('missing_stop_loss');
    }

    if (!trade.screenshot && !trade.screenshotFile) {
      issues.push('missing_screenshot');
    }

    if (!trade.entryPrice || !trade.exitPrice) {
      issues.push('missing_prices');
    }

    // Direction validation
    if (trade.direction === 'long') {
      if (trade.stopLoss >= trade.entryPrice) {
        issues.push('invalid_sl_direction');
      }
    } else if (trade.direction === 'short') {
      if (trade.stopLoss <= trade.entryPrice) {
        issues.push('invalid_sl_direction');
      }
    }

    return issues.length === 0;
  }

  // ═══ BROKER STATEMENT ════════════════════════════════════════════════════
  async function submitBrokerStatement(statementData) {
    if (isAuthenticated && challengeData.id) {
      try {
        const formData = new FormData();
        if (statementData.file instanceof File) {
          formData.append('statement', statementData.file);
        }
        
        const result = await apiRequest('/statement', {
          method: 'POST',
          body: formData
        });
        
        if (result.statement) {
          challengeData.brokerStatements.push(result.statement);
        }
        if (result.challenge) {
          challengeData.currentBalance = result.challenge.currentBalance;
          challengeData.status = result.challenge.status;
        }
        
        // Show verification result if available
        if (result.verification) {
          const msg = result.verification.isClean 
            ? `Statement processed. Match rate: ${result.verification.matchRate.toFixed(1)}%`
            : `Statement processed with ${result.verification.criticalFlags} critical flags. Match rate: ${result.verification.matchRate.toFixed(1)}%`;
          alert(msg);
        }
        
        renderDashboard();
        return result.statement;
      } catch (e) {
        console.error('Failed to submit statement via API:', e.message);
        alert('Error: ' + e.message);
        return null;
      }
    }
    
    // Fallback to localStorage
    const statement = {
      id: Date.now(),
      date: new Date().toISOString(),
      file: statementData.file,
      fileName: statementData.fileName,
      finalEquity: parseFloat(statementData.finalEquity),
      totalTrades: parseInt(statementData.totalTrades),
      verified: false
    };
    
    challengeData.brokerStatements.push(statement);
    updateBalance(statementData.finalEquity);
    checkChallengeCompletion();
    saveDataLocal();
    syncToVerificationStores();
    renderDashboard();
    return statement;
  }
  
  // ═══ SUBMIT FOR REVIEW ══════════════════════════════════════════════════
  async function submitForReview() {
    if (!isAuthenticated || !challengeData.id) {
      alert('You must be logged in to submit for review.');
      return false;
    }
    
    try {
      const result = await apiRequest('/submit', {
        method: 'POST',
        body: JSON.stringify({})
      });
      
      if (result.challenge) {
        challengeData.status = result.challenge.status;
      }
      
      alert('Challenge submitted for admin review.');
      renderDashboard();
      return true;
    } catch (e) {
      console.error('Failed to submit for review:', e.message);
      alert('Error: ' + e.message);
      return false;
    }
  }

  // ═══ TRADER CLASSIFICATION ════════════════════════════════════════════════
  function computeTraderLevel() {
    const trades = challengeData.trades || [];
    const checkins = challengeData.weeklyCheckins || [];
    const dd = calculateDrawdown();
    const profit = calculateCurrentProfit();
    const total = trades.length;

    if (total === 0) return null;

    const compliant = trades.filter(t => t.compliant !== false).length;
    const disciplineScore = total > 0 ? (compliant / total) * 100 : 0;
    const ddUsage = dd / MAX_DRAWDOWN_PERCENT;
    const riskScore = Math.max(0, 100 - (ddUsage * 60));
    const consistencyScore = Math.min(100, (checkins.length / WEEKLY_CHECKINS_REQUIRED) * 100);
    const executionScore = Math.min(100, (total / TRADES_REQUIRED) * 100);
    const profitRatio = PROFIT_TARGET_PERCENT > 0 ? profit / PROFIT_TARGET_PERCENT : 0;
    const performanceScore = Math.min(100, Math.max(0, profitRatio * 70 + 30));

    const score = Math.round(
      disciplineScore * 0.30 +
      consistencyScore * 0.25 +
      riskScore * 0.20 +
      executionScore * 0.15 +
      performanceScore * 0.10
    );

    if (dd >= MAX_DRAWDOWN_PERCENT) return 'Not Ready';
    if (total >= 10 && disciplineScore < 70) return 'Not Ready';
    if (score < 40) return 'Not Ready';
    if (score < 55) return 'Emerging Trader';
    if (score < 70) return 'Developing Trader';
    if (score < 80) return 'Process-Consistent Trader';
    if (score < 90) return 'Funded-Ready Trader';
    return 'Elite Execution Trader';
  }

  // ═══ RENDERING ═══════════════════════════════════════════════════════════
  function renderDashboard() {
    // Update status banner
    const statusValue = document.getElementById('verifStatusValue');
    const timeRemaining = document.getElementById('verifTimeRemaining');
    const currentProfit = document.getElementById('verifCurrentProfit');
    const drawdown = document.getElementById('verifDrawdown');

    if (statusValue) {
      const statusMap = {
        'not_started': 'Not Started',
        'active': 'Active',
        'passed': 'PASSED',
        'failed': 'FAILED'
      };
      statusValue.textContent = statusMap[challengeData.status] || 'Not Started';
      statusValue.className = 'verif-status-value';
      if (challengeData.status === 'active') statusValue.classList.add('status-active');
      if (challengeData.status === 'passed') statusValue.classList.add('status-passed');
      if (challengeData.status === 'failed') statusValue.classList.add('status-locked');
    }

    if (timeRemaining) {
      const days = calculateDaysRemaining();
      timeRemaining.textContent = days !== null ? `${days} days` : '— days';
    }

    if (currentProfit) {
      const profit = calculateCurrentProfit();
      currentProfit.textContent = `${profit.toFixed(2)}%`;
      currentProfit.style.color = profit >= 0 ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)';
    }

    if (drawdown) {
      const dd = calculateDrawdown();
      drawdown.textContent = `${dd.toFixed(2)}%`;
      drawdown.style.color = dd >= 8 ? 'rgba(239, 68, 68, 0.9)' : 
                             dd >= 5 ? 'rgba(234, 179, 8, 0.9)' : 
                             'rgba(34, 197, 94, 0.9)';
    }

    // Update card statuses
    updateCardStatus('verifWeeklyStatus', 
      `${challengeData.weeklyCheckins.length}/${WEEKLY_CHECKINS_REQUIRED} weeks`);
    
    updateCardStatus('verifTradesStatus', 
      `${challengeData.trades.length}/${TRADES_REQUIRED} trades`);
    
    updateCardStatus('verifStatementStatus', 
      (challengeData.brokerStatements && challengeData.brokerStatements.length > 0) ? 'Submitted' : 'Awaiting');
    
    updateCardStatus('verifDrawdownStatus', 
      `${calculateDrawdown().toFixed(1)}% / ${MAX_DRAWDOWN_PERCENT}%`,
      calculateDrawdown() < MAX_DRAWDOWN_PERCENT ? 'verif-status-safe' : 'verif-status-failed');
    
    updateCardStatus('verifProfitStatus', 
      `${calculateCurrentProfit().toFixed(1)}% / ${PROFIT_TARGET_PERCENT}%`);
    
    const traderLevel = computeTraderLevel();
    updateCardStatus('verifCertStatus',
      challengeData.status === 'passed' ? 'PASSED' :
      challengeData.status === 'failed' ? 'FAILED' :
      traderLevel ? traderLevel : 'Awaiting');

    // Update card states
    updateCardState();
  }

  function updateCardStatus(elementId, text, className) {
    const el = document.getElementById(elementId);
    if (el) {
      el.textContent = text;
      if (className) {
        el.className = 'verif-hub-status ' + className;
      }
    }
  }

  function updateCardState() {
    const isFailed = challengeData.status === 'failed';

    document.querySelectorAll('.verif-hub-card').forEach(card => {
      card.classList.remove('card-locked', 'card-failed', 'card-completed');
      
      if (isFailed) {
        card.classList.add('card-failed');
      }
    });

    // Mark completed cards
    if (challengeData.weeklyCheckins.length >= WEEKLY_CHECKINS_REQUIRED) {
      document.getElementById('verifCardWeekly')?.classList.add('card-completed');
    }
    if (challengeData.trades.length >= TRADES_REQUIRED) {
      document.getElementById('verifCardTrades')?.classList.add('card-completed');
    }
    if (challengeData.brokerStatements && challengeData.brokerStatements.length > 0) {
      document.getElementById('verifCardStatement')?.classList.add('card-completed');
    }
    if (challengeData.status === 'passed') {
      document.getElementById('verifCardCertification')?.classList.add('card-completed');
    }
  }

  // ═══ EVENT LISTENERS ═════════════════════════════════════════════════════
  function setupEventListeners() {
    // Listen for custom events from subpages
    window.addEventListener('verif:checkin', (e) => {
      addWeeklyCheckin(e.detail);
    });

    window.addEventListener('verif:trade', (e) => {
      addTrade(e.detail);
    });

    window.addEventListener('verif:statement', (e) => {
      submitBrokerStatement(e.detail);
    });

    window.addEventListener('verif:balance', (e) => {
      updateBalance(e.detail.balance);
    });

    window.addEventListener('verif:start', (e) => {
      startChallenge(e.detail.initialBalance);
    });
  }

  // ═══ VERIFICATION STORE SYNC ═══════════════════════════════════════════════
  // Bridges the unified challengeData to the 5 separate localStorage keys
  // used by verification-status.html and other verification subpages
  function syncToVerificationStores() {
    try {
      // ── Trades ──────────────────────────────────────────────────────────
      // Do NOT overwrite altivor_verification_trades_v1 — user enters trades
      // directly via the 55 Trade Cycle form. This store is owned by
      // verification-trades.html, not by verification-app.js.

      // ── Drawdown ────────────────────────────────────────────────────────
      var startBal = challengeData.initialBalance || 10000;
      var ddData = {
        startingEquity: startBal,
        peakEquity: challengeData.highWaterMark || startBal,
        currentEquity: challengeData.currentBalance || startBal,
        failed: challengeData.status === 'failed' && challengeData.failReason === 'drawdown_exceeded',
        history: []
      };
      localStorage.setItem('altivor_verification_drawdown_v1', JSON.stringify(ddData));

      // ── Profit ──────────────────────────────────────────────────────────
      var curBal = challengeData.currentBalance || startBal;
      var profitData = {
        startingBalance: startBal,
        month1Balance: curBal,
        month2Balance: null
      };
      if (challengeData.startDate) {
        var daysSinceStart = Math.floor((Date.now() - new Date(challengeData.startDate).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceStart > 30) {
          profitData.month2Balance = curBal;
        }
      }
      localStorage.setItem('altivor_verification_profit_v1', JSON.stringify(profitData));

      // ── Weekly checkins ─────────────────────────────────────────────────
      var weeklyData = {
        checkins: (challengeData.weeklyCheckins || []).map(function(c) {
          return {
            id: c.id,
            date: c.date,
            weekNumber: c.weekNumber,
            equityValue: c.equityValue,
            notes: c.notes || '',
            screenshot: c.equityScreenshot || c.screenshot || null
          };
        })
      };
      localStorage.setItem('altivor_verification_weekly_v1', JSON.stringify(weeklyData));

      // ── Statement ───────────────────────────────────────────────────────
      var statementData = {
        submitted: !!(challengeData.brokerStatements && challengeData.brokerStatements.length > 0)
      };
      localStorage.setItem('altivor_verification_statement_v1', JSON.stringify(statementData));

    } catch (e) {
      console.warn('[Verification] Failed to sync to verification stores:', e);
    }
  }

  // ═══ SCORING ENGINE BRIDGE ════════════════════════════════════════════════
  function runScoringEngine() {
    if (!window.AltivorScoringEngine) return null;
    try {
      const result = window.AltivorScoringEngine.evaluateAll(challengeData.trades);
      window.AltivorScoringEngine.saveEvaluation(result);
      return result;
    } catch (e) {
      console.warn('[Verification] Scoring engine error:', e);
      return null;
    }
  }

  // ═══ PUBLIC API ══════════════════════════════════════════════════════════
  window.AltivorVerification = {
    init,
    getData: () => ({ ...challengeData }),
    isAuthenticated: () => isAuthenticated,
    startChallenge,
    updateBalance,
    addWeeklyCheckin,
    addTrade,
    submitBrokerStatement,
    submitForReview,
    calculateDaysRemaining,
    calculateCurrentProfit,
    calculateDrawdown,
    runScoringEngine,
    reloadData: loadData,
    CONSTANTS: {
      get CHALLENGE_DURATION_DAYS() { return CHALLENGE_DURATION_DAYS; },
      get WEEKLY_CHECKINS_REQUIRED() { return WEEKLY_CHECKINS_REQUIRED; },
      get TRADES_REQUIRED() { return TRADES_REQUIRED; },
      get PROFIT_TARGET_PERCENT() { return PROFIT_TARGET_PERCENT; },
      get MAX_DRAWDOWN_PERCENT() { return MAX_DRAWDOWN_PERCENT; }
    }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
