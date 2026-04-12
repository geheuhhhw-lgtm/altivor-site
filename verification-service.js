'use strict';

const { createVerificationReport } = require('./challenge-store');

/**
 * ALTIVOR Verification Service
 * Cross-validates self-reported trades against broker statement
 * Detects fraud patterns and anomalies
 */

// ═══ CROSS-VALIDATION ═════════════════════════════════════════════════════

function crossValidateTrades(selfReportedTrades, statementTrades, tolerances = {}) {
  const config = {
    priceTolerance: tolerances.priceTolerance || 0.5,      // Allow 0.5 price difference
    pnlTolerance: tolerances.pnlTolerance || 1.0,          // Allow $1 PnL difference
    timeTolerance: tolerances.timeTolerance || 3600000,    // Allow 1 hour time difference
    lotsTolerance: tolerances.lotsTolerance || 0.01        // Allow 0.01 lot difference
  };

  const result = {
    matched: [],
    mismatched: [],
    missing: [],      // In statement but not self-reported
    extra: [],        // Self-reported but not in statement
    summary: {
      totalSelfReported: selfReportedTrades.length,
      totalInStatement: statementTrades.length,
      matchedCount: 0,
      mismatchCount: 0,
      missingCount: 0,
      extraCount: 0,
      matchRate: 0
    }
  };

  // Create a copy of statement trades to track which ones are matched
  const unmatchedStatementTrades = [...statementTrades];
  const matchedSelfReportedIds = new Set();

  // Try to match each self-reported trade with a statement trade
  for (const selfTrade of selfReportedTrades) {
    const matchResult = findBestMatch(selfTrade, unmatchedStatementTrades, config);
    
    if (matchResult.match) {
      // Remove matched statement trade from unmatched list
      const idx = unmatchedStatementTrades.findIndex(t => t === matchResult.statementTrade);
      if (idx >= 0) {
        unmatchedStatementTrades.splice(idx, 1);
      }
      matchedSelfReportedIds.add(selfTrade.id);

      if (matchResult.isExactMatch) {
        result.matched.push({
          selfReported: selfTrade,
          statement: matchResult.statementTrade,
          differences: []
        });
        result.summary.matchedCount++;
      } else {
        result.mismatched.push({
          selfReported: selfTrade,
          statement: matchResult.statementTrade,
          differences: matchResult.differences
        });
        result.summary.mismatchCount++;
      }
    } else {
      // Self-reported trade not found in statement
      result.extra.push({
        selfReported: selfTrade,
        reason: 'not_found_in_statement'
      });
      result.summary.extraCount++;
    }
  }

  // Remaining statement trades are missing from self-reported
  for (const statementTrade of unmatchedStatementTrades) {
    result.missing.push({
      statement: statementTrade,
      reason: 'not_self_reported'
    });
    result.summary.missingCount++;
  }

  // Calculate match rate
  if (result.summary.totalSelfReported > 0) {
    result.summary.matchRate = (result.summary.matchedCount / result.summary.totalSelfReported) * 100;
  }

  return result;
}

function findBestMatch(selfTrade, statementTrades, config) {
  let bestMatch = null;
  let bestScore = -1;
  let bestDifferences = [];

  for (const statementTrade of statementTrades) {
    const comparison = compareTrades(selfTrade, statementTrade, config);
    
    if (comparison.score > bestScore) {
      bestScore = comparison.score;
      bestMatch = statementTrade;
      bestDifferences = comparison.differences;
    }
  }

  // Minimum score threshold for a match (at least symbol and direction must match)
  const MIN_MATCH_SCORE = 2;
  
  if (bestScore >= MIN_MATCH_SCORE) {
    return {
      match: true,
      statementTrade: bestMatch,
      isExactMatch: bestDifferences.length === 0,
      differences: bestDifferences,
      score: bestScore
    };
  }

  return { match: false };
}

