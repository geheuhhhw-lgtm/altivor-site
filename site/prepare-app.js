(function () {
    'use strict';

    var PREPARE_STATE_KEY = 'altivor-prepare-state-v1';
    var PREPARE_STATUS_KEY = 'altivor-prepare-status';
    var COMPLIANT_TOTAL = 10;
    var COMPLIANT_TARGET = 10;
    var COMPLIANCE_THRESHOLD = 0.8;
    var NONCOMPLIANT_LIMIT = 20;
    var COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
    var MAX_TRADES_PER_DAY = 3;
    var HOLDING_MINUTES_SOFT = 1;
    var PERMITTED_WINDOWS = [
        { start: 15 * 60 + 30, end: 21 * 60 }
    ];
    var APPROVED_SYMBOL_BASES = ['NASDAQ100', 'NAS100', 'NDX100', 'USTEC', 'US100', 'NQ100', 'NDX', 'NAS'];
    var APPROVED_SYMBOL_PREFIXES = ['FX', 'M', 'X'];
    var APPROVED_SYMBOL_SUFFIXES = [
        'MICRO', 'MINI', 'CASH', 'CFD', 'SPOT', 'USD', 'IDX', 'ECN', 'RAW', 'STD', 'VIP', 'LMAX', 'PRIME', 'LIVE', 'DEMO', 'TRIAL',
        'SEP', 'DEC', 'MAR', 'JUN', 'PRO', 'S1', 'S2', 'R1', 'R2', 'A1', 'UK', 'EU', 'US', 'MIN', 'LOT', 'C', 'I', 'M', 'R', 'A', 'B', 'S', 'E', 'X', 'P', 'Z', 'K'
    ].sort(function (a, b) {
        return b.length - a.length;
    });
    var APPROVED_SYMBOL_ALIASES = new Set([
        'US100', 'US100CASH', 'US100CFD', 'US100M', 'US100MICRO', 'US100MINI', 'US100S', 'US100SPOT', 'US100USD', 'US100IDX',
        'NAS100', 'NAS100CASH', 'NAS100CFD', 'NAS100M', 'NAS100MICRO', 'NAS100MINI', 'NAS100S', 'NAS100SPOT', 'NAS100USD', 'NAS100IDX',
        'USTEC', 'USTECCASH', 'USTECCFD', 'USTECM', 'USTECMICRO', 'USTECMINI', 'USTECS', 'USTECSPOT', 'USTECUSD', 'USTECIDX',
        'NASDAQ100', 'NASDAQ100CASH', 'NASDAQ100CFD', 'NASDAQ100M', 'NASDAQ100S', 'NASDAQ100SPOT', 'NASDAQ100USD',
        'NDX100', 'NDX100CASH', 'NDX100CFD', 'NDX100M', 'NDX100S', 'NDX100SPOT',
        'NQ100', 'NQ100CASH', 'NQ100CFD', 'NQ100M', 'NQ100S', 'NQ100SPOT',
        'NAS', 'NASCASH', 'NASCFD', 'NDX', 'NDXCASH', 'NDXCFD'
    ]);

    var editTradeId = null;
    var pendingDeleteTradeId = null;
    var cooldownInterval = null;

    function prepT(key, fallback) {
        return typeof window.altivorGetTranslation === 'function'
            ? window.altivorGetTranslation(key, fallback)
            : fallback;
    }

    function escapeHtml(value) {
        if (window.altivorTraderOS && typeof window.altivorTraderOS.escapeHtml === 'function') {
            return window.altivorTraderOS.escapeHtml(value);
        }
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function replaceTokens(template, values) {
        return String(template || '').replace(/\{(\w+)\}/g, function (_, key) {
            return values && values[key] != null ? values[key] : '';
        });
    }

    function num(value) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function toIsoLocal(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
        var year = date.getFullYear();
        var month = String(date.getMonth() + 1).padStart(2, '0');
        var day = String(date.getDate()).padStart(2, '0');
        var hour = String(date.getHours()).padStart(2, '0');
        var minute = String(date.getMinutes()).padStart(2, '0');
        return year + '-' + month + '-' + day + 'T' + hour + ':' + minute;
    }

    function parseTradeDateTime(rawValue) {
        var raw = String(rawValue || '').trim();
        if (!raw) return null;

        var isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))$/);
        var dotMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2}))?$/);
        var year;
        var month;
        var day;
        var hour;
        var minute;

        if (isoMatch) {
            year = Number(isoMatch[1]);
            month = Number(isoMatch[2]);
            day = Number(isoMatch[3]);
            hour = Number(isoMatch[4]);
            minute = Number(isoMatch[5]);
        } else if (dotMatch) {
            day = Number(dotMatch[1]);
            month = Number(dotMatch[2]);
            year = Number(dotMatch[3]);
            hour = Number(dotMatch[4] || 0);
            minute = Number(dotMatch[5] || 0);
        } else {
            return null;
        }

        var date = new Date(year, month - 1, day, hour, minute);
        if (Number.isNaN(date.getTime())) return null;

        return {
            date: date,
            isoValue: toIsoLocal(date),
            displayValue: toIsoLocal(date).replace('T', ' ')
        };
    }

    function formatDateTime(value) {
        var info = parseTradeDateTime(value);
        return info ? info.displayValue : '—';
    }

    function formatNumber(value, digits) {
        return value == null || value === '' || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(digits == null ? 2 : digits);
    }

    function formatPnl(value) {
        var parsed = num(value);
        if (parsed == null) return '—';
        return (parsed >= 0 ? '+' : '') + parsed.toFixed(2);
    }

    function formatCountdown(ms) {
        var total = Math.max(0, Math.floor(ms / 1000));
        var days = Math.floor(total / 86400);
        var hours = Math.floor((total % 86400) / 3600);
        var minutes = Math.floor((total % 3600) / 60);
        var seconds = total % 60;
        return replaceTokens(prepT('prep_cooldown_timer', '{d}d {h}h {m}m {s}s'), {
            d: days,
            h: hours,
            m: minutes,
            s: seconds
        });
    }

    function getReasonLabel(code) {
        var labels = {
            INSTRUMENT_NOT_US100_CFD: prepT('prep_reason_instrument_not_us100_cfd', 'Instrument not US100 CFD'),
            OUTSIDE_PERMITTED_WINDOW: prepT('prep_reason_outside_permitted_window', 'Outside permitted window'),
            STOP_LOSS_MISSING: prepT('prep_reason_stop_loss_missing', 'Stop loss missing'),
            RISK_NOT_FIXED: prepT('prep_reason_risk_not_fixed', 'Risk not fixed'),
            DAILY_LIMIT_EXCEEDED: prepT('prep_reason_daily_limit_exceeded', 'Daily limit exceeded'),
            DUPLICATE_SUBMISSION: prepT('prep_reason_duplicate_submission', 'Duplicate submission'),
            HOLDING_TIME_TOO_SHORT: prepT('prep_reason_holding_time_too_short', 'Holding time too short')
        };
        return labels[code] || code;
    }

    function getDefaultState() {
        return {
            version: 1,
            status: 'NOT_STARTED',
            activatedAt: null,
            cooldownUntil: null,
            trades: []
        };
    }

    function getState() {
        var state = getDefaultState();
        try {
            var raw = localStorage.getItem(PREPARE_STATE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') state = Object.assign(state, parsed);
            }
        } catch (err) {
        }

        if (!Array.isArray(state.trades)) state.trades = [];
        if (!state.status) state.status = localStorage.getItem(PREPARE_STATUS_KEY) || 'NOT_STARTED';

        if (state.status === 'DISQUALIFIED' && state.cooldownUntil) {
            var cooldownTime = new Date(state.cooldownUntil).getTime();
            if (Number.isFinite(cooldownTime) && Date.now() >= cooldownTime) {
                state = getDefaultState();
            }
        }

        return state;
    }

    function saveState(state) {
        localStorage.setItem(PREPARE_STATE_KEY, JSON.stringify(state));
        localStorage.setItem(PREPARE_STATUS_KEY, state.status);
    }

    function getCounts(state) {
        return state.trades.reduce(function (acc, trade) {
            if (trade.compliant) acc.compliant += 1;
            else acc.noncompliant += 1;
            acc.total += 1;
            return acc;
        }, { compliant: 0, noncompliant: 0, total: 0 });
    }

    function validateTradeDateTimeInput(input) {
        if (!input) return false;
        input.setCustomValidity('');
        if (!String(input.value || '').trim()) return false;
        if (parseTradeDateTime(input.value)) return true;
        input.setCustomValidity(prepT('prep_datetime_invalid', 'Use YYYY-MM-DD HH:MM or DD.MM.YYYY HH:MM'));
        return false;
    }

    function normalizeTradeDateTimeInput(input) {
        if (!input) return '';
        input.setCustomValidity('');
        if (!String(input.value || '').trim()) return '';
        var info = parseTradeDateTime(input.value);
        if (!info) {
            input.setCustomValidity(prepT('prep_datetime_invalid', 'Use YYYY-MM-DD HH:MM or DD.MM.YYYY HH:MM'));
            return null;
        }
        input.value = info.isoValue;
        return info.isoValue;
    }

    function bindTradeDateTimeInput(id, rerenderPreview) {
        var input = document.getElementById(id);
        if (!input) return;
        input.addEventListener('change', function () {
            validateTradeDateTimeInput(this);
            if (rerenderPreview) rerenderPreview();
        });
        input.addEventListener('blur', function () {
            normalizeTradeDateTimeInput(this);
        });
        if (input.value) normalizeTradeDateTimeInput(input);
    }

    function populateTimeSelects(hourId, minId) {
        var hourEl = document.getElementById(hourId);
        var minEl = document.getElementById(minId);
        if (hourEl && hourEl.options.length === 0) {
            hourEl.innerHTML = '<option value="" disabled selected>HH</option>';
            for (var h = 0; h < 24; h++) {
                var hv = String(h).padStart(2, '0');
                hourEl.innerHTML += '<option value="' + hv + '">' + hv + '</option>';
            }
        }
        if (minEl && minEl.options.length === 0) {
            minEl.innerHTML = '<option value="" disabled selected>MM</option>';
            for (var m = 0; m < 60; m++) {
                var mv = String(m).padStart(2, '0');
                minEl.innerHTML += '<option value="' + mv + '">' + mv + '</option>';
            }
        }
    }

    function combineDateTimePair(dateId, hourId, minId) {
        var dateEl = document.getElementById(dateId);
        var hourEl = document.getElementById(hourId);
        var minEl = document.getElementById(minId);
        if (!dateEl || !hourEl || !minEl) return '';
        var d = dateEl.value;
        var h = hourEl.value;
        var m = minEl.value;
        if (!d || !h || !m) return '';
        return d + 'T' + h + ':' + m;
    }

    function splitDateTimeToPair(isoValue, dateId, hourId, minId) {
        var dateEl = document.getElementById(dateId);
        var hourEl = document.getElementById(hourId);
        var minEl = document.getElementById(minId);
        if (!dateEl || !hourEl || !minEl) return;
        var info = parseTradeDateTime(isoValue);
        if (!info) { dateEl.value = ''; hourEl.value = ''; minEl.value = ''; return; }
        var parts = info.isoValue.split('T');
        dateEl.value = parts[0] || '';
        var timeParts = (parts[1] || '').split(':');
        hourEl.value = timeParts[0] || '';
        minEl.value = timeParts[1] || '';
    }

    function pairHasValue(dateId, hourId, minId) {
        var dateEl = document.getElementById(dateId);
        var hourEl = document.getElementById(hourId);
        var minEl = document.getElementById(minId);
        return (dateEl && dateEl.value) || (hourEl && hourEl.value) || (minEl && minEl.value);
    }

    function normalizePrepareSymbol(value) {
        return String(value || '').toUpperCase().trim();
    }

    function stripPrefixTokens(token) {
        var current = token;
        var changed = true;
        while (changed && current) {
            changed = false;
            for (var i = 0; i < APPROVED_SYMBOL_PREFIXES.length; i += 1) {
                var prefix = APPROVED_SYMBOL_PREFIXES[i];
                if (current.indexOf(prefix) === 0) {
                    current = current.slice(prefix.length);
                    changed = true;
                    break;
                }
            }
        }
        return current;
    }

    function canConsumeSuffixChain(value) {
        if (!value) return true;
        for (var i = 0; i < APPROVED_SYMBOL_SUFFIXES.length; i += 1) {
            var token = APPROVED_SYMBOL_SUFFIXES[i];
            if (value.indexOf(token) === 0 && canConsumeSuffixChain(value.slice(token.length))) {
                return true;
            }
        }
        return false;
    }

    function matchesSymbolStem(token) {
        for (var i = 0; i < APPROVED_SYMBOL_BASES.length; i += 1) {
            var base = APPROVED_SYMBOL_BASES[i];
            if (token === base) return true;
            if (token.indexOf(base) === 0 && canConsumeSuffixChain(token.slice(base.length))) return true;
        }
        return false;
    }

    function isApprovedPrepareSymbol(value) {
        var normalized = normalizePrepareSymbol(value);
        if (!normalized) return false;

        var collapsed = normalized.replace(/[^A-Z0-9]/g, '');
        if (!collapsed) return false;
        if (APPROVED_SYMBOL_ALIASES.has(collapsed)) return true;
        if (matchesSymbolStem(collapsed)) return true;
        return matchesSymbolStem(stripPrefixTokens(collapsed));
    }

    function minutesOfDay(date) {
        return date.getHours() * 60 + date.getMinutes();
    }

    function isInsidePermittedWindow(date) {
        var current = minutesOfDay(date);
        return PERMITTED_WINDOWS.some(function (windowRange) {
            return current >= windowRange.start && current <= windowRange.end;
        });
    }

    function getTradeSortValue(trade) {
        var info = parseTradeDateTime(trade && (trade.openTime || trade.closeTime || trade.createdAt));
        return info ? info.date.getTime() : 0;
    }

    function getRiskValue(trade) {
        var entry = num(trade.entryPrice);
        var stop = num(trade.stopLoss);
        var volume = num(trade.volume);
        if (entry == null || stop == null || volume == null) return null;
        return Math.abs(entry - stop) * volume;
    }

    function buildTradeSnapshot(data, id, createdAt, screenshotName) {
        return {
            id: id || 'prep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            symbol: String(data.symbol || '').trim(),
            ticketId: String(data.ticketId || '').trim(),
            openTime: data.openTime || '',
            closeTime: data.closeTime || '',
            entryPrice: num(data.entryPrice),
            stopLoss: num(data.stopLoss),
            takeProfit: num(data.takeProfit),
            volume: num(data.volume),
            pnl: num(data.pnl),
            note: String(data.note || '').trim(),
            screenshotName: screenshotName || '',
            createdAt: createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    function reEvaluateAllTrades(state) {
        var ordered = state.trades.slice().sort(function (a, b) {
            return getTradeSortValue(a) - getTradeSortValue(b);
        });
        var seenTickets = {};
        var dayCounts = {};
        var dayHasLoss = {};
        var referenceRisk = null;

        ordered.forEach(function (trade) {
            var reasons = [];
            var openInfo = parseTradeDateTime(trade.openTime);
            var closeInfo = parseTradeDateTime(trade.closeTime);
            var dateKey = openInfo ? openInfo.isoValue.slice(0, 10) : String(trade.createdAt || '').slice(0, 10);
            var ticketKey = String(trade.ticketId || '').trim().toUpperCase();
            var riskValue = getRiskValue(trade);
            var sameDayCount = (dayCounts[dateKey] || 0) + 1;
            var previousLossSameSession = Boolean(dayHasLoss[dateKey]);
            var riskWithinPlan = true;

            if (!isApprovedPrepareSymbol(trade.symbol)) reasons.push('INSTRUMENT_NOT_US100_CFD');
            if (!openInfo || !isInsidePermittedWindow(openInfo.date)) reasons.push('OUTSIDE_PERMITTED_WINDOW');
            if (num(trade.stopLoss) == null || num(trade.entryPrice) == null || Number(trade.stopLoss) === Number(trade.entryPrice)) reasons.push('STOP_LOSS_MISSING');

            if (riskValue == null || riskValue <= 0) {
                riskWithinPlan = false;
                reasons.push('RISK_NOT_FIXED');
            } else if (referenceRisk == null) {
                referenceRisk = riskValue;
            } else {
                var tolerance = Math.max(referenceRisk * 0.05, 0.0001);
                riskWithinPlan = Math.abs(riskValue - referenceRisk) <= tolerance;
                if (!riskWithinPlan) reasons.push('RISK_NOT_FIXED');
            }

            if (sameDayCount > MAX_TRADES_PER_DAY) reasons.push('DAILY_LIMIT_EXCEEDED');
            if (ticketKey && seenTickets[ticketKey]) reasons.push('DUPLICATE_SUBMISSION');

            if (openInfo && closeInfo) {
                var holdingMinutes = (closeInfo.date.getTime() - openInfo.date.getTime()) / 60000;
                if (holdingMinutes >= 0 && holdingMinutes < HOLDING_MINUTES_SOFT) {
                    reasons.push('HOLDING_TIME_TOO_SHORT');
                }
            }

            trade.date = dateKey;
            trade.sameDayCount = sameDayCount;
            trade.previousLossSameSession = previousLossSameSession;
            trade.riskValue = riskValue;
            trade.riskWithinPlan = riskWithinPlan;
            trade.complianceReasons = reasons;
            var totalRules = 7;
            var passedRules = totalRules - reasons.length;
            var complianceScore = passedRules / totalRules;
            trade.complianceScore = complianceScore;
            trade.compliant = complianceScore >= COMPLIANCE_THRESHOLD;
            trade.hasScreenshot = Boolean(trade.screenshotName);
            trade.osAnalysis = window.altivorTraderOS && typeof window.altivorTraderOS.analyzePrepareTrade === 'function'
                ? window.altivorTraderOS.analyzePrepareTrade({
                    symbol: trade.symbol,
                    ticketId: trade.ticketId,
                    compliant: trade.compliant,
                    complianceReasons: reasons,
                    riskValue: trade.riskValue,
                    riskWithinPlan: trade.riskWithinPlan,
                    sameDayCount: trade.sameDayCount,
                    previousLossSameSession: trade.previousLossSameSession,
                    openTime: trade.openTime,
                    closeTime: trade.closeTime,
                    date: trade.date,
                    hasScreenshot: trade.hasScreenshot
                }, { mode: 'prepare' })
                : null;

            if (ticketKey) seenTickets[ticketKey] = true;
            dayCounts[dateKey] = sameDayCount;
            if (num(trade.pnl) != null && Number(trade.pnl) < 0) dayHasLoss[dateKey] = true;
        });

        state.trades = ordered;

        var counts = getCounts(state);
        if (counts.compliant >= COMPLIANT_TARGET) {
            state.status = 'QUALIFIED';
            state.cooldownUntil = null;
        } else if (counts.noncompliant >= NONCOMPLIANT_LIMIT) {
            state.status = 'DISQUALIFIED';
            if (!state.cooldownUntil) state.cooldownUntil = new Date(Date.now() + COOLDOWN_MS).toISOString();
        } else {
            state.cooldownUntil = null;
            state.status = state.activatedAt || state.trades.length ? 'ACTIVE' : 'NOT_STARTED';
        }
    }

    function getStatusLabel(status) {
        if (status === 'ACTIVE') return prepT('prep_status_active', 'PREPARE STATUS: ACTIVE');
        if (status === 'QUALIFIED') return prepT('prep_status_qualified', 'PREPARE STATUS: QUALIFIED');
        if (status === 'DISQUALIFIED') return prepT('prep_status_disqualified', 'PREPARE STATUS: DISQUALIFIED — COOLDOWN INITIATED');
        return prepT('prep_status_not_started', 'PREPARE STATUS: NOT STARTED');
    }

    function getStatusClass(status) {
        if (status === 'ACTIVE') return 'status-active';
        if (status === 'QUALIFIED') return 'status-qualified';
        if (status === 'DISQUALIFIED') return 'status-disqualified';
        return 'status-not-started';
    }

    function metricClass(value) {
        if (value >= 80) return 'tos-metric-value tos-metric-value--positive';
        if (value >= 50) return 'tos-metric-value tos-metric-value--warning';
        return 'tos-metric-value tos-metric-value--negative';
    }

    function setElementVisible(id, visible) {
        var el = document.getElementById(id);
        if (el) el.hidden = !visible;
    }

    function buildBehaviorSummaryHtml(state) {
        if (!(window.altivorTraderOS && typeof window.altivorTraderOS.summarizeBehavior === 'function')) return '';
        var summary = window.altivorTraderOS.summarizeBehavior(state.trades, { mode: 'prepare' });
        var worstHourVal = summary.worstHour && typeof summary.worstHour === 'object' ? summary.worstHour.hour : summary.worstHour;
        var worstHour = worstHourVal == null ? '—' : 'After ' + String(worstHourVal).padStart(2, '0') + ':00';
        var worstHourClass = worstHourVal == null ? 'tos-metric-value tos-metric-value--positive' : 'tos-metric-value tos-metric-value--negative';

        return '' +
            '<div class="tos-grid tos-grid--6">' +
                '<div class="tos-card tos-card--compact"><span class="tos-metric-label">Rule Compliance</span><span class="' + metricClass(summary.ruleCompliancePct) + '">' + escapeHtml(String(summary.ruleCompliancePct)) + '%</span></div>' +
                '<div class="tos-card tos-card--compact"><span class="tos-metric-label">Avg TradeScore</span><span class="' + metricClass(summary.avgTradeScore) + '">' + escapeHtml(String(summary.avgTradeScore)) + '</span></div>' +
                '<div class="tos-card tos-card--compact"><span class="tos-metric-label">Avg SessionScore</span><span class="' + metricClass(summary.avgSessionScore) + '">' + escapeHtml(String(summary.avgSessionScore)) + '</span></div>' +
                '<div class="tos-card tos-card--compact"><span class="tos-metric-label">Risk Breaks</span><span class="' + (summary.riskBreaks > 0 ? 'tos-metric-value tos-metric-value--negative' : 'tos-metric-value tos-metric-value--positive') + '">' + escapeHtml(String(summary.riskBreaks)) + '</span></div>' +
                '<div class="tos-card tos-card--compact"><span class="tos-metric-label">Overtrading</span><span class="' + (summary.overtradingCount > 0 ? 'tos-metric-value tos-metric-value--warning' : 'tos-metric-value tos-metric-value--positive') + '">' + escapeHtml(String(summary.overtradingCount)) + '</span></div>' +
                '<div class="tos-card tos-card--compact"><span class="tos-metric-label">Control Loss</span><span class="' + worstHourClass + '">' + escapeHtml(worstHour) + '</span></div>' +
            '</div>' +
            '<div class="prep-card">' +
                '<div class="prep-card-head">' +
                    '<h3>Trader OS Summary</h3>' +
                    '<p>' + escapeHtml(summary.topPattern || 'No behavioral data yet.') + '</p>' +
                '</div>' +
                '<div class="prep-card-body">' +
                    '<div class="tos-feedback">' + escapeHtml(summary.alerts && summary.alerts.length ? summary.alerts[0] : 'No behavioral data yet.') + '</div>' +
                '</div>' +
            '</div>';
    }

    function buildDashboardHtml(counts) {
        return '' +
            '<div class="prep-dashboard">' +
                '<div class="prep-counter-card">' +
                    '<div class="prep-counter-label">' + prepT('prep_dash_compliant', 'Compliant Trades') + '</div>' +
                    '<div class="prep-counter-value' + (counts.total > 0 ? ' prep-counter--green' : '') + '">' + counts.compliant + ' / ' + COMPLIANT_TOTAL + '</div>' +
                    '<div class="prep-counter-sub">Qualified once the compliant side reaches the mandatory threshold.</div>' +
                '</div>' +
                '<div class="prep-counter-card">' +
                    '<div class="prep-counter-label">' + prepT('prep_dash_noncompliant', 'Non-Compliant Trades') + '</div>' +
                    '<div class="prep-counter-value' + (counts.total > 0 ? ' prep-counter--red' : '') + '">' + counts.noncompliant + ' / ' + NONCOMPLIANT_LIMIT + '</div>' +
                    '<div class="prep-counter-sub">A seven-day reset is triggered when the non-compliant ceiling is reached.</div>' +
                '</div>' +
            '</div>';
    }

    function zoneBadgeHtml(analysis) {
        if (!analysis || !analysis.zone) return '';
        return '<span class="tos-zone tos-zone--' + escapeHtml(analysis.zone.key) + '">' + escapeHtml(analysis.zone.label) + '</span>';
    }

    function buildReasonPills(reasons) {
        if (!reasons || !reasons.length) return '';
        return '<div class="prep-reason-list">' + reasons.map(function (reason) {
            return '<span class="prep-reason-pill">' + escapeHtml(getReasonLabel(reason)) + '</span>';
        }).join('') + '</div>';
    }

    function buildAnalysisHtml(analysis) {
        if (!analysis) return '';
        var positivePills = window.altivorTraderOS && typeof window.altivorTraderOS.renderTagPills === 'function'
            ? window.altivorTraderOS.renderTagPills(analysis.positiveTags, 'positive')
            : '';
        var negativePills = window.altivorTraderOS && typeof window.altivorTraderOS.renderTagPills === 'function'
            ? window.altivorTraderOS.renderTagPills(analysis.negativeTags, 'negative')
            : '';
        var strengths = Array.isArray(analysis.strengths) && analysis.strengths.length
            ? '<div class="prep-history-block"><div class="prep-preview-copy"><strong>Strengths:</strong> ' + escapeHtml(analysis.strengths.join(' • ')) + '</div></div>'
            : '';
        var corrections = Array.isArray(analysis.corrections) && analysis.corrections.length
            ? '<div class="prep-history-block"><div class="prep-preview-copy"><strong>Corrections:</strong> ' + escapeHtml(analysis.corrections.join(' • ')) + '</div></div>'
            : '';

        return '' +
            '<div class="prep-analysis-block">' +
                '<div class="prep-preview-grid">' +
                    '<div class="prep-preview-metric"><div class="prep-preview-metric-label">TradeScore</div><div class="prep-preview-metric-value">' + escapeHtml(String(analysis.tradeScore)) + '</div></div>' +
                    '<div class="prep-preview-metric"><div class="prep-preview-metric-label">Compliance</div><div class="prep-preview-metric-value">' + escapeHtml(String(analysis.complianceScore)) + '%</div></div>' +
                    '<div class="prep-preview-metric"><div class="prep-preview-metric-label">Risk</div><div class="prep-preview-metric-value">' + escapeHtml(String(analysis.riskScore)) + '%</div></div>' +
                    '<div class="prep-preview-metric"><div class="prep-preview-metric-label">Quality</div><div class="prep-preview-metric-value">' + escapeHtml(String(analysis.qualityScore)) + '%</div></div>' +
                '</div>' +
                '<div class="prep-history-block"><div class="tos-feedback">' + escapeHtml(analysis.feedback || 'No feedback.') + '</div></div>' +
                (analysis.patternHint ? '<div class="prep-history-block"><div class="prep-preview-copy"><strong>Pattern:</strong> ' + escapeHtml(analysis.patternHint) + '</div></div>' : '') +
                ((positivePills || negativePills) ? '<div class="prep-history-block"><div class="tos-tag-row">' + positivePills + negativePills + '</div></div>' : '') +
                strengths +
                corrections +
            '</div>';
    }

    function buildPreviewHtml(trade) {
        if (!trade || !trade.osAnalysis) return '';
        return '' +
            '<div class="prep-preview-card">' +
                '<div class="prep-preview-heading">' +
                    '<div>' +
                        '<p class="prep-preview-title">Live Trade Preview</p>' +
                        '<div class="prep-preview-copy">' + escapeHtml(trade.symbol || '—') + ' — T:' + escapeHtml(trade.ticketId || '—') + '</div>' +
                    '</div>' +
                    zoneBadgeHtml(trade.osAnalysis) +
                '</div>' +
                buildReasonPills(trade.complianceReasons) +
                buildAnalysisHtml(trade.osAnalysis) +
            '</div>';
    }

    function buildHistoryCardHtml(state) {
        var history = state.trades.slice().sort(function (a, b) {
            return getTradeSortValue(b) - getTradeSortValue(a);
        });

        var body = history.length ? history.map(function (trade) {
            var detailRow = replaceTokens(prepT('prep_history_detail_row', 'Entry: {entry} — SL: {sl} — Vol: {vol} — Risk: {risk} — P/L: {pnl}'), {
                entry: formatNumber(trade.entryPrice, 2),
                sl: formatNumber(trade.stopLoss, 2),
                vol: formatNumber(trade.volume, 2),
                risk: formatNumber(trade.riskValue, 2),
                pnl: formatPnl(trade.pnl)
            });
            var safeId = encodeURIComponent(trade.id);

            return '' +
                '<article class="prep-history-item">' +
                    '<div class="prep-history-head">' +
                        '<div class="prep-history-meta">' +
                            '<h4 class="prep-history-title">' + escapeHtml(replaceTokens(prepT('prep_history_trade_meta', '{symbol} — T:{ticket}'), { symbol: trade.symbol || '—', ticket: trade.ticketId || '—' })) + '</h4>' +
                            '<div class="prep-history-detail">Open: ' + escapeHtml(formatDateTime(trade.openTime)) + ' — Close: ' + escapeHtml(formatDateTime(trade.closeTime)) + '</div>' +
                        '</div>' +
                        '<div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">' +
                            zoneBadgeHtml(trade.osAnalysis) +
                            '<span class="prep-history-badge ' + (trade.compliant ? 'prep-history-badge--compliant' : 'prep-history-badge--noncompliant') + '">' + escapeHtml(trade.compliant ? prepT('prep_history_compliant_badge', 'COMPLIANT') : prepT('prep_history_noncompliant_badge', 'NON-COMPLIANT')) + ' (' + Math.round((trade.complianceScore || 0) * 100) + '%)</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="prep-history-block"><div class="prep-history-detail">' + escapeHtml(detailRow) + '</div></div>' +
                    (trade.note ? '<div class="prep-history-block"><div class="prep-history-note">' + escapeHtml(trade.note) + '</div></div>' : '') +
                    (trade.screenshotName ? '<div class="prep-history-block"><div class="prep-history-note"><strong>Evidence:</strong> ' + escapeHtml(trade.screenshotName) + '</div></div>' : '') +
                    buildReasonPills(trade.complianceReasons) +
                    buildAnalysisHtml(trade.osAnalysis) +
                    '<div class="prep-history-actions">' +
                        '<button class="btn btn-ghost" type="button" data-edit-trade="' + safeId + '">' + escapeHtml(prepT('prep_btn_edit', 'Edit')) + '</button>' +
                        '<button class="btn btn-outline" type="button" data-delete-trade="' + safeId + '">' + escapeHtml(prepT('prep_btn_delete', 'Delete Trade')) + '</button>' +
                    '</div>' +
                '</article>';
        }).join('') : '<div class="prep-empty-state" data-i18n="prep_no_trades">No trades submitted.</div>';

        return '' +
            '<div class="prep-card">' +
                '<div class="prep-card-head">' +
                    '<h3 data-i18n="prep_history_title">Submission Record</h3>' +
                    '<p>Every saved trade is re-scored whenever you edit or delete the record. Qualification and disqualification counters are never manual.</p>' +
                '</div>' +
                '<div class="prep-card-body">' +
                    '<div class="prep-history-list">' + body + '</div>' +
                '</div>' +
            '</div>';
    }

    function collectTradeFromForm(mode) {
        var symbolId = mode === 'edit' ? 'editTradeSymbol' : 'tradeSymbol';
        var ticketId = mode === 'edit' ? 'editTradeTicket' : 'tradeTicket';
        var openDateId = mode === 'edit' ? 'editOpenDate' : 'tradeOpenDate';
        var openHourId = mode === 'edit' ? 'editOpenHour' : 'tradeOpenHour';
        var openMinId = mode === 'edit' ? 'editOpenMin' : 'tradeOpenMin';
        var closeDateId = mode === 'edit' ? 'editCloseDate' : 'tradeCloseDate';
        var closeHourId = mode === 'edit' ? 'editCloseHour' : 'tradeCloseHour';
        var closeMinId = mode === 'edit' ? 'editCloseMin' : 'tradeCloseMin';
        var entryId = mode === 'edit' ? 'editTradeEntryPrice' : 'tradeEntryPrice';
        var stopId = mode === 'edit' ? 'editTradeStopLoss' : 'tradeStopLoss';
        var tpId = mode === 'edit' ? 'editTradeTakeProfit' : 'tradeTakeProfit';
        var volumeId = mode === 'edit' ? 'editTradeVolume' : 'tradeVolume';
        var pnlId = mode === 'edit' ? 'editTradePnl' : 'tradePnl';
        var noteId = mode === 'edit' ? 'editTradeNote' : 'tradeNote';

        var openRaw = combineDateTimePair(openDateId, openHourId, openMinId);
        var closeRaw = combineDateTimePair(closeDateId, closeHourId, closeMinId);
        var openInfo = parseTradeDateTime(openRaw);
        var closeInfo = parseTradeDateTime(closeRaw);

        return {
            symbol: document.getElementById(symbolId).value,
            ticketId: document.getElementById(ticketId).value,
            openTime: openInfo ? openInfo.isoValue : '',
            closeTime: closeInfo ? closeInfo.isoValue : '',
            entryPrice: document.getElementById(entryId).value,
            stopLoss: document.getElementById(stopId).value,
            takeProfit: document.getElementById(tpId).value,
            volume: document.getElementById(volumeId).value,
            pnl: document.getElementById(pnlId).value,
            note: document.getElementById(noteId).value
        };
    }

    function updateUploadLabel(input, labelId) {
        var label = document.getElementById(labelId);
        if (!label || !input) return;
        if (input.files && input.files[0]) {
            label.textContent = input.files[0].name;
            return;
        }
        if (labelId === 'editTradeScreenshotLabel' && editTradeId) {
            var state = getState();
            var trade = state.trades.find(function (item) { return item.id === editTradeId; });
            label.textContent = trade && trade.screenshotName
                ? 'Current evidence: ' + trade.screenshotName
                : 'Current screenshot evidence will be kept unless replaced.';
            return;
        }
        label.textContent = 'No file selected.';
    }

    function setFormError(id, message) {
        var el = document.getElementById(id);
        if (!el) return;
        if (!message) {
            el.style.display = 'none';
            el.textContent = '';
            return;
        }
        el.style.display = 'block';
        el.textContent = message;
    }

    function clearMainTradeForm() {
        var form = document.getElementById('tradeForm');
        if (form) form.reset();
        setFormError('prepTradeFormError', '');
        updateUploadLabel(document.getElementById('tradeScreenshot'), 'tradeScreenshotLabel');
        renderPrepareTradePreview();
    }

    function renderStatus(state) {
        var statusBar = document.getElementById('prepStatusBar');
        var statusText = document.getElementById('prepStatusText');
        if (!statusBar || !statusText) return;
        statusBar.className = 'prep-status-bar ' + getStatusClass(state.status);
        statusText.textContent = getStatusLabel(state.status);
    }

    function renderCooldownTimer(state) {
        var timer = document.getElementById('prepCooldownTimer');
        if (!timer) return;
        if (cooldownInterval) {
            clearInterval(cooldownInterval);
            cooldownInterval = null;
        }
        if (state.status !== 'DISQUALIFIED' || !state.cooldownUntil) {
            timer.textContent = formatCountdown(0);
            return;
        }
        var tick = function () {
            var latest = getState();
            if (latest.status === 'DISQUALIFIED' && latest.cooldownUntil) {
                var remaining = new Date(latest.cooldownUntil).getTime() - Date.now();
                if (remaining <= 0) {
                    if (cooldownInterval) clearInterval(cooldownInterval);
                    cooldownInterval = null;
                    var reset = getDefaultState();
                    saveState(reset);
                    renderState();
                    return;
                }
                timer.textContent = formatCountdown(remaining);
            }
        };
        tick();
        cooldownInterval = setInterval(tick, 1000);
    }

    function wireHistoryActions(root) {
        if (!root) return;
        root.querySelectorAll('[data-edit-trade]').forEach(function (button) {
            button.addEventListener('click', function () {
                openEditTrade(decodeURIComponent(button.getAttribute('data-edit-trade')));
            });
        });
        root.querySelectorAll('[data-delete-trade]').forEach(function (button) {
            button.addEventListener('click', function () {
                openDeleteTrade(decodeURIComponent(button.getAttribute('data-delete-trade')));
            });
        });
    }

    function renderState() {
        var state = getState();
        if (state.trades.length) {
            reEvaluateAllTrades(state);
            saveState(state);
        }

        var counts = getCounts(state);
        renderStatus(state);

        var summaryWrap = document.getElementById('prepOsSummaryWrap');
        if (summaryWrap) summaryWrap.innerHTML = state.status === 'NOT_STARTED' ? '' : buildBehaviorSummaryHtml(state);

        var activeDashboard = document.getElementById('prepActiveDashboard');
        var qualifiedDashboard = document.getElementById('prepQualifiedDashboard');
        var disqualifiedDashboard = document.getElementById('prepDisqualifiedDashboard');
        if (activeDashboard) activeDashboard.innerHTML = buildDashboardHtml(counts);
        if (qualifiedDashboard) qualifiedDashboard.innerHTML = buildDashboardHtml(counts);
        if (disqualifiedDashboard) disqualifiedDashboard.innerHTML = buildDashboardHtml(counts);

        var activeHistory = document.getElementById('prepHistoryActive');
        var qualifiedHistory = document.getElementById('prepHistoryQualified');
        var disqualifiedHistory = document.getElementById('prepHistoryDisqualified');
        if (activeHistory) {
            activeHistory.innerHTML = buildHistoryCardHtml(state);
            wireHistoryActions(activeHistory);
        }
        if (qualifiedHistory) {
            qualifiedHistory.innerHTML = buildHistoryCardHtml(state);
            wireHistoryActions(qualifiedHistory);
        }
        if (disqualifiedHistory) {
            disqualifiedHistory.innerHTML = buildHistoryCardHtml(state);
            wireHistoryActions(disqualifiedHistory);
        }

        setElementVisible('prepStateNotStarted', state.status === 'NOT_STARTED');
        setElementVisible('prepStateActive', state.status === 'ACTIVE');
        setElementVisible('prepStateQualified', state.status === 'QUALIFIED');
        setElementVisible('prepStateDisqualified', state.status === 'DISQUALIFIED');

        renderCooldownTimer(state);
        renderPrepareTradePreview();
    }

    function renderPrepareTradePreview() {
        var root = document.getElementById('prepTradePreview');
        if (!root) return;
        var symbolEl = document.getElementById('tradeSymbol');
        var ticketEl = document.getElementById('tradeTicket');
        var entryEl = document.getElementById('tradeEntryPrice');
        var stopEl = document.getElementById('tradeStopLoss');
        var volumeEl = document.getElementById('tradeVolume');
        if (!symbolEl || !ticketEl || !entryEl || !stopEl || !volumeEl) return;

        var hasOpenPair = pairHasValue('tradeOpenDate', 'tradeOpenHour', 'tradeOpenMin');
        var hasClosePair = pairHasValue('tradeCloseDate', 'tradeCloseHour', 'tradeCloseMin');
        if (!symbolEl.value && !ticketEl.value && !hasOpenPair && !hasClosePair && !entryEl.value && !stopEl.value && !volumeEl.value) {
            root.innerHTML = '';
            return;
        }

        var draftData = collectTradeFromForm('create');
        var screenshotInput = document.getElementById('tradeScreenshot');
        var previewState = getState();
        previewState.trades = previewState.trades.concat([
            buildTradeSnapshot(draftData, 'preview', new Date().toISOString(), screenshotInput && screenshotInput.files[0] ? screenshotInput.files[0].name : '')
        ]);
        reEvaluateAllTrades(previewState);
        root.innerHTML = buildPreviewHtml(previewState.trades[previewState.trades.length - 1]);
    }

    function openPrepModal(id) {
        var modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }

    function closePrepModal(id) {
        var modal = document.getElementById(id);
        if (modal) modal.classList.remove('active');
        if (!document.querySelector('.prep-modal.active') && !document.querySelector('.auth-overlay.active') && !document.querySelector('.doc-overlay.active')) {
            document.body.classList.remove('modal-open');
        }
    }

    function openEditTrade(tradeId) {
        var state = getState();
        var trade = state.trades.find(function (item) { return item.id === tradeId; });
        if (!trade) return;
        editTradeId = tradeId;
        document.getElementById('editTradeSymbol').value = trade.symbol || '';
        document.getElementById('editTradeTicket').value = trade.ticketId || '';
        splitDateTimeToPair(trade.openTime, 'editOpenDate', 'editOpenHour', 'editOpenMin');
        splitDateTimeToPair(trade.closeTime, 'editCloseDate', 'editCloseHour', 'editCloseMin');
        document.getElementById('editTradeEntryPrice').value = trade.entryPrice != null ? trade.entryPrice : '';
        document.getElementById('editTradeStopLoss').value = trade.stopLoss != null ? trade.stopLoss : '';
        document.getElementById('editTradeTakeProfit').value = trade.takeProfit != null ? trade.takeProfit : '';
        document.getElementById('editTradeVolume').value = trade.volume != null ? trade.volume : '';
        document.getElementById('editTradePnl').value = trade.pnl != null ? trade.pnl : '';
        document.getElementById('editTradeNote').value = trade.note || '';
        document.getElementById('editTradeScreenshot').value = '';
        setFormError('prepEditFormError', '');
        updateUploadLabel(document.getElementById('editTradeScreenshot'), 'editTradeScreenshotLabel');
        openPrepModal('editTradeModal');
    }

    function openDeleteTrade(tradeId) {
        pendingDeleteTradeId = tradeId;
        openPrepModal('deleteTradeModal');
    }

    function activatePrepare() {
        var ready = ['prepAck1', 'prepAck2', 'prepAck3'].every(function (id) {
            var input = document.getElementById(id);
            return input && input.checked;
        });
        if (!ready) {
            updateActivationState();
            return;
        }
        var state = getState();
        state.status = 'ACTIVE';
        state.activatedAt = state.activatedAt || new Date().toISOString();
        saveState(state);
        renderState();
    }

    function updateActivationState() {
        var ready = ['prepAck1', 'prepAck2', 'prepAck3'].every(function (id) {
            var input = document.getElementById(id);
            return input && input.checked;
        });
        var button = document.getElementById('prepActivateBtn');
        if (button) button.disabled = !ready;
    }

    function handleTradeSubmit(event) {
        event.preventDefault();
        var confirm = document.getElementById('tradeConfirm');
        var screenshotInput = document.getElementById('tradeScreenshot');
        var state = getState();

        if (state.status !== 'ACTIVE') {
            setFormError('prepTradeFormError', prepT('prep_ack_body', 'Before activation, you must confirm the following statements. All statements must be accepted before the system allows activation.'));
            return;
        }

        if (!confirm || !confirm.checked) {
            setFormError('prepTradeFormError', prepT('prep_confirm_required', 'You must confirm the trade data matches your MT5 Account History export.'));
            return;
        }
        if (!screenshotInput || !screenshotInput.files || !screenshotInput.files[0]) {
            setFormError('prepTradeFormError', prepT('prep_screenshot_required', 'Screenshot is mandatory.'));
            return;
        }

        var data = collectTradeFromForm('create');
        if (data.openTime == null || data.closeTime == null) {
            setFormError('prepTradeFormError', prepT('prep_datetime_invalid', 'Use YYYY-MM-DD HH:MM or DD.MM.YYYY HH:MM'));
            return;
        }

        state.trades.push(buildTradeSnapshot(data, null, null, screenshotInput.files[0].name));
        reEvaluateAllTrades(state);
        saveState(state);
        clearMainTradeForm();
        renderState();
    }

    function handleEditSubmit(event) {
        event.preventDefault();
        if (!editTradeId) return;

        var state = getState();
        var index = state.trades.findIndex(function (item) { return item.id === editTradeId; });
        if (index < 0) return;

        var existing = state.trades[index];
        var screenshotInput = document.getElementById('editTradeScreenshot');
        var data = collectTradeFromForm('edit');
        if (data.openTime == null || data.closeTime == null) {
            setFormError('prepEditFormError', prepT('prep_datetime_invalid', 'Use YYYY-MM-DD HH:MM or DD.MM.YYYY HH:MM'));
            return;
        }

        state.trades[index] = buildTradeSnapshot(
            data,
            existing.id,
            existing.createdAt,
            screenshotInput && screenshotInput.files && screenshotInput.files[0] ? screenshotInput.files[0].name : existing.screenshotName
        );
        reEvaluateAllTrades(state);
        saveState(state);
        closePrepModal('editTradeModal');
        editTradeId = null;
        renderState();
    }

    function handleDeleteTrade() {
        if (!pendingDeleteTradeId) return;
        var state = getState();
        state.trades = state.trades.filter(function (item) { return item.id !== pendingDeleteTradeId; });
        pendingDeleteTradeId = null;
        reEvaluateAllTrades(state);
        saveState(state);
        closePrepModal('deleteTradeModal');
        renderState();
    }

    window.closePrepModal = closePrepModal;
    window.openEditTrade = openEditTrade;
    window.openDeleteTrade = openDeleteTrade;
    window.altivorPrepare = {
        isApprovedPrepareSymbol: isApprovedPrepareSymbol,
        parseTradeDateTime: parseTradeDateTime,
        reEvaluateAllTrades: reEvaluateAllTrades,
        renderState: renderState
    };

    function init() {
        var tradeForm = document.getElementById('tradeForm');
        var editForm = document.getElementById('editTradeForm');
        var activateBtn = document.getElementById('prepActivateBtn');
        var deleteBtn = document.getElementById('prepDeleteConfirmBtn');
        var screenshotInput = document.getElementById('tradeScreenshot');
        var editScreenshotInput = document.getElementById('editTradeScreenshot');

        populateTimeSelects('tradeOpenHour', 'tradeOpenMin');
        populateTimeSelects('tradeCloseHour', 'tradeCloseMin');
        populateTimeSelects('editOpenHour', 'editOpenMin');
        populateTimeSelects('editCloseHour', 'editCloseMin');

        ['tradeOpenDate', 'tradeOpenHour', 'tradeOpenMin', 'tradeCloseDate', 'tradeCloseHour', 'tradeCloseMin'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('change', renderPrepareTradePreview);
        });

        if (tradeForm) {
            tradeForm.addEventListener('submit', handleTradeSubmit);
            tradeForm.addEventListener('input', renderPrepareTradePreview);
            tradeForm.addEventListener('change', renderPrepareTradePreview);
        }
        if (editForm) editForm.addEventListener('submit', handleEditSubmit);
        if (activateBtn) activateBtn.addEventListener('click', activatePrepare);
        if (deleteBtn) deleteBtn.addEventListener('click', handleDeleteTrade);
        if (screenshotInput) screenshotInput.addEventListener('change', function () {
            updateUploadLabel(screenshotInput, 'tradeScreenshotLabel');
            renderPrepareTradePreview();
        });
        if (editScreenshotInput) editScreenshotInput.addEventListener('change', function () {
            updateUploadLabel(editScreenshotInput, 'editTradeScreenshotLabel');
        });

        ['prepAck1', 'prepAck2', 'prepAck3'].forEach(function (id) {
            var input = document.getElementById(id);
            if (input) input.addEventListener('change', updateActivationState);
        });

        document.querySelectorAll('.prep-modal').forEach(function (modal) {
            modal.addEventListener('click', function (event) {
                if (event.target === modal) closePrepModal(modal.id);
            });
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                document.querySelectorAll('.prep-modal.active').forEach(function (modal) {
                    closePrepModal(modal.id);
                });
            }
        });

        document.addEventListener('altivor:languagechange', function () {
            renderState();
            updateUploadLabel(document.getElementById('tradeScreenshot'), 'tradeScreenshotLabel');
            updateUploadLabel(document.getElementById('editTradeScreenshot'), 'editTradeScreenshotLabel');
        });

        updateActivationState();
        updateUploadLabel(document.getElementById('tradeScreenshot'), 'tradeScreenshotLabel');
        updateUploadLabel(document.getElementById('editTradeScreenshot'), 'editTradeScreenshotLabel');
        renderState();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
