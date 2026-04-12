'use strict';

const fs = require('fs');
const path = require('path');

/**
 * ALTIVOR Statement Parser
 * Parses MT4/MT5 HTML statements and extracts trade data
 */

// ═══ MT4/MT5 HTML PARSER ══════════════════════════════════════════════════

function parseMT4HTMLStatement(htmlContent) {
  const result = {
    accountNumber: null,
    accountName: null,
    broker: null,
    currency: null,
    statementPeriod: { from: null, to: null },
    startingBalance: null,
    endingBalance: null,
    totalProfit: null,
    trades: [],
    parseErrors: []
  };

  try {
    // Extract account info from header
    const accountMatch = htmlContent.match(/Account:\s*(\d+)/i);
    if (accountMatch) {
      result.accountNumber = accountMatch[1];
    }

    const nameMatch = htmlContent.match(/Name:\s*([^<\n]+)/i);
    if (nameMatch) {
      result.accountName = nameMatch[1].trim();
    }

    const currencyMatch = htmlContent.match(/Currency:\s*([A-Z]{3})/i);
    if (currencyMatch) {
      result.currency = currencyMatch[1];
    }

    // Extract balance info
    const balanceMatch = htmlContent.match(/Closed\s+Trade\s+P\/L[^<]*<[^>]*>([^<]+)/i);
    if (balanceMatch) {
      result.totalProfit = parseFloat(balanceMatch[1].replace(/[^\d.-]/g, ''));
    }

    const depositMatch = htmlContent.match(/Deposit[^<]*<[^>]*>([^<]+)/i);
    if (depositMatch) {
      result.startingBalance = parseFloat(depositMatch[1].replace(/[^\d.-]/g, ''));
    }

    const balanceEndMatch = htmlContent.match(/Balance[^<]*<[^>]*>([^<]+)/i);
    if (balanceEndMatch) {
      result.endingBalance = parseFloat(balanceEndMatch[1].replace(/[^\d.-]/g, ''));
    }

    // Parse trades table
    // MT4 format: Ticket | Open Time | Type | Size | Item | Price | S/L | T/P | Close Time | Price | Commission | Taxes | Swap | Profit
    const tradeRowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>(\d+)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>(buy|sell)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>/gi;

    let match;
    while ((match = tradeRowRegex.exec(htmlContent)) !== null) {
      try {
        const trade = {
          ticket: match[1],
          openTime: parseDateTime(match[2]),
          type: match[3].toLowerCase(),
          lots: parseFloat(match[4]) || 0,
          symbol: match[5].trim(),
          openPrice: parseFloat(match[6]) || 0,
          stopLoss: parseFloat(match[7]) || null,
          takeProfit: parseFloat(match[8]) || null,
          closeTime: parseDateTime(match[9]),
          closePrice: parseFloat(match[10]) || 0,
          commission: parseFloat(match[11]) || 0,
          taxes: parseFloat(match[12]) || 0,
          swap: parseFloat(match[13]) || 0,
          profit: parseFloat(match[14]) || 0
        };
        result.trades.push(trade);
      } catch (e) {
        result.parseErrors.push(`Failed to parse trade row: ${e.message}`);
      }
    }

    // Alternative simpler regex for different MT4/MT5 formats
    if (result.trades.length === 0) {
      const simpleTradeRegex = /<tr[^>]*class="[^"]*"[^>]*>[\s\S]*?<td[^>]*>(\d+)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>(buy|sell|balance|deposit)[^<]*<\/td>/gi;
      
      while ((match = simpleTradeRegex.exec(htmlContent)) !== null) {
        const type = match[3].toLowerCase();
        if (type === 'buy' || type === 'sell') {
          // Try to extract more data from this row
          const rowStart = match.index;
          const rowEnd = htmlContent.indexOf('</tr>', rowStart);
          const rowHtml = htmlContent.substring(rowStart, rowEnd);
          
          const cells = rowHtml.match(/<td[^>]*>([^<]*)<\/td>/gi) || [];
          const cellValues = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
          
          if (cellValues.length >= 10) {
            const trade = {
              ticket: cellValues[0] || match[1],
              openTime: parseDateTime(cellValues[1] || match[2]),
              type: type,
              lots: parseFloat(cellValues[3]) || 0,
              symbol: cellValues[4] || '',
              openPrice: parseFloat(cellValues[5]) || 0,
              stopLoss: parseFloat(cellValues[6]) || null,
              takeProfit: parseFloat(cellValues[7]) || null,
              closeTime: parseDateTime(cellValues[8]),
              closePrice: parseFloat(cellValues[9]) || 0,
              commission: parseFloat(cellValues[10]) || 0,
              taxes: 0,
              swap: parseFloat(cellValues[11]) || 0,
              profit: parseFloat(cellValues[cellValues.length - 1]) || 0
            };
            result.trades.push(trade);
          }
        }
      }
    }

  } catch (e) {
    result.parseErrors.push(`General parse error: ${e.message}`);
  }

  return result;
}

// ═══ CSV PARSER ═══════════════════════════════════════════════════════════

