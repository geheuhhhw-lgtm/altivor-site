/* ═══════════════════════════════════════════════════════════════════════
   ALTIVOR Trading Log — Daily Journal
   Storage key: altivor_trading_log_v1
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const TL_KEY       = 'altivor_trading_log_v1';
const TL_PNL_KEY   = 'altivor_pnl_v2';
const TL_THEME_KEY = 'altivor-theme';

const htmlEl = document.documentElement;

function tlT(key, fallback) {
    return (typeof window.altivorGetTranslation === 'function') ? window.altivorGetTranslation(key, fallback) : fallback;
}

// entries shape: { 'YYYY-MM-DD': Entry }
let entries = {};
let editingDate = null; // null = new entry, 'YYYY-MM-DD' = editing existing

/* ─── HELPERS ─────────────────────────────────────────────────────────── */
function today() {
    const d = new Date();
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
function p2(n) { return String(n).padStart(2, '0'); }
function fmtDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const days  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dow   = new Date(y, m - 1, d).getDay();
    return `${days[dow]}, ${names[m - 1]} ${d}, ${y}`;
}
function fmtDateShort(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${names[m - 1]} ${d}, ${y}`;
}

function avg(list) {
    if (!list.length) return 0;
    return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function getTraderOS() {
    return window.altivorTraderOS || null;
}

function zoneClass(key) {
    return key ? `tos-zone--${key}` : '';
}

function pillClass(key) {
    return key ? `tos-pill--${key}` : '';
}

function scoreBadgeClass(key) {
    return key ? `tos-score-badge--${key}` : '';
}

function metricClassFromScore(score) {
    if (score >= 80) return 'tos-metric-value--positive';
    if (score >= 50) return 'tos-metric-value--warning';
    return 'tos-metric-value--negative';
}

function setTosMetric(id, text, tone) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `tos-metric-value${tone ? ` ${tone}` : ''}`;
}

function renderSummaryPills(labels) {
    return labels.filter(Boolean).map(label => `<span class="tos-tag">${esc(label)}</span>`).join('');
}

function renderAnalysisTags(analysis, limit = 4) {
    const os = getTraderOS();
    if (!os || !analysis) return '';
    const negatives = (analysis.negativeTags || []).slice(0, limit);
    const positives = (analysis.positiveTags || []).slice(0, limit);
    if (negatives.length) return os.renderTagPills(negatives, 'negative');
    if (positives.length) return os.renderTagPills(positives, 'positive');
    return '';
}

function renderSessionSummaryTags(session, limit = 4) {
    if (!session) return '';
    return renderSummaryPills([
        ...(session.corrections || []),
        ...(session.strengths || []),
    ].slice(0, limit));
}

function scoreBadgeText(session) {
    if (!session) return '—';
    return session.fail ? 'FAIL' : `${session.sessionScore} · ${session.zone.label}`;
}

/* ─── STORAGE ─────────────────────────────────────────────────────────── */
function loadEntries() {
    try { return JSON.parse(localStorage.getItem(TL_KEY)) || {}; } catch { return {}; }
}
function saveEntries() {
    try { localStorage.setItem(TL_KEY, JSON.stringify(entries)); } catch { showToast(tlT('tl_storage_err', 'Storage error.'), 'error'); }
}

/* ─── PNL DATA BRIDGE ──────────────────────────────────────────────────── */
function getPnlForDate(dateStr) {
    try {
        const raw = localStorage.getItem(TL_PNL_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        const trades = data[dateStr];
        if (!trades || !trades.length) return null;
        const total = trades.reduce((s, t) => s + t.amount, 0);
        const count = trades.length;
        return { total, count };
    } catch { return null; }
}

function getPnlTradesForDate(dateStr) {
    try {
        const raw = localStorage.getItem(TL_PNL_KEY);
        if (!raw) return [];
        const data = JSON.parse(raw);
        return Array.isArray(data[dateStr]) ? data[dateStr] : [];
    } catch {
        return [];
    }
}

function getJournalAnalysis(dateStr, entry) {
    const os = getTraderOS();
    if (!os || !entry) return null;
    return entry.journalAnalysis || os.analyzeJournalEntry({ ...entry, date: dateStr }, { mode: 'journal' });
}

function getLinkedPnlSession(dateStr) {
    const os = getTraderOS();
    if (!os) return null;
    const trades = getPnlTradesForDate(dateStr);
    if (!trades.length) return null;
    return os.summarizeSession(trades.map((trade, index) => ({ ...trade, date: dateStr, sameDayCount: index + 1 })), { mode: 'pnl' });
}

function getPrimarySessionReadout(dateStr, entry) {
    const linked = getLinkedPnlSession(dateStr);
    if (linked) return { ...linked, sourceLabel: 'PnL Calendar' };
    const os = getTraderOS();
    const session = os ? os.summarizeSession([{ ...entry, date: dateStr }], { mode: 'journal' }) : null;
    return session ? { ...session, sourceLabel: 'Journal' } : null;
}

function updateTraderOSSummary() {
    const os = getTraderOS();
    const dates = Object.keys(entries).sort();
    const hasEntries = dates.length > 0;
    const journalSummary = os ? os.summarizeBehavior(dates.map(dateStr => entries[dateStr]), { mode: 'journal' }) : null;
    const sessions = dates.map(dateStr => {
        const readout = getPrimarySessionReadout(dateStr, entries[dateStr]);
        return readout ? { ...readout, dateKey: dateStr } : null;
    }).filter(Boolean);

    if (!os || !hasEntries || !journalSummary) {
        setTosMetric('tlOsAvgSession', '—', '');
        setTosMetric('tlOsCompliance', '—', '');
        setTosMetric('tlOsRiskBreaks', '—', '');
        setTosMetric('tlOsRedDays', '—', '');
        setTosMetric('tlOsStreak', '—', '');
        setTosMetric('tlOsWorstDay', '—', '');
        const masteryEl = document.getElementById('tlOsMastery');
        const alertEl = document.getElementById('tlOsPrimaryAlert');
        const tagsEl = document.getElementById('tlOsTags');
        if (masteryEl) {
            masteryEl.textContent = '—';
            masteryEl.className = 'tos-pill';
        }
        if (alertEl) alertEl.textContent = tlT('tl_no_session', 'No session data yet.');
        if (tagsEl) tagsEl.innerHTML = '';
        return;
    }

    const avgSessionScore = sessions.length ? Math.round(avg(sessions.map(session => session.sessionScore))) : journalSummary.avgSessionScore;
    const redDays = sessions.filter(session => session.fail || session.zone.key === 'red').length;
    const worstDay = sessions.length
        ? sessions.slice().sort((a, b) => a.sessionScore - b.sessionScore)[0]
        : null;

    setTosMetric('tlOsAvgSession', String(avgSessionScore), metricClassFromScore(avgSessionScore));
    setTosMetric('tlOsCompliance', `${journalSummary.ruleCompliancePct}%`, metricClassFromScore(journalSummary.ruleCompliancePct));
    setTosMetric('tlOsRiskBreaks', String(journalSummary.riskBreaks), journalSummary.riskBreaks > 0 ? 'tos-metric-value--negative' : 'tos-metric-value--positive');
    setTosMetric('tlOsRedDays', String(redDays), redDays > 0 ? 'tos-metric-value--negative' : 'tos-metric-value--positive');
    setTosMetric('tlOsStreak', journalSummary.disciplineStreak ? `${journalSummary.disciplineStreak}d` : '0d', journalSummary.disciplineStreak >= 3 ? 'tos-metric-value--positive' : journalSummary.disciplineStreak > 0 ? 'tos-metric-value--warning' : '');
    setTosMetric('tlOsWorstDay', worstDay ? fmtDateShort(worstDay.dateKey) : '—', worstDay && (worstDay.fail || worstDay.zone.key === 'red') ? 'tos-metric-value--negative' : '');

    const masteryEl = document.getElementById('tlOsMastery');
    const alertEl = document.getElementById('tlOsPrimaryAlert');
    const tagsEl = document.getElementById('tlOsTags');
    const summaryZone = os.getZone(avgSessionScore, journalSummary.criticalCount > 0);
    if (!masteryEl || !alertEl || !tagsEl) return;

    masteryEl.textContent = journalSummary.masteryLevel;
    masteryEl.className = `tos-pill ${pillClass(summaryZone.key)}`;
    alertEl.textContent = worstDay ? `${worstDay.sourceLabel}: ${worstDay.feedback}` : (journalSummary.alerts[0] || tlT('tl_readout_ready', 'Behavioral readout ready.'));
    tagsEl.innerHTML = renderSummaryPills([
        journalSummary.behaviorProfile,
        journalSummary.topPattern,
        worstDay ? `Worst source ${worstDay.sourceLabel}` : '',
    ]);
}

/* ─── FORM STATE ──────────────────────────────────────────────────────── */
const formState = {
    riskExceeded: null,
    sessionOk: null,
    rating: null,
};

function clearFieldError(inputId, errId) {
    const inp = document.getElementById(inputId);
    const err = document.getElementById(errId);
    if (inp) inp.classList.remove('error');
    if (err) err.classList.remove('visible');
}

function showFieldError(inputId, errId, msg) {
    const inp = document.getElementById(inputId);
    const err = document.getElementById(errId);
    if (inp) inp.classList.add('error');
    if (err) { err.textContent = msg; err.classList.add('visible'); }
}

function resetFormState() {
    formState.riskExceeded = null;
    formState.sessionOk = null;
    formState.rating = null;
}

/* ─── OPEN FORM ───────────────────────────────────────────────────────── */
function openForm(dateStr, existingEntry) {
    editingDate = dateStr || today();
    resetFormState();

    const card = document.getElementById('tlFormCard');
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Date label
    document.getElementById('tlFormDate').textContent = fmtDate(editingDate);

    // Clear input errors
    clearFieldError('tlFormPnl', 'tlFormPnlErr');
    clearFieldError('tlFormTrades', 'tlFormTradesErr');

    // Pre-fill PnL/Trades from PnL Calendar if available
    const pnlEl = document.getElementById('tlFormPnl');
    const tradesEl = document.getElementById('tlFormTrades');
    const pnl = getPnlForDate(editingDate);
    if (pnl && !existingEntry) {
        pnlEl.value = pnl.total.toFixed(2);
        tradesEl.value = pnl.count;
    } else {
        pnlEl.value = '';
        tradesEl.value = '';
    }

    // Reset toggles
    document.querySelectorAll('.tl-yn-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tl-rating-btn').forEach(b => b.classList.remove('active'));

    // Clear textareas
    ['tlQGood','tlQBad','tlQImprove','tlQMotivation','tlQChallengeMeaning'].forEach(id => {
        document.getElementById(id).value = '';
    });

    // If editing — populate
    if (existingEntry) {
        formState.riskExceeded = existingEntry.riskExceeded || null;
        formState.sessionOk    = existingEntry.sessionOk || null;
        formState.rating       = existingEntry.rating || null;

        if (formState.riskExceeded) {
            const btn = document.querySelector(`.tl-yn-btn[data-field="riskExceeded"][data-val="${formState.riskExceeded}"]`);
            if (btn) btn.classList.add('active');
        }
        if (formState.sessionOk) {
            const btn = document.querySelector(`.tl-yn-btn[data-field="sessionOk"][data-val="${formState.sessionOk}"]`);
            if (btn) btn.classList.add('active');
        }
        if (formState.rating) {
            const btn = document.querySelector(`.tl-rating-btn[data-rating="${formState.rating}"]`);
            if (btn) btn.classList.add('active');
        }

        document.getElementById('tlFormPnl').value      = existingEntry.pnl !== undefined && existingEntry.pnl !== null ? existingEntry.pnl : '';
        document.getElementById('tlFormTrades').value   = existingEntry.trades !== undefined && existingEntry.trades !== null ? existingEntry.trades : '';
        document.getElementById('tlQGood').value        = existingEntry.qGood || '';
        document.getElementById('tlQBad').value         = existingEntry.qBad || '';
        document.getElementById('tlQImprove').value     = existingEntry.qImprove || '';
        document.getElementById('tlQMotivation').value  = existingEntry.motivation || '';
        document.getElementById('tlQChallengeMeaning').value = existingEntry.challengeMeaning || '';
        document.getElementById('tlFormMode').textContent = `${tlT('tl_editing', 'Editing')} — ${fmtDateShort(editingDate)}`;
    } else {
        document.getElementById('tlFormMode').textContent = `${tlT('tl_new_entry', 'New entry')} — ${fmtDateShort(editingDate)}`;
        // Pre-fill motivation from last saved entry if present
        prefillMotivation();
    }

    // Motivation hint
    updateMotivationHint();
}

function prefillMotivation() {
    const dates = Object.keys(entries).sort().reverse();
    for (const d of dates) {
        if (entries[d] && entries[d].motivation) {
            document.getElementById('tlQMotivation').value = entries[d].motivation;
            break;
        }
    }
}

function updateMotivationHint() {
    const hint = document.getElementById('tlMotivationHint');
    const val = document.getElementById('tlQMotivation').value.trim();
    if (val) {
        hint.style.display = 'block';
        hint.textContent = tlT('tl_motivation_hint', 'This answer will stay available in future entries as a reminder.');
    } else {
        hint.style.display = 'none';
    }
}

function closeForm() {
    document.getElementById('tlFormCard').style.display = 'none';
    editingDate = null;
    resetFormState();
}

/* ─── SAVE ────────────────────────────────────────────────────────────── */
function saveEntry() {
    if (!editingDate) return;

    const pnlRaw    = document.getElementById('tlFormPnl').value.trim();
    const tradesRaw = document.getElementById('tlFormTrades').value.trim();
    const qGood     = document.getElementById('tlQGood').value.trim();
    const qBad      = document.getElementById('tlQBad').value.trim();
    const qImprove  = document.getElementById('tlQImprove').value.trim();
    const motivation = document.getElementById('tlQMotivation').value.trim();
    const challengeMeaning = document.getElementById('tlQChallengeMeaning').value.trim();

    // --- Validation ---
    let valid = true;

    // PnL: required, must be a number (negatives and 0 allowed)
    clearFieldError('tlFormPnl', 'tlFormPnlErr');
    if (pnlRaw === '' || isNaN(Number(pnlRaw))) {
        showFieldError('tlFormPnl', 'tlFormPnlErr', tlT('tl_err_pnl', 'Required — enter a number (e.g. 0 or -25.50)'));
        valid = false;
    }

    // Trades: required, must be integer >= 0
    clearFieldError('tlFormTrades', 'tlFormTradesErr');
    const tradesNum = parseInt(tradesRaw, 10);
    if (tradesRaw === '' || isNaN(tradesNum) || tradesNum < 0) {
        showFieldError('tlFormTrades', 'tlFormTradesErr', tlT('tl_err_trades', 'Required — enter 0 or more'));
        valid = false;
    }

    // Yes/No toggles
    if (!formState.riskExceeded) {
        showToast(tlT('tl_err_risk', 'Select Risk Exceeded — Yes or No.'), 'error'); valid = false;
    }
    if (valid && !formState.sessionOk) {
        showToast(tlT('tl_err_session', 'Select Session Compliant — Yes or No.'), 'error'); valid = false;
    }

    // Day rating
    if (valid && !formState.rating) {
        showToast(tlT('tl_err_rating', 'Select a Day Assessment rating.'), 'error'); valid = false;
    }

    // Reflection fields
    if (valid && !qGood)    { showToast(tlT('tl_err_good', 'Fill in: What did I do well today?'), 'error'); valid = false; }
    if (valid && !qBad)     { showToast(tlT('tl_err_bad', 'Fill in: Where could I improve?'), 'error'); valid = false; }
    if (valid && !qImprove) { showToast(tlT('tl_err_improve', 'Fill in: One thing to improve tomorrow.'), 'error'); valid = false; }

    if (!valid) return;

    const isNew = !entries[editingDate];
    const now = new Date().toISOString();
    const os = getTraderOS();
    const journalAnalysis = os ? os.analyzeJournalEntry({
        date: editingDate,
        pnl: Number(pnlRaw),
        trades: tradesNum,
        riskExceeded: formState.riskExceeded,
        sessionOk: formState.sessionOk,
        rating: formState.rating,
        qGood,
        qBad,
        qImprove,
        motivation,
        challengeMeaning,
    }, { mode: 'journal' }) : null;

    entries[editingDate] = {
        date:         editingDate,
        pnl:          Number(pnlRaw),
        trades:       tradesNum,
        riskExceeded: formState.riskExceeded,
        sessionOk:    formState.sessionOk,
        rating:       formState.rating,
        qGood:        qGood || null,
        qBad:         qBad || null,
        qImprove:     qImprove || null,
        motivation:   motivation || null,
        challengeMeaning: challengeMeaning || null,
        journalAnalysis,
        createdAt:    isNew ? now : (entries[editingDate].createdAt || now),
        updatedAt:    now,
    };

    saveEntries();
    renderList();
    closeForm();
    showToast(isNew ? tlT('tl_saved', 'Entry saved.') : tlT('tl_updated', 'Entry updated.'));
}

/* ─── DELETE ──────────────────────────────────────────────────────────── */
function deleteEntry(dateStr) {
    delete entries[dateStr];
    saveEntries();
    renderList();
    showToast(tlT('tl_deleted', 'Entry deleted.'));
}

/* ─── RENDER LIST ─────────────────────────────────────────────────────── */
function renderList() {
    const list    = document.getElementById('tlList');
    const empty   = document.getElementById('tlEmpty');
    const counter = document.getElementById('tlListCount');
    const todayBanner = document.getElementById('tlTodayBanner');
    const newBtn  = document.getElementById('tlNewBtn');

    const dates = Object.keys(entries).sort().reverse();
    counter.textContent = dates.length;

    const todayStr = today();
    const todayLogged = !!entries[todayStr];

    // Banner + button
    todayBanner.classList.toggle('visible', todayLogged);
    newBtn.disabled = todayLogged;
    newBtn.style.opacity = todayLogged ? '0.45' : '';
    newBtn.style.cursor  = todayLogged ? 'default' : '';
    newBtn.title = todayLogged ? tlT('tl_today_logged', "Today's entry is already saved. Edit it below.") : '';

    if (dates.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'flex';
        updateTraderOSSummary();
        return;
    }
    empty.style.display = 'none';

    list.innerHTML = dates.map(dateStr => entryCardHTML(dateStr, entries[dateStr])).join('');
    updateTraderOSSummary();

    // Bind open/collapse (skip if user was selecting text)
    list.querySelectorAll('.tl-entry-header').forEach(header => {
        header.addEventListener('click', e => {
            if (e.target.closest('.tl-entry-actions, .tl-del-confirm')) return;
            const sel = window.getSelection ? window.getSelection() : null;
            if (sel && sel.toString().trim().length > 0) return;
            const card = header.closest('.tl-entry');
            card.classList.toggle('open');
        });
    });

    // Edit
    list.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const d = btn.dataset.date;
            openForm(d, entries[d]);
        });
    });

    // Delete flow
    list.querySelectorAll('[data-action="show-del"]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            document.querySelectorAll('.tl-del-confirm').forEach(el => el.classList.remove('visible'));
            const conf = document.getElementById(`tl-del-${btn.dataset.date}`);
            if (conf) conf.classList.add('visible');
        });
    });
    list.querySelectorAll('[data-action="del-cancel"]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const conf = document.getElementById(`tl-del-${btn.dataset.date}`);
            if (conf) conf.classList.remove('visible');
        });
    });
    list.querySelectorAll('[data-action="del-confirm"]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            deleteEntry(btn.dataset.date);
        });
    });
}

function entryCardHTML(dateStr, e) {
    const ratingLabel = { plan: tlT('tl_rate_plan', 'In Plan'), partial: tlT('tl_rate_partial', 'Partial'), broken: tlT('tl_rate_broken', 'Rules Broken') };
    const ratingCls   = e.rating || 'none';
    const chipCls     = e.rating || 'neutral';
    const sessionReadout = getPrimarySessionReadout(dateStr, e);
    const journalAnalysis = getJournalAnalysis(dateStr, e);
    const readoutTags = renderSessionSummaryTags(sessionReadout, 4);

    // Use stored pnl/trades from entry (user-entered), fall back to PnL bridge
    let pnlVal = e.pnl;
    let tradesVal = e.trades;
    if (pnlVal === undefined || pnlVal === null) {
        const bridge = getPnlForDate(dateStr);
        if (bridge) { pnlVal = bridge.total; tradesVal = bridge.count; }
    }
    const hasPnl = pnlVal !== undefined && pnlVal !== null;
    const pnlText = hasPnl
        ? `${pnlVal >= 0 ? '+' : ''}$${Math.abs(pnlVal).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})}`
        : '—';
    const pnlCls = hasPnl ? (pnlVal > 0 ? 'positive' : pnlVal < 0 ? 'negative' : '') : '';

    const riskText    = e.riskExceeded === 'yes' ? tlT('tl_yes', 'Yes') : e.riskExceeded === 'no' ? tlT('tl_no', 'No') : '—';
    const sessionText = e.sessionOk === 'yes' ? tlT('tl_yes', 'Yes') : e.sessionOk === 'no' ? tlT('tl_no', 'No') : '—';
    const riskCls     = e.riskExceeded === 'yes' ? 'negative' : e.riskExceeded === 'no' ? 'positive' : '';
    const sessionCls  = e.sessionOk === 'yes' ? 'positive' : e.sessionOk === 'no' ? 'negative' : '';

    const tradesText = (tradesVal !== undefined && tradesVal !== null) ? tradesVal : '—';

    const savedAt = e.updatedAt
        ? new Date(e.updatedAt).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
        : '';

    return `
    <div class="tl-entry" data-date="${dateStr}">
        <div class="tl-entry-header">
            <span class="tl-entry-rating-dot ${ratingCls}"></span>
            <span class="tl-entry-date">${fmtDateShort(dateStr)}</span>
            <div class="tl-entry-chips">
                ${e.rating ? `<span class="tl-chip ${chipCls}">${ratingLabel[e.rating]}</span>` : ''}
                ${hasPnl ? `<span class="tl-chip ${pnlCls}">${pnlText}</span>` : ''}
                ${sessionReadout ? `<span class="tos-score-badge ${scoreBadgeClass(sessionReadout.zone.key)}">${scoreBadgeText(sessionReadout)}</span>` : ''}
            </div>
            <svg class="tl-entry-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>

        <div class="tl-entry-body">
            <div class="tl-entry-grid">
                <div class="tl-entry-field">
                    <div class="tl-entry-field-label">${tlT('tl_day_pnl', 'Day PnL')}</div>
                    <div class="tl-entry-field-value ${pnlCls}">${pnlText}</div>
                </div>
                <div class="tl-entry-field">
                    <div class="tl-entry-field-label">${tlT('tl_trades', 'Trades')}</div>
                    <div class="tl-entry-field-value">${tradesText}</div>
                </div>
                <div class="tl-entry-field">
                    <div class="tl-entry-field-label">${tlT('tl_risk_exceeded', 'Risk Exceeded')}</div>
                    <div class="tl-entry-field-value ${riskCls}">${riskText}</div>
                </div>
                <div class="tl-entry-field">
                    <div class="tl-entry-field-label">${tlT('tl_session_compliant', 'Session Compliant')}</div>
                    <div class="tl-entry-field-value ${sessionCls}">${sessionText}</div>
                </div>
            </div>

            ${sessionReadout ? `<div class="tos-card tos-card--compact"><div class="tos-row"><span class="tos-section-label">${tlT('tl_tos_readout', 'Trader OS Session Readout')}</span><span class="tos-zone ${zoneClass(sessionReadout.zone.key)}">${sessionReadout.sourceLabel}</span></div><div class="tos-feedback">${esc(sessionReadout.feedback)}</div>${readoutTags ? `<div class="tos-tag-row">${readoutTags}</div>` : ''}${journalAnalysis && sessionReadout.sourceLabel !== 'Journal' ? `<div class="tos-feedback-sub">${tlT('tl_journal_reflection', 'Journal reflection')}: ${esc(journalAnalysis.feedback)}</div>` : ''}</div>` : ''}

            <div class="tl-entry-questions">
                ${e.qGood ? `<div class="tl-entry-q"><div class="tl-entry-q-label">${tlT('tl_q_good', 'What I did well')}</div><div class="tl-entry-q-answer">${esc(e.qGood)}</div></div>` : ''}
                ${e.qBad  ? `<div class="tl-entry-q"><div class="tl-entry-q-label">${tlT('tl_q_bad', 'Where I could improve')}</div><div class="tl-entry-q-answer">${esc(e.qBad)}</div></div>` : ''}
                ${e.qImprove ? `<div class="tl-entry-q"><div class="tl-entry-q-label">${tlT('tl_q_improve', 'One thing to fix tomorrow')}</div><div class="tl-entry-q-answer">${esc(e.qImprove)}</div></div>` : ''}
            </div>

            ${e.motivation ? `<div class="tl-entry-motivation"><div class="tl-entry-q-label">${tlT('tl_q_motivation', 'Why I chose ALTIVOR')}</div><div class="tl-entry-q-answer">${esc(e.motivation)}</div></div>` : ''}
            ${e.challengeMeaning ? `<div class="tl-entry-motivation"><div class="tl-entry-q-label">${tlT('tl_q_challenge', 'Why this challenge means something to me')}</div><div class="tl-entry-q-answer">${esc(e.challengeMeaning)}</div></div>` : ''}

            <div class="tl-entry-actions">
                <button class="btn btn-ghost" style="font-size:0.72rem;padding:0.35rem 0.75rem;" data-action="edit" data-date="${dateStr}" type="button">${tlT('tl_edit', 'Edit')}</button>
                <button class="btn btn-ghost" style="font-size:0.72rem;padding:0.35rem 0.75rem;color:var(--pnl-red-text,#f07070);" data-action="show-del" data-date="${dateStr}" type="button">${tlT('tl_delete', 'Delete')}</button>
                ${savedAt ? `<span class="tl-entry-time">${tlT('tl_saved_at', 'Saved')} ${savedAt}</span>` : ''}
            </div>

            <div class="tl-del-confirm" id="tl-del-${dateStr}">
                <span>${tlT('tl_del_confirm', 'Delete this entry permanently?')}</span>
                <button class="btn btn-ghost btn--xs" data-action="del-cancel" data-date="${dateStr}" type="button">${tlT('tl_cancel', 'Cancel')}</button>
                <button class="btn btn--xs" style="background:rgba(240,112,112,0.85);color:#fff;border:1px solid rgba(240,112,112,0.5);border-radius:var(--radius);font-family:'Inter',sans-serif;font-weight:600;cursor:pointer;font-size:0.72rem;padding:0.35rem 0.7rem;" data-action="del-confirm" data-date="${dateStr}" type="button">${tlT('tl_delete', 'Delete')}</button>
            </div>
        </div>
    </div>`;
}

function esc(s) {
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
        .replace(/\n/g,'<br>');
}

/* ─── TOAST ───────────────────────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, type = 'success') {
    const t = document.getElementById('tl-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `tl-toast tl-toast--${type} show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ─── THEME ───────────────────────────────────────────────────────────── */
