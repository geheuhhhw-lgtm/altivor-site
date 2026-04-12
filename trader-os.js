(function (window) {
    'use strict';

    function tosT(key, fallback) { return (typeof window.altivorGetTranslation === 'function') ? window.altivorGetTranslation(key, fallback) : fallback; }

    const GREEN_MIN = 80;
    const YELLOW_MIN = 50;

    const LABEL_DEFAULTS = {
        calm_execution: 'Controlled execution',
        discipline_breakdown: 'Discipline breakdown',
        disciplined_session: 'Disciplined session',
        duplicate_submission: 'Duplicate submission',
        evidence_logged: 'Evidence logged',
        framework_broken: 'Framework broken',
        holding_too_short: 'Holding time too short',
        impulsive_entry: 'Impulsive entry',
        invalid_setup: 'Invalid setup',
        late_entry: 'Late entry',
        log_incomplete: 'Log incomplete',
        overtrading: 'Overtrading',
        partial_discipline: 'Minor deviation',
        plan_respected: 'Plan respected',
        proper_risk: 'Proper risk',
        reflection_missing: 'Reflection missing',
        revenge_trade: 'Revenge trade',
        risk_limit_broken: 'Risk limit broken',
        risk_respected: 'Risk respected',
        risk_stretched: 'Risk stretched',
        risk_unverified: 'Risk not verified',
        screenshot_missing: 'Evidence missing',
        self_review_complete: 'Review complete',
        session_non_compliant: 'Session non-compliant',
        setup_unverified: 'Setup not verified',
        stop_loss_missing: 'Stop loss missing',
        stop_loss_unverified: 'Stop loss unverified',
        symbol_invalid: 'Wrong instrument',
        ticket_missing: 'Ticket missing',
        valid_setup: 'Valid setup',
        window_breach: 'Outside permitted window'
    };

    const LABELS = new Proxy(LABEL_DEFAULTS, { get(t, k) { return tosT('tos_' + k, t[k] || k); } });

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function num(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function avg(values) {
        if (!values.length) return 0;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function parseDateLike(value) {
        if (!value) return null;
        if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
        const raw = String(value).trim();
        if (!raw) return null;
        const normalized = raw.replace(' ', 'T');
        const parsed = new Date(normalized);
        if (!Number.isNaN(parsed.getTime())) return parsed;
        const dotMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2}))?$/);
        if (dotMatch) {
            const day = Number(dotMatch[1]);
            const month = Number(dotMatch[2]);
            const year = Number(dotMatch[3]);
            const hour = Number(dotMatch[4] || 0);
            const minute = Number(dotMatch[5] || 0);
            const dt = new Date(year, month - 1, day, hour, minute);
            return Number.isNaN(dt.getTime()) ? null : dt;
        }
        return null;
    }

    function dateKeyFrom(value, fallback) {
        const parsed = parseDateLike(value);
        if (parsed) {
            const y = parsed.getFullYear();
            const m = String(parsed.getMonth() + 1).padStart(2, '0');
            const d = String(parsed.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        if (fallback) return fallback;
        return null;
    }

    function hourFrom(value) {
        if (!value && value !== 0) return null;
        if (/^\d{2}:\d{2}$/.test(String(value).trim())) {
            return Number(String(value).slice(0, 2));
        }
        const parsed = parseDateLike(value);
        return parsed ? parsed.getHours() : null;
    }

    function weekdayLabel(dateKey) {
        if (!dateKey) return tosT('tos_unknown', 'Unknown');
        const parsed = parseDateLike(`${dateKey}T00:00`);
        if (!parsed) return tosT('tos_unknown', 'Unknown');
        return [tosT('tos_sun','Sun'), tosT('tos_mon','Mon'), tosT('tos_tue','Tue'), tosT('tos_wed','Wed'), tosT('tos_thu','Thu'), tosT('tos_fri','Fri'), tosT('tos_sat','Sat')][parsed.getDay()];
    }

    function addNegative(target, code, severity, penalty, group, label, meta) {
        if (target.some((item) => item.code === code)) return;
        target.push({
            code,
            severity,
            penalty,
            group,
            label: label || LABELS[code] || code,
            meta: meta || null
        });
    }

    function addPositive(target, code, label) {
        if (target.some((item) => item.code === code)) return;
        target.push({
            code,
            label: label || LABELS[code] || code
        });
    }

    function getZone(score, fail) {
        if (fail) return { key: 'red', label: tosT('tos_zone_fail', 'FAIL') };
        if (score >= GREEN_MIN) return { key: 'green', label: tosT('tos_zone_green', 'GREEN') };
        if (score >= YELLOW_MIN) return { key: 'yellow', label: tosT('tos_zone_yellow', 'YELLOW') };
        return { key: 'red', label: tosT('tos_zone_red', 'RED') };
    }

    function getTradeClass(score) {
        if (score >= 85) return tosT('tos_class_excellent', 'EXCELLENT');
        if (score >= 70) return tosT('tos_class_good', 'GOOD');
        if (score >= 50) return tosT('tos_class_weak', 'WEAK');
        return tosT('tos_class_poor', 'POOR');
    }

    function hasTag(negativeTags, code) {
        return negativeTags.some((tag) => tag.code === code);
    }

    function penaltiesForGroup(negativeTags, groups) {
        return negativeTags
            .filter((tag) => groups.includes(tag.group))
            .reduce((sum, tag) => sum + tag.penalty, 0);
    }

    function rankTags(negativeTags) {
        return negativeTags.slice().sort((a, b) => {
            const severityOrder = { critical: 3, medium: 2, soft: 1 };
            const severityDelta = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
            if (severityDelta !== 0) return severityDelta;
            return b.penalty - a.penalty;
        });
    }

    function feedbackFromTags(data) {
        const negatives = rankTags(data.negativeTags);
        if (data.fail) {
            if (hasTag(negatives, 'revenge_trade')) {
                return tosT('tos_fb_revenge_fail', 'Session fail: behavior turned reactive immediately after prior pressure.');
            }
            if (hasTag(negatives, 'stop_loss_missing')) {
                return tosT('tos_fb_sl_fail', 'Trade void: stop-loss protection was not structurally in place.');
            }
            if (hasTag(negatives, 'risk_limit_broken')) {
                return tosT('tos_fb_risk_fail', 'Trade void: risk control broke before outcome could matter.');
            }
            if (hasTag(negatives, 'ticket_missing') || hasTag(negatives, 'log_incomplete')) {
                return tosT('tos_fb_log_fail', 'Execution is not auditable. Incomplete logging invalidates the process.');
            }
            return tosT('tos_fb_critical_fail', 'Critical process breach detected. Profit does not override a structural failure.');
        }
        if (!negatives.length && data.positiveTags.length >= 2) {
            return tosT('tos_fb_clean', 'Execution stayed mechanical. This is the behavior profile to repeat.');
        }
        if (hasTag(negatives, 'overtrading')) {
            return tosT('tos_fb_overtrade', 'Trade frequency is degrading decision quality. The system sees force, not edge.');
        }
        if (hasTag(negatives, 'impulsive_entry')) {
            return tosT('tos_fb_impulsive', 'Execution quality dropped because the trade was entered emotionally, not mechanically.');
        }
        if (hasTag(negatives, 'late_entry')) {
            return tosT('tos_fb_late', 'Timing drift reduced quality. The edge was late, not clean.');
        }
        if (hasTag(negatives, 'window_breach')) {
            return tosT('tos_fb_window', 'Control weakens outside the declared execution window.');
        }
        if (data.zone.key === 'green') {
            return tosT('tos_fb_green', 'Process remained controlled. Preserve the same risk and timing discipline.');
        }
        if (data.zone.key === 'yellow') {
            return tosT('tos_fb_yellow', 'Control is still recoverable, but deviation is forming a repeatable leak.');
        }
        return tosT('tos_fb_red', 'The system sees unstable execution. Reduce frequency and restore structure first.');
    }

    function correctionsFromTags(negativeTags) {
        return rankTags(negativeTags).slice(0, 3).map((tag) => {
            switch (tag.code) {
                case 'revenge_trade':
                    return tosT('tos_cor_revenge', 'Impose a hard pause after any emotionally negative trade.');
                case 'overtrading':
                    return tosT('tos_cor_overtrade', 'Cut session frequency before the fourth trade appears.');
                case 'risk_limit_broken':
                    return tosT('tos_cor_risk', 'Pre-define risk before entry and reject size drift completely.');
                case 'stop_loss_missing':
                    return tosT('tos_cor_sl', 'No order is valid without a protected stop in place.');
                case 'late_entry':
                    return tosT('tos_cor_late', 'Enter only at the planned trigger, not after confirmation has already expanded.');
                case 'window_breach':
                    return tosT('tos_cor_window', 'Stay inside the declared time window only.');
                case 'ticket_missing':
                case 'log_incomplete':
                    return tosT('tos_cor_log', 'Complete the audit trail before the trade counts as real data.');
                default:
                    return tosT('tos_cor_default', 'Correct the structural leak:') + ' ' + tag.label.toLowerCase() + '.';
            }
        });
    }

    function strengthsFromTags(positiveTags) {
        return positiveTags.slice(0, 3).map((tag) => {
            switch (tag.code) {
                case 'proper_risk':
                    return tosT('tos_str_risk', 'Risk stayed inside the declared boundary.');
                case 'valid_setup':
                    return tosT('tos_str_setup', 'The setup stayed aligned with the framework.');
                case 'calm_execution':
                    return tosT('tos_str_calm', 'Execution remained controlled and non-reactive.');
                case 'evidence_logged':
                    return tosT('tos_str_evidence', 'The trade remained auditable.');
                case 'disciplined_session':
                    return tosT('tos_str_session', 'Session structure stayed intact.');
                default:
                    return tag.label;
            }
        });
    }

    function finalizeAnalysis(base) {
        const totalPenalty = base.negativeTags.reduce((sum, tag) => sum + tag.penalty, 0);
        const criticalCount = base.negativeTags.filter((tag) => tag.severity === 'critical').length;
        const mediumCount = base.negativeTags.filter((tag) => tag.severity === 'medium').length;
        const softCount = base.negativeTags.filter((tag) => tag.severity === 'soft').length;
        const fail = Boolean(base.forceFail || criticalCount > 0);
        const tradeScore = clamp(Math.round(100 - totalPenalty), 0, 100);
        const complianceScore = clamp(100 - penaltiesForGroup(base.negativeTags, ['compliance', 'log']), 0, 100);
        const riskScore = clamp(100 - penaltiesForGroup(base.negativeTags, ['risk']), 0, 100);
        const qualityScore = clamp(100 - penaltiesForGroup(base.negativeTags, ['quality', 'behavior']), 0, 100);
        const zone = getZone(tradeScore, fail);
        return {
            mode: base.mode,
            tradeScore,
            complianceScore,
            riskScore,
            qualityScore,
            classification: getTradeClass(tradeScore),
            zone,
            fail,
            pass: !fail && tradeScore >= GREEN_MIN,
            criticalCount,
            mediumCount,
            softCount,
            negativeTags: base.negativeTags,
            positiveTags: base.positiveTags,
            strengths: strengthsFromTags(base.positiveTags),
            corrections: correctionsFromTags(base.negativeTags),
            feedback: feedbackFromTags({ negativeTags: base.negativeTags, positiveTags: base.positiveTags, zone, fail }),
            patternHint: base.patternHint || null,
            dateKey: base.dateKey || null,
            executionHour: base.executionHour,
            sessionType: base.sessionType || null,
            metadata: base.metadata || {}
        };
    }

    function analyzePrepareTrade(input, options) {
        const negativeTags = [];
        const positiveTags = [];
        const reasons = Array.isArray(input.complianceReasons) ? input.complianceReasons : [];
        const riskValue = input.riskValue != null ? input.riskValue : null;
        const sameDayCount = input.sameDayCount || 0;
        const priorLoss = Boolean(input.previousLossSameSession);
        const openHour = hourFrom(input.openTime);
        const executionHour = Number.isFinite(openHour) ? openHour : null;
        const dateKey = dateKeyFrom(input.openTime, input.date || null);

        if (!String(input.symbol || '').trim()) {
            addNegative(negativeTags, 'symbol_invalid', 'critical', 40, 'compliance');
        }
        if (!String(input.ticketId || '').trim()) {
            addNegative(negativeTags, 'ticket_missing', 'critical', 35, 'log');
        }
        if (!input.hasScreenshot) {
            addNegative(negativeTags, 'screenshot_missing', 'medium', 15, 'log');
        } else {
            addPositive(positiveTags, 'evidence_logged');
        }
        if (reasons.includes('INSTRUMENT_NOT_US100_CFD')) {
            addNegative(negativeTags, 'symbol_invalid', 'critical', 40, 'compliance');
        }
        if (reasons.includes('OUTSIDE_PERMITTED_WINDOW')) {
            addNegative(negativeTags, 'window_breach', 'medium', 18, 'compliance');
        }
        if (reasons.includes('STOP_LOSS_MISSING')) {
            addNegative(negativeTags, 'stop_loss_missing', 'critical', 100, 'risk');
        }
        if (reasons.includes('RISK_NOT_FIXED')) {
            addNegative(negativeTags, 'risk_limit_broken', 'critical', 100, 'risk');
        }
        if (reasons.includes('DAILY_LIMIT_EXCEEDED') || sameDayCount > 3) {
            addNegative(negativeTags, 'overtrading', 'medium', 25, 'behavior');
        }
        if (reasons.includes('DUPLICATE_SUBMISSION')) {
            addNegative(negativeTags, 'duplicate_submission', 'medium', 22, 'log');
        }
        if (reasons.includes('HOLDING_TIME_TOO_SHORT')) {
            addNegative(negativeTags, 'holding_too_short', 'soft', 10, 'quality');
        }
        if (priorLoss && sameDayCount > 1) {
            addNegative(negativeTags, 'revenge_trade', 'critical', 100, 'behavior');
        }
        if (input.compliant) {
            addPositive(positiveTags, 'valid_setup');
        }
        if (riskValue != null && input.riskWithinPlan) {
            addPositive(positiveTags, 'proper_risk');
        }
        if (executionHour != null && executionHour >= 15 && executionHour <= 18 && !hasTag(negativeTags, 'window_breach')) {
            addPositive(positiveTags, 'calm_execution');
        }

        let patternHint = null;
        if (hasTag(negativeTags, 'revenge_trade')) {
            patternHint = tosT('tos_ph_revenge', 'Breakdown followed a prior losing trade.');
        } else if (executionHour != null && executionHour >= 19 && negativeTags.length) {
            patternHint = tosT('tos_ph_late_session', 'Deviation clustered late in the session.');
        } else if (hasTag(negativeTags, 'overtrading')) {
            patternHint = tosT('tos_ph_overtrade', 'Frequency expanded beyond the declared session limit.');
        }

        return finalizeAnalysis({
            mode: 'prepare',
            negativeTags,
            positiveTags,
            dateKey,
            executionHour,
            patternHint,
            metadata: {
                sameDayCount,
                reasons,
                riskValue
            }
        });
    }

    function analyzePnlTrade(input, options) {
        const negativeTags = [];
        const positiveTags = [];
        const verificationVersion = Number(input.verificationVersion || 0);
        const strictVerification = verificationVersion >= 2;
        const sameDayCount = input.sameDayCount || 0;
        const dateKey = input.date || dateKeyFrom(input.createdAt, null);
        const executionHour = hourFrom(input.executionTime || input.createdAt);
        const behaviorState = String(input.behaviorState || '').trim();
        const riskState = String(input.riskState || '').trim();
        const setupState = String(input.setupState || '').trim();
        const stopLossState = String(input.stopLossState || '').trim();

        if (!String(input.ticketId || '').trim()) {
            addNegative(negativeTags, strictVerification ? 'ticket_missing' : 'log_incomplete', strictVerification ? 'critical' : 'medium', strictVerification ? 35 : 18, 'log');
        }
        if (!input.screenshotB64) {
            addNegative(negativeTags, 'log_incomplete', 'soft', 10, 'log', tosT('tos_evidence_light', 'Evidence light'));
        } else {
            addPositive(positiveTags, 'evidence_logged');
        }
        if (!stopLossState) {
            addNegative(negativeTags, strictVerification ? 'stop_loss_missing' : 'stop_loss_unverified', strictVerification ? 'critical' : 'medium', strictVerification ? 100 : 18, 'risk');
        } else if (stopLossState === 'missing') {
            addNegative(negativeTags, 'stop_loss_missing', 'critical', 100, 'risk');
        }
        if (!riskState) {
            addNegative(negativeTags, 'risk_unverified', 'medium', 16, 'risk');
        } else if (riskState === 'stretched') {
            addNegative(negativeTags, 'risk_stretched', 'medium', 24, 'risk');
        } else if (riskState === 'broken') {
            addNegative(negativeTags, 'risk_limit_broken', 'critical', 100, 'risk');
        } else {
            addPositive(positiveTags, 'proper_risk');
        }
        if (!setupState) {
            addNegative(negativeTags, 'setup_unverified', 'soft', 10, 'quality');
        } else if (setupState === 'late') {
            addNegative(negativeTags, 'late_entry', 'soft', 12, 'quality');
        } else if (setupState === 'invalid') {
            addNegative(negativeTags, 'invalid_setup', 'medium', 30, 'quality');
        } else {
            addPositive(positiveTags, 'valid_setup');
        }
        if (!behaviorState) {
            addNegative(negativeTags, 'partial_discipline', 'soft', 10, 'behavior', tosT('tos_behavior_unclassified', 'Behavior not classified'));
        } else if (behaviorState === 'emotional') {
            addNegative(negativeTags, 'impulsive_entry', 'medium', 24, 'behavior');
        } else if (behaviorState === 'revenge') {
            addNegative(negativeTags, 'revenge_trade', 'critical', 100, 'behavior');
        } else {
            addPositive(positiveTags, 'calm_execution');
        }
        if (sameDayCount > 3) {
            addNegative(negativeTags, 'overtrading', 'medium', 25, 'behavior');
        }

        let patternHint = null;
        if (behaviorState === 'revenge') {
            patternHint = tosT('tos_ph_reactive', 'Reactive re-entry pattern detected.');
        } else if (executionHour != null && executionHour >= 14 && negativeTags.length) {
            patternHint = tosT('tos_ph_control_after', 'Control weakened after') + ` ${String(executionHour).padStart(2, '0')}:00.`;
        } else if (sameDayCount > 3) {
            patternHint = tosT('tos_ph_freq_quality', 'Quality dropped as session frequency expanded.');
        }

        return finalizeAnalysis({
            mode: 'pnl',
            negativeTags,
            positiveTags,
            dateKey,
            executionHour,
            patternHint,
            metadata: {
                sameDayCount,
                behaviorState,
                riskState,
                setupState,
                stopLossState,
                direction: input.direction || null,
                amount: input.amount || null
            }
        });
    }

    function analyzeJournalEntry(input, options) {
        const negativeTags = [];
        const positiveTags = [];
        const tradesCount = Number(input.trades || 0);
        const dateKey = input.date || null;

        if (String(input.riskExceeded || '').trim() === 'yes') {
            addNegative(negativeTags, 'risk_limit_broken', 'critical', 100, 'risk');
        } else if (String(input.riskExceeded || '').trim() === 'no') {
            addPositive(positiveTags, 'risk_respected');
        }

        if (String(input.sessionOk || '').trim() === 'no') {
            addNegative(negativeTags, 'session_non_compliant', 'critical', 100, 'compliance');
        } else if (String(input.sessionOk || '').trim() === 'yes') {
            addPositive(positiveTags, 'plan_respected');
        }

        if (input.rating === 'partial') {
            addNegative(negativeTags, 'partial_discipline', 'soft', 16, 'behavior');
        } else if (input.rating === 'broken') {
            addNegative(negativeTags, 'discipline_breakdown', 'medium', 30, 'behavior');
        } else if (input.rating === 'plan') {
            addPositive(positiveTags, 'disciplined_session');
        }

        if (tradesCount > 3) {
            addNegative(negativeTags, 'overtrading', 'medium', 25, 'behavior');
        }

        const reviewComplete = Boolean(String(input.qGood || '').trim() && String(input.qBad || '').trim() && String(input.qImprove || '').trim());
        if (!reviewComplete) {
            addNegative(negativeTags, 'reflection_missing', 'medium', 15, 'log');
        } else {
            addPositive(positiveTags, 'self_review_complete');
        }

        const reflectiveText = `${input.qBad || ''} ${input.qImprove || ''}`.toLowerCase();
        if (/revenge|tilt|fomo/.test(reflectiveText)) {
            addNegative(negativeTags, 'revenge_trade', 'critical', 100, 'behavior');
        } else if (/impuls|panic|forced/.test(reflectiveText)) {
            addNegative(negativeTags, 'impulsive_entry', 'medium', 22, 'behavior');
        }

        let patternHint = null;
        if (hasTag(negativeTags, 'revenge_trade')) {
            patternHint = tosT('tos_ph_self_reactive', 'Self-report confirms a reactive pattern rather than controlled execution.');
        } else if (tradesCount > 3) {
            patternHint = tosT('tos_ph_daily_freq', 'Daily session quality fell once frequency expanded.');
        } else if (input.rating === 'broken') {
            patternHint = tosT('tos_ph_journal_broken', 'The journal itself confirms loss of structure.');
        }

        const analysis = finalizeAnalysis({
            mode: 'journal',
            negativeTags,
            positiveTags,
            dateKey,
            executionHour: null,
            patternHint,
            metadata: {
                tradesCount,
                pnl: input.pnl || null,
                rating: input.rating || null
            }
        });

        analysis.sessionScore = analysis.tradeScore;
        return analysis;
    }

    function analyzeTrade(input, options) {
        const mode = options && options.mode ? options.mode : input && input.mode ? input.mode : 'pnl';
        if (mode === 'prepare') return analyzePrepareTrade(input || {}, options || {});
        if (mode === 'journal') return analyzeJournalEntry(input || {}, options || {});
        return analyzePnlTrade(input || {}, options || {});
    }

    function ensureAnalysis(item, options) {
        if (!item) return null;
        if (item.osAnalysis) return item.osAnalysis;
        if (item.journalAnalysis) return item.journalAnalysis;
        return analyzeTrade(item, options || {});
    }

    function sessionFromTradeAnalyses(tradeAnalyses, options) {
        const analyses = tradeAnalyses.filter(Boolean);
        if (!analyses.length) {
            return {
                sessionScore: 0,
                avgTradeScore: 0,
                zone: getZone(0, false),
                fail: false,
                criticalCount: 0,
                mediumCount: 0,
                softCount: 0,
                topPattern: tosT('tos_no_data', 'No data'),
                feedback: tosT('tos_no_session_data', 'No verified session data yet.'),
                alerts: [],
                dateKey: null,
                behaviorProfile: tosT('tos_no_profile', 'No profile'),
                masteryLevel: tosT('tos_unrated', 'Unrated'),
                corrections: [],
                strengths: []
            };
        }

        const avgTradeScore = Math.round(avg(analyses.map((analysis) => analysis.tradeScore)));
        const criticalCount = analyses.reduce((sum, analysis) => sum + analysis.criticalCount, 0);
        const mediumCount = analyses.reduce((sum, analysis) => sum + analysis.mediumCount, 0);
        const softCount = analyses.reduce((sum, analysis) => sum + analysis.softCount, 0);
        const scores = analyses.map((analysis) => analysis.tradeScore);
        const spread = Math.max(...scores) - Math.min(...scores);
        const consistencyBonus = analyses.length === 1 ? 4 : spread <= 10 ? 10 : spread <= 20 ? 6 : spread <= 35 ? 3 : 0;
        const disciplineBonus = analyses.every((analysis) => !analysis.fail && analysis.tradeScore >= 70)
            ? 8
            : analyses.every((analysis) => !analysis.fail)
                ? 4
                : 0;
        const overtradingCount = analyses.filter((analysis) => hasTag(analysis.negativeTags, 'overtrading')).length;
        const revengeCount = analyses.filter((analysis) => hasTag(analysis.negativeTags, 'revenge_trade')).length;
        const sessionPenalty = (criticalCount > 0 ? 100 : 0) + (mediumCount >= 3 ? 20 : 0) + (overtradingCount > 0 ? 15 : 0);
        const sessionScore = clamp(Math.round(avgTradeScore + consistencyBonus + disciplineBonus - sessionPenalty), 0, 100);
        const fail = criticalCount > 0 || revengeCount > 0;
        const zone = getZone(sessionScore, fail);
        const negativePool = analyses.flatMap((analysis) => analysis.negativeTags);
        const positivePool = analyses.flatMap((analysis) => analysis.positiveTags);
        const topNegative = topTagCounts(negativePool);
        const topPositive = topTagCounts(positivePool);
        const worstHour = topHour(analyses);
        const topPattern = topNegative.length ? topNegative[0].label : topPositive.length ? topPositive[0].label : tosT('tos_stable_session', 'Stable session');
        const alerts = [];
        if (worstHour && worstHour.count >= 2 && worstHour.hour >= 14) {
            alerts.push(tosT('tos_alert_control_after', 'Loss of control clusters after') + ` ${String(worstHour.hour).padStart(2, '0')}:00.`);
        }
        if (revengeCount > 0) {
            alerts.push(tosT('tos_alert_revenge', 'Largest breakdown starts after a prior losing trade.'));
        }
        if (overtradingCount > 0) {
            alerts.push(tosT('tos_alert_overtrade', 'Overtrading is compressing decision quality.'));
        }
        if (!alerts.length && zone.key === 'green') {
            alerts.push(tosT('tos_alert_controlled', 'Behavior stayed controlled across the session.'));
        }
        if (!alerts.length && zone.key !== 'green') {
            alerts.push(tosT('tos_alert_unstable', 'Control is unstable. Reduce frequency and restore mechanical execution.'));
        }

        return {
            sessionScore,
            avgTradeScore,
            zone,
            fail,
            criticalCount,
            mediumCount,
            softCount,
            topPattern,
            feedback: fail
                ? tosT('tos_sfb_fail', 'Session fail: critical behavior overrode percentage score.')
                : zone.key === 'green'
                    ? tosT('tos_sfb_green', 'Session stayed under control. Discipline, not profit, carried the result.')
                    : zone.key === 'yellow'
                        ? tosT('tos_sfb_yellow', 'Session remained salvageable, but the leak is now repeatable.')
                        : tosT('tos_sfb_red', 'Session shows loss of control. Restore process before scaling.'),
            alerts,
            dateKey: analyses[0].dateKey || null,
            behaviorProfile: profileFromMetrics({ criticalCount, overtradingCount, revengeCount, avgTradeScore, zone }),
            masteryLevel: masteryFromScore(sessionScore, fail),
            corrections: correctionsFromTags(negativePool),
            strengths: strengthsFromTags(positivePool)
        };
    }

    function topTagCounts(tags) {
        const counts = new Map();
        tags.forEach((tag) => {
            const key = tag.code || tag.label;
            const existing = counts.get(key) || { code: tag.code || key, label: tag.label || key, count: 0 };
            existing.count += 1;
            counts.set(key, existing);
        });
        return Array.from(counts.values()).sort((a, b) => b.count - a.count);
    }

    function topHour(analyses) {
        const hourCounts = new Map();
        analyses.forEach((analysis) => {
            if (analysis.executionHour == null) return;
            if (analysis.fail || analysis.tradeScore < 70) {
                hourCounts.set(analysis.executionHour, (hourCounts.get(analysis.executionHour) || 0) + 1);
            }
        });
        if (!hourCounts.size) return null;
        const sorted = Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1]);
        return { hour: sorted[0][0], count: sorted[0][1] };
    }

    function profileFromMetrics(metrics) {
        if (metrics.revengeCount > 0) return tosT('tos_prof_reactive', 'Reactive Escalator');
        if (metrics.criticalCount > 0) return tosT('tos_prof_risk', 'Risk Breaker');
        if (metrics.overtradingCount > 0) return tosT('tos_prof_freq', 'Frequency Drifter');
        if (metrics.zone.key === 'green' && metrics.avgTradeScore >= 80) return tosT('tos_prof_controlled', 'Controlled Operator');
        if (metrics.avgTradeScore >= 65) return tosT('tos_prof_inconsistent', 'Inconsistent Executor');
        return tosT('tos_prof_unstable', 'Unstable Operator');
    }

    function masteryFromScore(score, fail) {
        if (fail) return tosT('tos_mastery_lost', 'Control Lost');
        if (score >= 90) return tosT('tos_mastery_mastery', 'Mastery');
        if (score >= 80) return tosT('tos_mastery_controlled', 'Controlled');
        if (score >= 65) return tosT('tos_mastery_recovering', 'Recovering');
        return tosT('tos_mastery_fragile', 'Fragile');
    }

    function summarizeSession(items, options) {
        const mode = options && options.mode ? options.mode : 'pnl';
        if (mode === 'journal') {
            const analyses = items.map((item) => ensureAnalysis(item, { mode: 'journal' })).filter(Boolean);
            if (!analyses.length) return sessionFromTradeAnalyses([], options || {});
            const normalized = analyses.map((analysis) => ({
                tradeScore: analysis.sessionScore || analysis.tradeScore,
                criticalCount: analysis.criticalCount,
                mediumCount: analysis.mediumCount,
                softCount: analysis.softCount,
                negativeTags: analysis.negativeTags,
                positiveTags: analysis.positiveTags,
                fail: analysis.fail,
                dateKey: analysis.dateKey,
                executionHour: null
            }));
            const summary = sessionFromTradeAnalyses(normalized, options || {});
            summary.dateKey = analyses[0].dateKey || null;
            return summary;
        }
        const analyses = items.map((item) => ensureAnalysis(item, { mode })).filter(Boolean);
        return sessionFromTradeAnalyses(analyses, options || {});
    }

    function summarizeBehavior(items, options) {
        const mode = options && options.mode ? options.mode : 'pnl';
        if (!items || !items.length) {
            return {
                avgTradeScore: 0,
                avgSessionScore: 0,
                ruleCompliancePct: 0,
                riskBreaks: 0,
                overtradingCount: 0,
                criticalCount: 0,
                revengeCount: 0,
                topPattern: tosT('tos_no_data', 'No data'),
                worstHour: null,
                worstDay: null,
                disciplineStreak: 0,
                behaviorProfile: tosT('tos_no_profile', 'No profile'),
                masteryLevel: tosT('tos_unrated', 'Unrated'),
                alerts: [tosT('tos_no_behavior_data', 'No behavioral data yet.')],
                sessions: []
            };
        }

        if (mode === 'journal') {
            const analyses = items.map((item) => ensureAnalysis(item, { mode: 'journal' })).filter(Boolean);
            const sessions = analyses.map((analysis) => summarizeSession([analysis], { mode: 'journal' }));
            const avgSessionScore = Math.round(avg(sessions.map((session) => session.sessionScore)));
            const criticalCount = analyses.reduce((sum, analysis) => sum + analysis.criticalCount, 0);
            const overtradingCount = analyses.filter((analysis) => hasTag(analysis.negativeTags, 'overtrading')).length;
            const revengeCount = analyses.filter((analysis) => hasTag(analysis.negativeTags, 'revenge_trade')).length;
            const riskBreaks = analyses.filter((analysis) => hasTag(analysis.negativeTags, 'risk_limit_broken')).length;
            const topNegative = topTagCounts(analyses.flatMap((analysis) => analysis.negativeTags));
            const topPattern = topNegative.length ? topNegative[0].label : tosT('tos_stable_review', 'Stable review discipline');
            return {
                avgTradeScore: avgSessionScore,
                avgSessionScore,
                ruleCompliancePct: Math.round((analyses.filter((analysis) => !analysis.fail && analysis.tradeScore >= 80).length / analyses.length) * 100),
                riskBreaks,
                overtradingCount,
                criticalCount,
                revengeCount,
                topPattern,
                worstHour: null,
                worstDay: topDay(sessions),
                disciplineStreak: streakFromSessions(sessions),
                behaviorProfile: profileFromMetrics({ criticalCount, overtradingCount, revengeCount, avgTradeScore: avgSessionScore, zone: getZone(avgSessionScore, criticalCount > 0) }),
                masteryLevel: masteryFromScore(avgSessionScore, criticalCount > 0),
                alerts: buildBehaviorAlerts({ topPattern, riskBreaks, overtradingCount, revengeCount, worstHour: null }),
                sessions
            };
        }

        const analyses = items.map((item) => ensureAnalysis(item, { mode })).filter(Boolean);
        const grouped = {};
        analyses.forEach((analysis, index) => {
            const dateKey = analysis.dateKey || dateKeyFrom(items[index] && (items[index].date || items[index].openTime || items[index].createdAt), 'unknown');
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(analysis);
        });
        const sessions = Object.keys(grouped).sort().map((dateKey) => {
            const session = summarizeSession(grouped[dateKey], { mode });
            session.dateKey = dateKey;
            return session;
        });
        const avgTradeScore = Math.round(avg(analyses.map((analysis) => analysis.tradeScore)));
        const avgSessionScore = Math.round(avg(sessions.map((session) => session.sessionScore)));
        const criticalCount = analyses.reduce((sum, analysis) => sum + analysis.criticalCount, 0);
        const riskBreaks = analyses.filter((analysis) => hasTag(analysis.negativeTags, 'risk_limit_broken')).length;
        const overtradingCount = analyses.filter((analysis) => hasTag(analysis.negativeTags, 'overtrading')).length;
        const revengeCount = analyses.filter((analysis) => hasTag(analysis.negativeTags, 'revenge_trade')).length;
        const topNegative = topTagCounts(analyses.flatMap((analysis) => analysis.negativeTags));
        const topPattern = topNegative.length ? topNegative[0].label : tosT('tos_controlled_execution', 'Controlled execution');
        const worstHour = topHour(analyses);
        return {
            avgTradeScore,
            avgSessionScore,
            ruleCompliancePct: Math.round((analyses.filter((analysis) => !analysis.fail && analysis.tradeScore >= 80).length / analyses.length) * 100),
            riskBreaks,
            overtradingCount,
            criticalCount,
            revengeCount,
            topPattern,
            worstHour,
            worstDay: topDay(sessions),
            disciplineStreak: streakFromSessions(sessions),
            behaviorProfile: profileFromMetrics({ criticalCount, overtradingCount, revengeCount, avgTradeScore, zone: getZone(avgSessionScore, criticalCount > 0) }),
            masteryLevel: masteryFromScore(avgSessionScore, criticalCount > 0),
            alerts: buildBehaviorAlerts({ topPattern, riskBreaks, overtradingCount, revengeCount, worstHour }),
            sessions
        };
    }

    function topDay(sessions) {
        const counts = new Map();
        sessions.forEach((session) => {
            if (!session.dateKey) return;
            if (session.fail || session.zone.key === 'red') {
                const label = weekdayLabel(session.dateKey);
                counts.set(label, (counts.get(label) || 0) + 1);
            }
        });
        if (!counts.size) return null;
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        return { label: sorted[0][0], count: sorted[0][1] };
    }

    function streakFromSessions(sessions) {
        const ordered = sessions.slice().sort((a, b) => {
            if ((a.dateKey || '') < (b.dateKey || '')) return -1;
            if ((a.dateKey || '') > (b.dateKey || '')) return 1;
            return 0;
        });
        let streak = 0;
        for (let i = ordered.length - 1; i >= 0; i -= 1) {
            const session = ordered[i];
            const stable = !session.fail && session.zone.key !== 'red';
            if (!stable) break;
            streak += 1;
        }
        return streak;
    }

    function buildBehaviorAlerts(metrics) {
        const alerts = [];
        if (metrics.worstHour && metrics.worstHour.count >= 2 && metrics.worstHour.hour >= 14) {
            alerts.push(tosT('tos_balert_control_after', 'You lose control after') + ` ${String(metrics.worstHour.hour).padStart(2, '0')}:00.`);
        }
        if (metrics.revengeCount > 0) {
            alerts.push(tosT('tos_balert_revenge', 'Your biggest breakdown starts after a prior losing trade.'));
        }
        if (metrics.overtradingCount > 0) {
            alerts.push(tosT('tos_balert_overtrade', 'Overtrading is showing up as a repeatable control leak.'));
        }
        if (metrics.riskBreaks > 0) {
            alerts.push(tosT('tos_balert_risk', 'Risk discipline remains the main failure driver.'));
        }
        if (!alerts.length) {
            alerts.push(tosT('tos_balert_primary', 'Primary pattern:') + ` ${metrics.topPattern}.`);
        }
        return alerts;
    }

    function renderTagPills(tags, variant) {
        if (!tags || !tags.length) return '';
        return tags.map((tag) => `<span class="tos-tag tos-tag--${variant}${tag.severity ? ` tos-tag--${tag.severity}` : ''}">${escapeHtml(tag.label)}</span>`).join('');
    }

    window.altivorTraderOS = {
        analyzeTrade,
        analyzePrepareTrade,
        analyzePnlTrade,
        analyzeJournalEntry,
        summarizeSession,
        summarizeBehavior,
        getZone,
        escapeHtml,
        renderTagPills,
        labelFor: function (code) { return LABELS[code] || code; }
    };
}(window));