function parseCSVStatement(csvContent, delimiter = ',') {
  const result = {
    accountNumber: null,
    accountName: null,
    broker: null,
    currency: null,
    statementPeriod: { from: null, to: null },
    startingBalance: null,
    endingBalance: null,
    totalProfit: null,
    trades: [],
    parseErrors: []
  };

  try {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
      result.parseErrors.push('CSV file has no data rows');
      return result;
    }

    // Parse header
    const header = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
    
    // Find column indices
    const colMap = {
      ticket: findColumnIndex(header, ['ticket', 'order', 'deal', 'position']),
      openTime: findColumnIndex(header, ['open time', 'opentime', 'time', 'open']),
      closeTime: findColumnIndex(header, ['close time', 'closetime', 'close']),
      type: findColumnIndex(header, ['type', 'direction', 'side']),
      symbol: findColumnIndex(header, ['symbol', 'item', 'instrument']),
      lots: findColumnIndex(header, ['lots', 'volume', 'size', 'quantity']),
      openPrice: findColumnIndex(header, ['open price', 'openprice', 'entry', 'entry price']),
      closePrice: findColumnIndex(header, ['close price', 'closeprice', 'exit', 'exit price']),
      stopLoss: findColumnIndex(header, ['s/l', 'sl', 'stop loss', 'stoploss']),
      takeProfit: findColumnIndex(header, ['t/p', 'tp', 'take profit', 'takeprofit']),
      profit: findColumnIndex(header, ['profit', 'pnl', 'p/l', 'result', 'net profit']),
      commission: findColumnIndex(header, ['commission', 'comm']),
      swap: findColumnIndex(header, ['swap', 'rollover'])
    };

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i], delimiter);
      if (values.length < 5) continue;

      const type = colMap.type >= 0 ? values[colMap.type]?.toLowerCase() : '';
      if (type !== 'buy' && type !== 'sell') continue;

      try {
        const trade = {
          ticket: colMap.ticket >= 0 ? values[colMap.ticket] : `row_${i}`,
          openTime: colMap.openTime >= 0 ? parseDateTime(values[colMap.openTime]) : null,
          closeTime: colMap.closeTime >= 0 ? parseDateTime(values[colMap.closeTime]) : null,
          type: type,
          symbol: colMap.symbol >= 0 ? values[colMap.symbol]?.trim() : '',
          lots: colMap.lots >= 0 ? parseFloat(values[colMap.lots]) || 0 : 0,
          openPrice: colMap.openPrice >= 0 ? parseFloat(values[colMap.openPrice]) || 0 : 0,
          closePrice: colMap.closePrice >= 0 ? parseFloat(values[colMap.closePrice]) || 0 : 0,
          stopLoss: colMap.stopLoss >= 0 ? parseFloat(values[colMap.stopLoss]) || null : null,
          takeProfit: colMap.takeProfit >= 0 ? parseFloat(values[colMap.takeProfit]) || null : null,
          profit: colMap.profit >= 0 ? parseFloat(values[colMap.profit]) || 0 : 0,
          commission: colMap.commission >= 0 ? parseFloat(values[colMap.commission]) || 0 : 0,
          swap: colMap.swap >= 0 ? parseFloat(values[colMap.swap]) || 0 : 0
        };
        result.trades.push(trade);
      } catch (e) {
        result.parseErrors.push(`Failed to parse row ${i}: ${e.message}`);
      }
    }

    // Calculate totals
    if (result.trades.length > 0) {
      result.totalProfit = result.trades.reduce((sum, t) => sum + (t.profit || 0), 0);
    }

  } catch (e) {
    result.parseErrors.push(`CSV parse error: ${e.message}`);
  }

  return result;
}

function findColumnIndex(header, possibleNames) {
  for (const name of possibleNames) {
    const idx = header.findIndex(h => h.includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseCSVLine(line, delimiter) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  
  return values;
}

// ═══ HELPERS ══════════════════════════════════════════════════════════════

function parseDateTime(str) {
  if (!str) return null;
  str = str.trim();
  
  // Try various formats
  // MT4: 2024.01.15 14:30:00
  // MT5: 2024-01-15 14:30:00
  // ISO: 2024-01-15T14:30:00
  
  const formats = [
    /(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):?(\d{2})?/,  // MT4
    /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):?(\d{2})?/,    // MT5
    /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):?(\d{2})?/,      // ISO
    /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?/,  // DD.MM.YYYY
    /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?/   // MM/DD/YYYY
  ];
  
  for (const regex of formats) {
    const match = str.match(regex);
    if (match) {
      try {
        let year, month, day;
        if (match[1].length === 4) {
          year = parseInt(match[1]);
          month = parseInt(match[2]) - 1;
          day = parseInt(match[3]);
        } else {
          // DD.MM.YYYY or MM/DD/YYYY
          day = parseInt(match[1]);
          month = parseInt(match[2]) - 1;
          year = parseInt(match[3]);
        }
        const hour = parseInt(match[4]) || 0;
        const min = parseInt(match[5]) || 0;
        const sec = parseInt(match[6]) || 0;
        
        const date = new Date(year, month, day, hour, min, sec);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      } catch (e) {
        // Continue to next format
      }
    }
  }
  
  // Try native Date parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  
  return null;
}