function compareTrades(selfTrade, statementTrade, config) {
  let score = 0;
  const differences = [];

  // Symbol match (required)
  const selfSymbol = normalizeSymbol(selfTrade.symbol);
  const statementSymbol = normalizeSymbol(statementTrade.symbol);
  if (selfSymbol === statementSymbol) {
    score += 2;
  } else {
    return { score: 0, differences: ['symbol_mismatch'] };
  }

  // Direction match (required)
  const selfDirection = selfTrade.direction?.toLowerCase();
  const statementDirection = statementTrade.type?.toLowerCase();
  if (selfDirection === statementDirection) {
    score += 2;
  } else {
    return { score: 0, differences: ['direction_mismatch'] };
  }

  // Lot size
  const lotsDiff = Math.abs((selfTrade.lotSize || 0) - (statementTrade.lots || 0));
  if (lotsDiff <= config.lotsTolerance) {
    score += 1;
  } else {
    differences.push({
      field: 'lots',
      selfReported: selfTrade.lotSize,
      statement: statementTrade.lots,
      difference: lotsDiff
    });
  }

  // Entry price
  const entryDiff = Math.abs((selfTrade.entryPrice || 0) - (statementTrade.openPrice || 0));
  if (entryDiff <= config.priceTolerance) {
    score += 1;
  } else {
    differences.push({
      field: 'entryPrice',
      selfReported: selfTrade.entryPrice,
      statement: statementTrade.openPrice,
      difference: entryDiff
    });
  }

  // Exit price
  const exitDiff = Math.abs((selfTrade.exitPrice || 0) - (statementTrade.closePrice || 0));
  if (exitDiff <= config.priceTolerance) {
    score += 1;
  } else {
    differences.push({
      field: 'exitPrice',
      selfReported: selfTrade.exitPrice,
      statement: statementTrade.closePrice,
      difference: exitDiff
    });
  }

  // PnL
  const pnlDiff = Math.abs((selfTrade.pnl || 0) - (statementTrade.profit || 0));
  if (pnlDiff <= config.pnlTolerance) {
    score += 2;
  } else {
    differences.push({
      field: 'pnl',
      selfReported: selfTrade.pnl,
      statement: statementTrade.profit,
      difference: pnlDiff
    });
  }

  // Time matching (if available)
  if (selfTrade.entryTime && statementTrade.openTime) {
    const timeDiff = Math.abs(new Date(selfTrade.entryTime) - new Date(statementTrade.openTime));
    if (timeDiff <= config.timeTolerance) {
      score += 1;
    } else {
      differences.push({
        field: 'entryTime',
        selfReported: selfTrade.entryTime,
        statement: statementTrade.openTime,
        difference: timeDiff
      });
    }
  }

  return { score, differences };
}

function normalizeSymbol(symbol) {
  if (!symbol) return '';
  return symbol.toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^NAS100$/i, 'US100')
    .replace(/^USTEC$/i, 'US100')
    .replace(/^NDX$/i, 'US100')
    .replace(/^US30$/i, 'US30')
    .replace(/^DJ30$/i, 'US30')
    .replace(/^DOW$/i, 'US30');
}

// ═══ FRAUD DETECTION ══════════════════════════════════════════════════════

const FLAG_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