function tlApplyTheme(theme) {
    htmlEl.setAttribute('data-theme', theme);
    localStorage.setItem(TL_THEME_KEY, theme);
    document.querySelectorAll('.theme-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.theme === theme));
}

/* ─── INIT EVENT BINDINGS ─────────────────────────────────────────────── */
document.getElementById('tlNewBtn').addEventListener('click', () => {
    const todayStr = today();
    if (entries[todayStr]) return; // already logged
    openForm(todayStr, null);
});

document.getElementById('tlFormCancel').addEventListener('click', closeForm);
document.getElementById('tlFormSave').addEventListener('click', saveEntry);

// Yes/No toggles
document.querySelectorAll('.tl-yn-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const val   = btn.dataset.val;
        // Deselect sibling
        document.querySelectorAll(`.tl-yn-btn[data-field="${field}"]`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        formState[field] = val;
    });
});

// Rating buttons
document.querySelectorAll('.tl-rating-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tl-rating-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        formState.rating = btn.dataset.rating;
    });
});

// Motivation hint update
document.getElementById('tlQMotivation').addEventListener('input', updateMotivationHint);

// Theme buttons
document.querySelectorAll('.theme-btn').forEach(btn =>
    btn.addEventListener('click', () => tlApplyTheme(btn.dataset.theme)));

/* ─── INIT ────────────────────────────────────────────────────────────── */
entries = loadEntries();
tlApplyTheme(localStorage.getItem(TL_THEME_KEY) || 'dark');
renderList();
document.addEventListener('altivor:languagechange', function() { renderList(); });