function detectFileType(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.csv') return 'csv';
  if (ext === '.html' || ext === '.htm') return 'html';
  
  // Try to detect from content
  if (content.trim().startsWith('<') || content.includes('<html') || content.includes('<table')) {
    return 'html';
  }
  
  if (content.includes(',') && content.split('\n')[0].split(',').length > 3) {
    return 'csv';
  }
  
  if (content.includes('\t') && content.split('\n')[0].split('\t').length > 3) {
    return 'tsv';
  }
  
  return 'unknown';
}

// ═══ MAIN PARSE FUNCTION ══════════════════════════════════════════════════

function parseStatement(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileType = detectFileType(filePath, content);
  
  let result;
  
  switch (fileType) {
    case 'html':
      result = parseHTML(content);
      break;
    case 'csv':
      result = parseCSVStatement(content, ',');
      break;
    case 'tsv':
      result = parseCSVStatement(content, '\t');
      break;
    default:
      result = {
        accountNumber: null,
        trades: [],
        parseErrors: [`Unknown file type: ${fileType}`]
      };
  }
  
  result.fileType = fileType;
  result.filePath = filePath;
  
  return result;
}

function parseHTML(content) {
  // Try MT4/MT5 format first
  let result = parseMT4HTMLStatement(content);
  
  // If no trades found, try alternative parsing
  if (result.trades.length === 0) {
    result = parseGenericHTMLTable(content);
  }
  
  return result;
}

function parseGenericHTMLTable(htmlContent) {
  const result = {
    accountNumber: null,
    accountName: null,
    broker: null,
    currency: null,
    statementPeriod: { from: null, to: null },
    startingBalance: null,
    endingBalance: null,
    totalProfit: null,
    trades: [],
    parseErrors: []
  };

  try {
    // Find all tables
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    
    while ((tableMatch = tableRegex.exec(htmlContent)) !== null) {
      const tableContent = tableMatch[1];
      
      // Extract rows
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const rows = [];
      let rowMatch;
      
      while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
        const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        const cells = [];
        let cellMatch;
        
        while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
          cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
        }
        
        if (cells.length > 0) {
          rows.push(cells);
        }
      }
      
      // Try to identify trade rows
      if (rows.length > 1) {
        const header = rows[0].map(h => h.toLowerCase());
        
        // Check if this looks like a trades table
        const hasTicket = header.some(h => h.includes('ticket') || h.includes('order') || h.includes('deal'));
        const hasType = header.some(h => h.includes('type') || h.includes('direction'));
        const hasProfit = header.some(h => h.includes('profit') || h.includes('pnl'));
        
        if (hasTicket || (hasType && hasProfit)) {
          // Parse as trades table
          const colMap = {
            ticket: header.findIndex(h => h.includes('ticket') || h.includes('order') || h.includes('deal')),
            type: header.findIndex(h => h.includes('type') || h.includes('direction')),
            symbol: header.findIndex(h => h.includes('symbol') || h.includes('item')),
            lots: header.findIndex(h => h.includes('lot') || h.includes('volume') || h.includes('size')),
            openPrice: header.findIndex(h => h.includes('open') && h.includes('price')),
            closePrice: header.findIndex(h => h.includes('close') && h.includes('price')),
            profit: header.findIndex(h => h.includes('profit') || h.includes('pnl'))
          };
          
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const type = colMap.type >= 0 ? row[colMap.type]?.toLowerCase() : '';
            
            if (type === 'buy' || type === 'sell') {
              const trade = {
                ticket: colMap.ticket >= 0 ? row[colMap.ticket] : `row_${i}`,
                type: type,
                symbol: colMap.symbol >= 0 ? row[colMap.symbol] : '',
                lots: colMap.lots >= 0 ? parseFloat(row[colMap.lots]) || 0 : 0,
                openPrice: colMap.openPrice >= 0 ? parseFloat(row[colMap.openPrice]) || 0 : 0,
                closePrice: colMap.closePrice >= 0 ? parseFloat(row[colMap.closePrice]) || 0 : 0,
                profit: colMap.profit >= 0 ? parseFloat(row[colMap.profit]) || 0 : 0,
                openTime: null,
                closeTime: null,
                stopLoss: null,
                takeProfit: null,
                commission: 0,
                swap: 0
              };
              result.trades.push(trade);
            }
          }
        }
      }
    }
    
    if (result.trades.length > 0) {
      result.totalProfit = result.trades.reduce((sum, t) => sum + (t.profit || 0), 0);
    }
    
  } catch (e) {
    result.parseErrors.push(`Generic HTML parse error: ${e.message}`);
  }

  return result;
}

// ═══ EXPORTS ══════════════════════════════════════════════════════════════

module.exports = {
  parseStatement,
  parseHTML: parseHTML,
  parseCSVStatement,
  parseDateTime,
  detectFileType
};