function detectFraudPatterns(challenge, validationResult, parsedStatement) {
  const flags = [];

  // 1. Win rate check
  const winRate = calculateWinRate(challenge.trades);
  if (winRate > 95) {
    flags.push({
      type: 'WIN_RATE_SUSPICIOUS',
      severity: FLAG_SEVERITY.CRITICAL,
      message: `Extremely high win rate: ${winRate.toFixed(1)}%`,
      value: winRate
    });
  } else if (winRate > 85) {
    flags.push({
      type: 'WIN_RATE_HIGH',
      severity: FLAG_SEVERITY.WARNING,
      message: `Unusually high win rate: ${winRate.toFixed(1)}%`,
      value: winRate
    });
  }

  // 2. Trade count mismatch
  if (validationResult) {
    const countDiff = Math.abs(validationResult.summary.totalSelfReported - validationResult.summary.totalInStatement);
    if (countDiff > 5) {
      flags.push({
        type: 'TRADE_COUNT_MISMATCH',
        severity: FLAG_SEVERITY.CRITICAL,
        message: `Large trade count difference: ${validationResult.summary.totalSelfReported} self-reported vs ${validationResult.summary.totalInStatement} in statement`,
        value: countDiff
      });
    } else if (countDiff > 0) {
      flags.push({
        type: 'TRADE_COUNT_DIFFERENCE',
        severity: FLAG_SEVERITY.WARNING,
        message: `Trade count difference: ${validationResult.summary.totalSelfReported} self-reported vs ${validationResult.summary.totalInStatement} in statement`,
        value: countDiff
      });
    }

    // 3. Missing trades
    if (validationResult.summary.missingCount > 0) {
      flags.push({
        type: 'MISSING_TRADES',
        severity: validationResult.summary.missingCount > 3 ? FLAG_SEVERITY.CRITICAL : FLAG_SEVERITY.WARNING,
        message: `${validationResult.summary.missingCount} trades in statement not self-reported`,
        value: validationResult.summary.missingCount
      });
    }

    // 4. Extra trades (self-reported but not in statement)
    if (validationResult.summary.extraCount > 0) {
      flags.push({
        type: 'EXTRA_TRADES',
        severity: FLAG_SEVERITY.CRITICAL,
        message: `${validationResult.summary.extraCount} self-reported trades not found in statement`,
        value: validationResult.summary.extraCount
      });
    }

    // 5. PnL mismatches
    const pnlMismatches = validationResult.mismatched.filter(m => 
      m.differences.some(d => d.field === 'pnl')
    );
    if (pnlMismatches.length > 0) {
      const totalPnlDiff = pnlMismatches.reduce((sum, m) => {
        const pnlDiff = m.differences.find(d => d.field === 'pnl');
        return sum + (pnlDiff ? pnlDiff.difference : 0);
      }, 0);
      
      flags.push({
        type: 'PNL_MISMATCH',
        severity: totalPnlDiff > 100 ? FLAG_SEVERITY.CRITICAL : FLAG_SEVERITY.WARNING,
        message: `${pnlMismatches.length} trades have PnL differences (total: $${totalPnlDiff.toFixed(2)})`,
        value: totalPnlDiff
      });
    }

    // 6. Low match rate
    if (validationResult.summary.matchRate < 80 && validationResult.summary.totalSelfReported > 5) {
      flags.push({
        type: 'LOW_MATCH_RATE',
        severity: FLAG_SEVERITY.CRITICAL,
        message: `Only ${validationResult.summary.matchRate.toFixed(1)}% of trades matched exactly`,
        value: validationResult.summary.matchRate
      });
    }
  }

  // 7. Identical PnL pattern
  const identicalPnlCount = detectIdenticalPnL(challenge.trades);
  if (identicalPnlCount > 5) {
    flags.push({
      type: 'IDENTICAL_PNL_PATTERN',
      severity: FLAG_SEVERITY.WARNING,
      message: `${identicalPnlCount} trades have identical PnL values`,
      value: identicalPnlCount
    });
  }

  // 8. Equity mismatch
  if (parsedStatement && parsedStatement.endingBalance) {
    const equityDiff = Math.abs(challenge.currentBalance - parsedStatement.endingBalance);
    if (equityDiff > 100) {
      flags.push({
        type: 'EQUITY_MISMATCH',
        severity: equityDiff > 500 ? FLAG_SEVERITY.CRITICAL : FLAG_SEVERITY.WARNING,
        message: `Equity mismatch: self-reported $${challenge.currentBalance.toFixed(2)} vs statement $${parsedStatement.endingBalance.toFixed(2)}`,
        value: equityDiff
      });
    }
  }

  // 9. Trades outside challenge period
  const outsidePeriodTrades = challenge.trades.filter(t => {
    if (!t.entryTime) return false;
    const tradeDate = new Date(t.entryTime);
    const startDate = new Date(challenge.startDate);
    const endDate = new Date(challenge.endDate);
    return tradeDate < startDate || tradeDate > endDate;
  });
  if (outsidePeriodTrades.length > 0) {
    flags.push({
      type: 'TRADES_OUTSIDE_PERIOD',
      severity: FLAG_SEVERITY.CRITICAL,
      message: `${outsidePeriodTrades.length} trades dated outside challenge period`,
      value: outsidePeriodTrades.length
    });
  }

  // 10. Drawdown hidden (equity dropped but no losing trades)
  const losingTrades = challenge.trades.filter(t => t.pnl < 0);
  if (challenge.maxDrawdown > 3 && losingTrades.length === 0) {
    flags.push({
      type: 'DRAWDOWN_HIDDEN',
      severity: FLAG_SEVERITY.CRITICAL,
      message: `Max drawdown is ${challenge.maxDrawdown.toFixed(1)}% but no losing trades reported`,
      value: challenge.maxDrawdown
    });
  }

  // 11. Statement parse errors
  if (parsedStatement && parsedStatement.parseErrors && parsedStatement.parseErrors.length > 0) {
    flags.push({
      type: 'STATEMENT_PARSE_ISSUES',
      severity: FLAG_SEVERITY.INFO,
      message: `Statement had ${parsedStatement.parseErrors.length} parse warnings`,
      value: parsedStatement.parseErrors.length
    });
  }

  return flags;
}

function calculateWinRate(trades) {
  if (!trades || trades.length === 0) return 0;
  const wins = trades.filter(t => t.pnl > 0).length;
  return (wins / trades.length) * 100;
}

function detectIdenticalPnL(trades) {
  if (!trades || trades.length < 3) return 0;
  
  const pnlCounts = {};
  for (const trade of trades) {
    const pnl = trade.pnl?.toFixed(2) || '0';
    pnlCounts[pnl] = (pnlCounts[pnl] || 0) + 1;
  }
  
  // Find max count of identical PnL values
  return Math.max(...Object.values(pnlCounts));
}

// ═══ FULL VERIFICATION ════════════════════════════════════════════════════

async function runFullVerification(challenge, parsedStatement) {
  // Cross-validate trades
  const validationResult = crossValidateTrades(
    challenge.trades,
    parsedStatement.trades || []
  );

  // Detect fraud patterns
  const flags = detectFraudPatterns(challenge, validationResult, parsedStatement);

  // Create verification report
  const report = await createVerificationReport(challenge.id, {
    statementId: parsedStatement.id || null,
    totalSelfReported: validationResult.summary.totalSelfReported,
    totalInStatement: validationResult.summary.totalInStatement,
    matchedCount: validationResult.summary.matchedCount,
    mismatchCount: validationResult.summary.mismatchCount,
    missingCount: validationResult.summary.missingCount,
    extraCount: validationResult.summary.extraCount,
    flags,
    matchDetails: {
      matched: validationResult.matched,
      mismatched: validationResult.mismatched,
      missing: validationResult.missing,
      extra: validationResult.extra
    }
  });

  return {
    report,
    validationResult,
    flags,
    summary: {
      isClean: flags.filter(f => f.severity === FLAG_SEVERITY.CRITICAL).length === 0,
      criticalFlags: flags.filter(f => f.severity === FLAG_SEVERITY.CRITICAL).length,
      warningFlags: flags.filter(f => f.severity === FLAG_SEVERITY.WARNING).length,
      infoFlags: flags.filter(f => f.severity === FLAG_SEVERITY.INFO).length,
      matchRate: validationResult.summary.matchRate
    }
  };
}

// ═══ EXPORTS ══════════════════════════════════════════════════════════════

module.exports = {
  crossValidateTrades,
  detectFraudPatterns,
  runFullVerification,
  calculateWinRate,
  normalizeSymbol,
  FLAG_SEVERITY
};
