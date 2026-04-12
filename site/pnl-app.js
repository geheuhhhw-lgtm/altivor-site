/* ═══════════════════════════════════════════════════════════════════════
   ALTIVOR PnL Calendar v2 — Multi-Trade Per Day
   Storage key: altivor_pnl_v2  (migrates from altivor_pnl_v1)
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const STORAGE_KEY = 'altivor_pnl_v2';
const STORAGE_KEY_V1 = 'altivor_pnl_v1';
const PNL_THEME_KEY = 'altivor-theme';
const CHALLENGE_KEY = 'altivor_challenge_cfg';
const MONTHLY_CFG_KEY = 'altivor_monthly_cfg';
const KEEP_CFG_KEY = 'altivor_keep_cfg';
function getDayNames() {
    const lang = (document.documentElement && document.documentElement.getAttribute('lang')) || 'en';
    return [1, 2, 3, 4, 5, 6, 0].map(d => new Date(2024, 0, d).toLocaleDateString(lang, { weekday: 'short' }));
}
function getMonthNames() {
    const lang = (document.documentElement && document.documentElement.getAttribute('lang')) || 'en';
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => new Date(2024, m, 1).toLocaleDateString(lang, { month: 'long' }));
}
function t(key, fallback) {
    return (typeof window.altivorGetTranslation === 'function') ? window.altivorGetTranslation(key, fallback) : fallback;
}

const pnlHtmlEl = document.documentElement;

// data shape: { 'YYYY-MM-DD': Trade[] }
let data = {};
let today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();

// Modal state
let tradeModalDate = null;
let editTradeId = null;
let pendingScreenB64 = null;
let selDirection = 'TP';

// Detail panel state
let detailDate = null;

/* ─── STORAGE ────────────────────────────────────────────────────────── */
function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
        migrateV1();
        return data; // migrateV1 populates & saves
    } catch { return {}; }
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        if (e.name === 'QuotaExceededError')
            showToast('Storage full — consider removing large screenshots.', 'error');
        else
            showToast('Storage error — data may not persist.', 'error');
    }
}

function migrateV1() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_V1);
        if (!raw) return;
        const v1 = JSON.parse(raw);
        const now = new Date().toISOString();
        data = {};
        for (const [dateStr, entry] of Object.entries(v1)) {
            if (!entry || typeof entry.amount !== 'number') continue;
            const dir = entry.type === 'SL' ? 'SL' : 'TP';
            data[dateStr] = [{
                id: genId(), date: dateStr,
                amount: normalizeAmt(entry.amount, dir), direction: dir,
                executionTime: null, note: null, screenshotB64: null,
                createdAt: entry.createdAt || now, updatedAt: entry.updatedAt || now,
            }];
        }
        saveData();
    } catch { }
}

/* ─── UTILITIES ──────────────────────────────────────────────────────── */
function genId() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function fmt(d) {
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
function p2(n) { return String(n).padStart(2, '0'); }
function fmtNum(n) {
    const a = Math.abs(n);
    return a % 1 === 0
        ? a.toLocaleString('en-US')
        : a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function normalizeAmt(amount, direction) {
    if (direction === 'NT') return 0;
    return direction === 'SL' ? -Math.abs(amount) : Math.abs(amount);
}
function signed(n) { return `${n >= 0 ? '+' : '-'}$${fmtNum(n)}`; }
function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function countLabel(n) { return n === 1 ? t('pnl_1_trade', '1 trade') : t('pnl_n_trades', `${n} trades`).replace('{n}', n); }

function getDayAgg(dateStr) {
    const trades = data[dateStr] || [];
    const hasNTOnly = trades.length > 0 && trades.every(t => t.direction === 'NT');
    return { total: trades.reduce((s, t) => s + t.amount, 0), count: trades.length, hasNTOnly };
}

/* ─── HEATMAP COLOR ──────────────────────────────────────────────────── */
function getPnLBg(total, hasNTOnly = false) {
    // NT (No Trade) days get a strong gold tint (matching month-label)
    if (hasNTOnly) {
        const theme = pnlHtmlEl.getAttribute('data-theme') || 'dark';
        if (theme === 'light') {
            return 'hsl(42, 45%, 82%)';
        }
        return 'hsl(42, 50%, 18%)';
    }
    if (!total) return null;
    const hue = total > 0 ? 138 : 0;
    // Fixed intensity — all green tiles same shade, all red tiles same shade
    const intensity = 0.45;
    const theme = pnlHtmlEl.getAttribute('data-theme') || 'dark';
    if (theme === 'light') {
        return `hsl(${hue},${55 + intensity * 25}%,${92 - intensity * 18}%)`;
    }
    return `hsl(${hue},${42 + intensity * 38}%,${9 + intensity * 17}%)`;
}

/* ─── CALENDAR ───────────────────────────────────────────────────────── */
function renderCalendar() {
    const grid = document.getElementById('calGrid');
    const lbl = document.getElementById('monthLabel');
    if (!grid || !lbl) return;
    lbl.textContent = `${getMonthNames()[viewMonth]} ${viewYear}`;

    const firstDay = new Date(viewYear, viewMonth, 1);
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todayStr = fmt(today);
    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;

    let html = '';
    for (let i = 0; i < startDow; i++)
        html += outsideTile(new Date(viewYear, viewMonth, -startDow + i + 1));

    for (let d = 1; d <= totalDays; d++) {
        const date = new Date(viewYear, viewMonth, d);
        const dateStr = fmt(date);
        const dow = date.getDay();
        const { total, count, hasNTOnly } = getDayAgg(dateStr);
        const hasData = count > 0;
        const bg = hasData ? getPnLBg(total, hasNTOnly) : null;

        let cls = 'pnl-day-tile';
        if (dow === 0 || dow === 6) cls += ' weekend';
        if (dateStr === todayStr) cls += ' today';
        if (hasData) cls += hasNTOnly ? ' has-neutral' : (total > 0 ? ' has-tp' : total < 0 ? ' has-sl' : ' has-neutral');

        const style = bg ? ` style="background:${bg};"` : '';
        const aria = hasData ? `${dateStr}: ${signed(total)}, ${countLabel(count)}` : dateStr;

        html += `<div class="${cls}" data-date="${dateStr}" role="gridcell" tabindex="0" aria-label="${aria}"${style}>
            <span class="tile-day-num">${d}</span>
            ${hasData ? `<span class="tile-amount">${signed(total)}</span><span class="tile-count">${countLabel(count)}</span>` : ''}
        </div>`;
    }

    const trail = (startDow + totalDays) % 7;
    for (let i = 1; i <= (trail === 0 ? 0 : 7 - trail); i++)
        html += outsideTile(new Date(viewYear, viewMonth + 1, i));

    grid.innerHTML = html;
    grid.querySelectorAll('.pnl-day-tile:not(.outside-month)').forEach(el => {
        el.addEventListener('click', () => openDayDetail(el.dataset.date));
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDayDetail(el.dataset.date); }
        });
    });

    updateSummary();
    updateEmptyState();
}

function outsideTile(date) {
    return `<div class="pnl-day-tile outside-month" data-date="${fmt(date)}">
        <span class="tile-day-num">${date.getDate()}</span></div>`;
}

// Refresh only a single tile (after edit/delete) without full re-render
function refreshTile(dateStr) {
    const el = document.querySelector(`.pnl-day-tile[data-date="${dateStr}"]`);
    if (!el || el.classList.contains('outside-month')) return;
    const { total, count, hasNTOnly } = getDayAgg(dateStr);
    const hasData = count > 0;
    const bg = hasData ? getPnLBg(total, hasNTOnly) : null;

    el.classList.remove('has-tp', 'has-sl', 'has-neutral');
    if (hasData) el.classList.add(hasNTOnly ? 'has-neutral' : (total > 0 ? 'has-tp' : total < 0 ? 'has-sl' : 'has-neutral'));
    el.style.background = bg || '';
    el.setAttribute('aria-label', hasData ? `${dateStr}: ${signed(total)}, ${countLabel(count)}` : dateStr);

    const dayNum = el.querySelector('.tile-day-num');
    el.innerHTML = '';
    el.appendChild(dayNum);
    if (hasData)
        el.innerHTML += `<span class="tile-amount">${signed(total)}</span><span class="tile-count">${countLabel(count)}</span>`;
}

/* ─── DAY DETAIL PANEL ───────────────────────────────────────────────── */
function openDayDetail(dateStr) {
    // Empty day → go straight to Add Trade (no drawer needed)
    const { count } = getDayAgg(dateStr);
    if (count === 0) {
        openAddTrade(dateStr);
        return;
    }

    // Day has trades → open the drawer
    detailDate = dateStr;
    const date = new Date(dateStr + 'T00:00:00');
    document.getElementById('detailDayName').textContent = getDayNames()[(date.getDay() + 6) % 7];
    document.getElementById('detailDateLabel').textContent = `${getMonthNames()[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    renderDetailSummary();
    renderTradeList();
    const ov = document.getElementById('dayDetailOverlay');
    ov.classList.add('open');
    ov.setAttribute('aria-hidden', 'false');
    document.getElementById('detailAddBtn').focus();
}

function closeDayDetail() {
    detailDate = null;
    const ov = document.getElementById('dayDetailOverlay');
    ov.classList.remove('open');
    ov.setAttribute('aria-hidden', 'true');
}

function renderDetailSummary() {
    if (!detailDate) return;
    const { total, count } = getDayAgg(detailDate);
    const pnlEl = document.getElementById('detailTotalPnl');
    pnlEl.textContent = count > 0 ? signed(total) : '—';
    pnlEl.className = 'detail-chip-value' + (count > 0 ? (total >= 0 ? ' positive' : ' negative') : '');
    document.getElementById('detailTradeCount').textContent = count;
}

function renderTradeList() {
    if (!detailDate) return;
    const trades = (data[detailDate] || []).slice().reverse(); // newest first
    const list = document.getElementById('tradeList');
    const empty = document.getElementById('detailEmpty');
    empty.style.display = trades.length === 0 ? 'flex' : 'none';
    list.innerHTML = trades.map(t => tradeRowHTML(t)).join('');

    list.querySelectorAll('.trade-thumbnail').forEach(img =>
        img.addEventListener('click', () => openLightbox(img.src)));
    list.querySelectorAll('[data-action="show-edit-confirm"]').forEach(btn =>
        btn.addEventListener('click', () => showTradeEditConfirm(btn.dataset.id)));
    list.querySelectorAll('[data-action="edit-cancel"]').forEach(btn =>
        btn.addEventListener('click', () => hideTradeEditConfirm(btn.dataset.id)));
    list.querySelectorAll('[data-action="edit-confirm"]').forEach(btn =>
        btn.addEventListener('click', () => { hideTradeEditConfirm(btn.dataset.id); openEditTrade(btn.dataset.date, btn.dataset.id); }));
    list.querySelectorAll('[data-action="delete"]').forEach(btn =>
        btn.addEventListener('click', () => showTradeDeleteConfirm(btn.dataset.id)));
    list.querySelectorAll('[data-action="del-cancel"]').forEach(btn =>
        btn.addEventListener('click', () => hideTradeDeleteConfirm(btn.dataset.id)));
    list.querySelectorAll('[data-action="del-confirm"]').forEach(btn =>
        btn.addEventListener('click', () => execDeleteTrade(btn.dataset.date, btn.dataset.id)));
}

function tradeRowHTML(t) {
    const isTP = t.direction === 'TP';
    const isNT = t.direction === 'NT';
    const amountClass = isNT ? 'neutral' : (isTP ? 'positive' : 'negative');
    const badgeClass = isNT ? 'badge-nt' : (isTP ? 'badge-tp' : 'badge-sl');
    const timeH = t.executionTime
        ? `<span class="trade-meta-pill"><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.3"/><path d="M6 3.5V6l1.5 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>${t.executionTime}</span>` : '';
    const noteH = t.note ? `<p class="trade-note">${esc(t.note)}</p>` : '';
    const thumbH = t.screenshotB64
        ? `<div class="trade-thumb-wrap"><img class="trade-thumbnail" src="${t.screenshotB64}" alt="Trade chart screenshot" /></div>` : '';

    return `<div class="trade-row" role="listitem" data-trade-id="${t.id}">
        <div class="trade-row-main">
            <div class="trade-row-left">
                <span class="trade-amount ${amountClass}">${isNT ? '$0' : signed(t.amount)}</span>
                <span class="trade-badge ${badgeClass}">${t.direction}</span>
                ${timeH}
            </div>
            <div class="trade-row-actions">
                <button class="icon-btn" data-action="show-edit-confirm" data-id="${t.id}" data-date="${t.date}" aria-label="Edit trade">
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button class="icon-btn icon-btn--danger" data-action="delete" data-id="${t.id}" data-date="${t.date}" aria-label="Delete trade">
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M12 3.5l-.75 8a1 1 0 0 1-1 .875H3.75a1 1 0 0 1-1-.875L2 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
            </div>
        </div>
        ${noteH}${thumbH}
        <div class="trade-edit-confirm" id="tec_${t.id}" style="display:none;">
            <span>Edit this trade?</span>
            <button class="btn btn-ghost btn--xs" data-action="edit-cancel" data-id="${t.id}">Cancel</button>
            <button class="btn btn--xs btn--confirm-edit" data-action="edit-confirm" data-id="${t.id}" data-date="${t.date}">Edit</button>
        </div>
        <div class="trade-del-confirm" id="tdc_${t.id}" style="display:none;">
            <span>Delete this trade?</span>
            <button class="btn btn-ghost btn--xs" data-action="del-cancel" data-id="${t.id}">Cancel</button>
            <button class="btn btn--xs btn--danger" data-action="del-confirm" data-id="${t.id}" data-date="${t.date}">Delete</button>
        </div>
    </div>`;
}

function showTradeEditConfirm(tradeId) {
    document.querySelectorAll('.trade-edit-confirm, .trade-del-confirm').forEach(el => el.style.display = 'none');
    const el = document.getElementById(`tec_${tradeId}`);
    if (el) { el.style.display = 'flex'; el.scrollIntoView({ block: 'nearest' }); }
}

function hideTradeEditConfirm(tradeId) {
    const el = document.getElementById(`tec_${tradeId}`);
    if (el) el.style.display = 'none';
}

function showTradeDeleteConfirm(tradeId) {
    document.querySelectorAll('.trade-edit-confirm, .trade-del-confirm').forEach(el => el.style.display = 'none');
    const el = document.getElementById(`tdc_${tradeId}`);
    if (el) { el.style.display = 'flex'; el.scrollIntoView({ block: 'nearest' }); }
}

function hideTradeDeleteConfirm(tradeId) {
    const el = document.getElementById(`tdc_${tradeId}`);
    if (el) el.style.display = 'none';
}

function execDeleteTrade(dateStr, tradeId) {
    const trades = data[dateStr] || [];
    const idx = trades.findIndex(t => t.id === tradeId);
    if (idx === -1) return;
    const backup = [...trades];
    try {
        trades.splice(idx, 1);
        if (trades.length === 0) delete data[dateStr]; else data[dateStr] = trades;
        saveData();
        renderTradeList();
        renderDetailSummary();
        refreshTile(dateStr);
        updateSummary();
        updateEmptyState();
        showToast('Trade deleted');
    } catch {
        data[dateStr] = backup;
        showToast('Failed to delete. Try again.', 'error');
    }
}

/* ─── ADD / EDIT TRADE MODAL ─────────────────────────────────────────── */
function openAddTrade(dateStr) {
    tradeModalDate = dateStr; editTradeId = null; pendingScreenB64 = null;
    const date = new Date(dateStr + 'T00:00:00');
    document.getElementById('tradeModalDayLabel').textContent = getDayNames()[(date.getDay() + 6) % 7];
    document.getElementById('tradeModalTitle').textContent = t('pnl_add_trade', 'Add Trade');
    document.getElementById('amountInput').value = '';
    document.getElementById('execTimeInput').value = '';
    document.getElementById('noteInput').value = '';
    document.getElementById('validationMsg').textContent = '';
    document.getElementById('screenshotInput').value = '';
    resetScreenPreview();
    setDir('TP');
    openTradeModal();
}

function openEditTrade(dateStr, tradeId) {
    const trades = data[dateStr] || [];
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return;
    tradeModalDate = dateStr; editTradeId = tradeId;
    pendingScreenB64 = trade.screenshotB64 || null;

    // Close the drawer first so the edit modal is the only thing visible
    closeDayDetail();

    const date = new Date(dateStr + 'T00:00:00');
    document.getElementById('tradeModalDayLabel').textContent = getDayNames()[(date.getDay() + 6) % 7];
    document.getElementById('tradeModalTitle').textContent = t('pnl_edit_trade', 'Edit Trade');
    document.getElementById('amountInput').value = Math.abs(trade.amount);
    document.getElementById('execTimeInput').value = trade.executionTime || '';
    document.getElementById('noteInput').value = trade.note || '';
    document.getElementById('validationMsg').textContent = '';
    document.getElementById('screenshotInput').value = '';
    setDir(trade.direction);
    trade.screenshotB64 ? showScreenPreview(trade.screenshotB64) : resetScreenPreview();
    openTradeModal();
}

function openTradeModal() {
    const ov = document.getElementById('tradeModalOverlay');
    ov.classList.add('open'); ov.setAttribute('aria-hidden', 'false');
    setTimeout(() => document.getElementById('amountInput').focus(), 80);
}

function closeTradeModal() {
    const ov = document.getElementById('tradeModalOverlay');
    ov.classList.remove('open'); ov.setAttribute('aria-hidden', 'true');
    tradeModalDate = null; editTradeId = null; pendingScreenB64 = null;
}

function setDir(dir) {
    selDirection = dir;
    ['TP', 'SL', 'NT'].forEach(t => {
        const btn = document.getElementById(`${t.toLowerCase()}Btn`);
        if (btn) {
            btn.classList.toggle('active', t === dir);
            btn.setAttribute('aria-pressed', String(t === dir));
        }
    });
    // If NT selected, set amount to 0 and disable input
    const amountInput = document.getElementById('amountInput');
    if (dir === 'NT') {
        amountInput.value = '0';
        amountInput.disabled = true;
    } else {
        amountInput.disabled = false;
    }
}

function saveTrade() {
    const raw = parseFloat(document.getElementById('amountInput').value);
    const msg = document.getElementById('validationMsg');
    // Allow 0 for NT (No Trade Day), require positive for TP/SL
    if (selDirection === 'NT') {
        // NT always saves as 0
    } else if (isNaN(raw) || raw <= 0) {
        msg.textContent = t('pnl_valid_amount', 'Enter a valid amount.');
        document.getElementById('amountInput').focus(); return;
    }
    msg.textContent = '';
    const amount = normalizeAmt(selDirection === 'NT' ? 0 : raw, selDirection);
    const now = new Date().toISOString();
    const execT = document.getElementById('execTimeInput').value || null;
    const note = document.getElementById('noteInput').value.trim() || null;

    if (editTradeId) {
        const trades = data[tradeModalDate] || [];
        const idx = trades.findIndex(t => t.id === editTradeId);
        if (idx === -1) return;
        trades[idx] = {
            id: trades[idx].id,
            date: trades[idx].date || tradeModalDate,
            amount,
            direction: selDirection,
            executionTime: execT,
            note,
            screenshotB64: pendingScreenB64,
            createdAt: trades[idx].createdAt || now,
            updatedAt: now,
        };
        data[tradeModalDate] = trades;
        showToast(`Trade updated — ${signed(amount)} ${selDirection}`);
    } else {
        const trade = {
            id: genId(),
            date: tradeModalDate,
            amount,
            direction: selDirection,
            executionTime: execT,
            note,
            screenshotB64: pendingScreenB64,
            createdAt: now,
            updatedAt: now,
        };
        data[tradeModalDate] = [...(data[tradeModalDate] || []), trade];
        showToast(`Trade saved — ${signed(amount)} ${selDirection}`);
    }

    saveData();
    const savedDate = tradeModalDate;
    closeTradeModal();
    if (detailDate === savedDate) { renderTradeList(); renderDetailSummary(); }
    refreshTile(savedDate);
    updateSummary();
    updateEmptyState();
}

/* ─── SCREENSHOT HANDLING ────────────────────────────────────────────── */
async function handleScreenUpload(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        showToast('Use JPG, PNG, or WEBP only.', 'error'); return;
    }
    try {
        // Store original file at full quality via FileReader (no compression)
        const b64 = await readFileAsDataURL(file);
        pendingScreenB64 = b64;
        showScreenPreview(b64);
    } catch { showToast('Failed to process image.', 'error'); }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function showScreenPreview(b64) {
    document.getElementById('screenshotPlaceholder').style.display = 'none';
    const wrap = document.getElementById('screenshotPreviewWrap');
    wrap.style.display = 'flex';
    document.getElementById('screenshotPreview').src = b64;
}

function resetScreenPreview() {
    pendingScreenB64 = null;
    document.getElementById('screenshotPlaceholder').style.display = 'flex';
    document.getElementById('screenshotPreviewWrap').style.display = 'none';
    document.getElementById('screenshotPreview').src = '';
    document.getElementById('screenshotInput').value = '';
}

/* ─── IMAGE VIEWER (new tab) ────────────────────────────────────────── */
function openImageInNewTab(src) {
    const win = window.open('', '_blank');
    if (!win) { showToast('Allow pop-ups to view screenshots.', 'error'); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Trade Screenshot — ALTIVOR</title>
<style>*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;display:flex;align-items:center;justify-content:center;min-height:100vh;cursor:zoom-out;}
img{max-width:100%;max-height:100vh;object-fit:contain;border-radius:6px;box-shadow:0 20px 80px rgba(0,0,0,.8);}
</style></head><body><img src="${src}" onclick="window.close()"></body></html>`);
    win.document.close();
}

/* ─── SUMMARY ────────────────────────────────────────────────────────── */
function updateSummary() {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    let monthTotal = 0, tradeDays = 0, wins = 0, best = null, worst = null;
    for (let d = 1; d <= daysInMonth; d++) {
        const { total, count, hasNTOnly } = getDayAgg(fmt(new Date(viewYear, viewMonth, d)));
        if (!count) continue;
        // NT-only days don't count toward win rate (no actual trades)
        if (!hasNTOnly) {
            tradeDays++; monthTotal += total;
            if (total > 0) wins++;
            if (best === null || total > best) best = total;
            if (worst === null || total < worst) worst = total;
        }
    }
    setStat('summaryMonthly', monthTotal, tradeDays > 0);
    setStat('summaryBest', best, best !== null);
    setStat('summaryWorst', worst, worst !== null);

    const wr = document.getElementById('summaryWinRate');
    if (tradeDays > 0) {
        const pct = Math.round(wins / tradeDays * 100);
        wr.textContent = `${pct}%`;
        wr.className = 'summary-card-value ' + (pct >= 50 ? 'positive' : 'negative');
    } else { wr.textContent = '—'; wr.className = 'summary-card-value'; }

    // Weekly
    let wkTotal = 0, wkDays = 0;
    const wkStart = new Date(today);
    wkStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    for (let i = 0; i < 7; i++) {
        const d = new Date(wkStart); d.setDate(wkStart.getDate() + i);
        const { total, count } = getDayAgg(fmt(d));
        if (count) { wkTotal += total; wkDays++; }
    }
    const wk = document.getElementById('summaryWeekly');
    if (wkDays > 0) {
        wk.textContent = signed(wkTotal);
        wk.className = 'summary-card-value ' + (wkTotal >= 0 ? 'positive' : 'negative');
    } else { wk.textContent = '$0'; wk.className = 'summary-card-value'; }

    // Overall PnL
    const allDates = Object.keys(data).sort();
    let overallTotal = 0, overallCount = 0;
    for (let i = 0; i < allDates.length; i++) {
        const { total, count } = getDayAgg(allDates[i]);
        if (!count) continue;
        overallTotal += total;
        overallCount++;
    }
    const ov = document.getElementById('summaryOverall');
    const ovLabel = document.getElementById('summaryOverallLabel');
    if (overallCount > 0) {
        ov.textContent = signed(overallTotal);
        ov.className = 'summary-card-value ' + (overallTotal >= 0 ? 'positive' : 'negative');
        const firstDate = allDates.find(d => { const { count } = getDayAgg(d); return count > 0; });
        if (firstDate && ovLabel) {
            const parts = firstDate.split('-');
            const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
            const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            ovLabel.textContent = `Overall PnL · since ${label}`;
        }
    } else {
        ov.textContent = '—';
        ov.className = 'summary-card-value';
        if (ovLabel) ovLabel.textContent = 'Overall PnL';
    }

    updateChallengeSummary();
}

function setStat(id, val, hasData) {
    const el = document.getElementById(id);
    if (!hasData || val === null) { el.textContent = '—'; el.className = 'summary-card-value'; return; }
    el.textContent = signed(val);
    el.className = 'summary-card-value ' + (val >= 0 ? 'positive' : 'negative');
}

function updateEmptyState() {
    const el = document.getElementById('emptyState');
    if (el) el.classList.toggle('visible', Object.keys(data).length === 0);
}

/* ─── MONTHLY TARGET CONFIG ──────────────────────────────────────────── */
function getMonthKey(year, month) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function loadMonthlyCfg(year, month) {
    try {
        const all = JSON.parse(localStorage.getItem(MONTHLY_CFG_KEY)) || {};
        return all[getMonthKey(year, month)] || {};
    } catch { return {}; }
}

function saveMonthlyCfg(year, month, cfg) {
    try {
        const all = JSON.parse(localStorage.getItem(MONTHLY_CFG_KEY)) || {};
        all[getMonthKey(year, month)] = cfg;
        localStorage.setItem(MONTHLY_CFG_KEY, JSON.stringify(all));
    } catch { }
}

function loadKeepCfg() {
    try { return JSON.parse(localStorage.getItem(KEEP_CFG_KEY)) || {}; } catch { return {}; }
}

function saveKeepCfg(cfg) {
    try { localStorage.setItem(KEEP_CFG_KEY, JSON.stringify(cfg)); } catch { }
}

// Get effective config for current view month (applies keep logic)
function getEffectiveMonthCfg() {
    const cfg = loadMonthlyCfg(viewYear, viewMonth);
    const keep = loadKeepCfg();
    
    // If no config for this month, check if we should inherit from keep values
    if (!cfg.equity && keep.keepEquity && keep.equity) cfg.equity = keep.equity;
    if (!cfg.goalValue && keep.keepTarget && keep.goalValue) cfg.goalValue = keep.goalValue;
    if (!cfg.maxDDLimit && keep.keepMaxDD && keep.maxDDLimit) cfg.maxDDLimit = keep.maxDDLimit;
    
    // Track max DD from previous months if keepMaxDD is on
    if (keep.keepMaxDD && keep.historicalMaxDD) {
        cfg.historicalMaxDD = keep.historicalMaxDD;
    }
    
    return cfg;
}

// Legacy support
function loadChallengeCfg() {
    return getEffectiveMonthCfg();
}
function saveChallengeCfg(cfg) {
    saveMonthlyCfg(viewYear, viewMonth, cfg);
}

/* ─── MONTHLY TARGET SUMMARY ─────────────────────────────────────────── */
function computeMetrics() {
    const cfg = loadChallengeCfg();
    const startingEquity = parseFloat(cfg.equity) || 0;
    const goalType = cfg.goalType || 'percent';
    const goalValue = parseFloat(cfg.goalValue != null ? cfg.goalValue : cfg.targetPct) || 0;
    const maxDDLimit = parseFloat(cfg.maxDDLimit) || 0;
    const historicalMaxDD = parseFloat(cfg.historicalMaxDD) || 0;

    // Filter trades for current view month only
    const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    const monthEnd = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01`;

    const monthTrades = [];
    for (const dateStr of Object.keys(data).sort()) {
        if (dateStr >= monthStart && dateStr < monthEnd) {
            const trades = data[dateStr] || [];
            for (const t of trades) {
                if (t.direction !== 'NT') { // Exclude NT from metrics
                    monthTrades.push({ pnlUsd: t.amount, createdAt: t.createdAt || dateStr, dateStr });
                }
            }
        }
    }
    monthTrades.sort((a, b) => {
        if (a.createdAt < b.createdAt) return -1;
        if (a.createdAt > b.createdAt) return 1;
        return 0;
    });

    const hasTrades = monthTrades.length > 0;

    if (!hasTrades) {
        return {
            startingEquity,
            finalEquity: startingEquity,
            resultUsd: 0,
            resultPct: 0,
            currentDrawdownUsd: 0,
            currentDrawdownPct: 0,
            maxDrawdownUsd: 0,
            maxDrawdownPct: 0,
            streakType: 'NONE',
            streakLength: 0,
            toGoalUsd: null,
            toGoalPct: null,
            goalValue,
            goalType,
            maxDDLimit,
            hasConfig: startingEquity > 0,
            hasTrades: false,
        };
    }

    // Build equity curve per the spec
    let equity = startingEquity;
    let peak = startingEquity;
    let peakEver = startingEquity;
    let currentDDUsd = 0;
    let maxDDUsd = 0;

    for (const t of monthTrades) {
        equity = equity + t.pnlUsd;
        if (equity > peak) peak = equity;
        if (peak > peakEver) peakEver = peak;
        const dd = peak - equity;
        currentDDUsd = dd;
        if (dd > maxDDUsd) maxDDUsd = dd;
    }

    const finalEquity = equity;
    const resultUsd = finalEquity - startingEquity;
    const resultPct = startingEquity > 0 ? (resultUsd / startingEquity) * 100 : 0;

    const currentDrawdownUsd = currentDDUsd;
    const currentDrawdownPct = peak > 0 ? (currentDDUsd / peak) * 100 : 0;
    let maxDrawdownUsd = maxDDUsd;
    let maxDrawdownPct = peakEver > 0 ? (maxDDUsd / peakEver) * 100 : 0;
    
    // Check if historical max DD (from previous months with keepMaxDD) is worse
    const ddBreachedByHistory = historicalMaxDD > 0 && maxDrawdownPct < historicalMaxDD;
    if (ddBreachedByHistory) {
        // Use historical max DD as the effective max DD for breach check
        maxDrawdownPct = Math.max(maxDrawdownPct, historicalMaxDD);
    }

    // Streak: per individual trade, from the end
    let streakLength = 0;
    let streakType = 'NONE';
    for (let i = monthTrades.length - 1; i >= 0; i--) {
        const pnl = monthTrades[i].pnlUsd;
        if (pnl === 0) continue;
        const isWin = pnl > 0;
        if (streakType === 'NONE') {
            streakType = isWin ? 'WIN' : 'LOSS';
            streakLength = 1;
        } else if ((isWin && streakType === 'WIN') || (!isWin && streakType === 'LOSS')) {
            streakLength++;
        } else {
            break;
        }
    }

    // To Goal
    let toGoalUsd = null;
    let toGoalPct = null;
    if (startingEquity > 0 && goalValue > 0) {
        const targetEquity = goalType === 'absolute'
            ? startingEquity + goalValue
            : startingEquity * (1 + goalValue / 100);
        toGoalUsd = Math.max(0, targetEquity - finalEquity);
        toGoalPct = startingEquity > 0 ? (toGoalUsd / startingEquity) * 100 : 0;
    }

    return {
        startingEquity,
        finalEquity,
        resultUsd,
        resultPct,
        currentDrawdownUsd,
        currentDrawdownPct,
        maxDrawdownUsd,
        maxDrawdownPct,
        streakType,
        streakLength,
        toGoalUsd,
        toGoalPct,
        goalValue,
        goalType,
        maxDDLimit,
        hasConfig: startingEquity > 0,
        hasTrades: true,
    };
}

function updateChallengeSummary() {
    const m = computeMetrics();

    // Helper to set a metric value
    function setMetric(id, text, cls) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        el.className = 'challenge-metric-value ' + (cls || 'neutral');
    }

    // Challenge status
    const ddBreached = m.hasConfig && m.maxDDLimit > 0 && m.maxDrawdownPct >= m.maxDDLimit;
    const goalReached = m.hasConfig && m.toGoalUsd !== null && m.toGoalUsd <= 0;

    let statusKey = 'no-data';
    let statusText = 'No Data';
    if (!m.hasConfig) { statusKey = 'no-data'; statusText = 'Setup Required'; }
    else if (!m.hasTrades) { statusKey = 'no-data'; statusText = 'Challenge Ready'; }
    else if (ddBreached) { statusKey = 'breached'; statusText = 'DD Limit Breached'; }
    else if (goalReached) { statusKey = 'active'; statusText = 'Target Reached'; }
    else { statusKey = 'active'; statusText = 'Challenge Active'; }

    const panel = document.getElementById('challengePanel');
    if (panel) {
        panel.classList.remove('status-active', 'status-breached');
        if (statusKey === 'active') panel.classList.add('status-active');
        if (statusKey === 'breached') panel.classList.add('status-breached');
    }
    const dot = document.getElementById('challengeStatusDot');
    if (dot) dot.className = 'challenge-status-dot ' + statusKey;
    const lbl = document.getElementById('challengeStatusLabel');
    if (lbl) lbl.textContent = statusText;

    // RESULT
    if (m.hasTrades) {
        const cls = m.resultUsd > 0 ? 'positive' : m.resultUsd < 0 ? 'negative' : 'neutral';
        if (m.hasConfig) {
            setMetric('cmResult', (m.resultPct >= 0 ? '+' : '') + m.resultPct.toFixed(2) + '%', cls);
        } else {
            setMetric('cmResult', signed(m.resultUsd), cls);
        }
    } else {
        setMetric('cmResult', '—', 'neutral');
    }

    // CURRENT DD
    if (m.hasTrades && m.hasConfig) {
        if (m.currentDrawdownUsd === 0) {
            setMetric('cmCurrentDD', '0.00%', 'positive');
        } else {
            const cls = m.currentDrawdownPct >= m.maxDDLimit && m.maxDDLimit > 0 ? 'negative' : 'warning';
            setMetric('cmCurrentDD', '-' + m.currentDrawdownPct.toFixed(2) + '%', cls);
        }
    } else if (m.hasTrades) {
        const cls = m.currentDrawdownUsd === 0 ? 'positive' : 'warning';
        setMetric('cmCurrentDD', m.currentDrawdownUsd === 0 ? '$0' : '-' + signed(m.currentDrawdownUsd).slice(1), cls);
    } else {
        setMetric('cmCurrentDD', '—', 'neutral');
    }

    // MAX DD
    if (m.hasTrades && m.hasConfig) {
        if (m.maxDrawdownUsd === 0) {
            setMetric('cmMaxDD', '0.00%', 'positive');
        } else {
            const cls = m.maxDrawdownPct >= m.maxDDLimit && m.maxDDLimit > 0 ? 'negative' : 'warning';
            setMetric('cmMaxDD', '-' + m.maxDrawdownPct.toFixed(2) + '%', cls);
        }
    } else if (m.hasTrades) {
        const cls = m.maxDrawdownUsd === 0 ? 'positive' : 'warning';
        setMetric('cmMaxDD', m.maxDrawdownUsd === 0 ? '$0' : '-$' + fmtNum(m.maxDrawdownUsd), cls);
    } else {
        setMetric('cmMaxDD', '—', 'neutral');
    }

    // STREAK
    if (m.streakType !== 'NONE' && m.streakLength > 0) {
        const cls = m.streakType === 'WIN' ? 'positive' : 'negative';
        const prefix = m.streakType === 'WIN' ? 'W' : 'L';
        setMetric('cmStreak', prefix + m.streakLength, cls);
    } else {
        setMetric('cmStreak', '—', 'neutral');
    }

    // TO GOAL
    if (m.toGoalUsd !== null) {
        if (m.toGoalUsd <= 0) {
            setMetric('cmToGoal', 'Done ✓', 'positive');
        } else {
            const cls = m.toGoalPct > m.goalValue / 2 ? 'neutral' : 'warning';
            if (m.hasConfig) {
                setMetric('cmToGoal', '+' + m.toGoalPct.toFixed(2) + '%', cls);
            } else {
                setMetric('cmToGoal', '+$' + fmtNum(m.toGoalUsd), cls);
            }
        }
    } else if (m.hasConfig && m.goalValue > 0) {
        const display = m.goalType === 'absolute'
            ? '+$' + fmtNum(m.goalValue)
            : '+' + m.goalValue.toFixed(2) + '%';
        setMetric('cmToGoal', display, 'neutral');
    } else {
        setMetric('cmToGoal', '—', 'neutral');
    }
}

/* ─── MONTHLY TARGET SETUP PANEL ─────────────────────────────────────── */
function initChallengePanel() {
    const toggle = document.getElementById('challengeSetupToggle');
    const form = document.getElementById('challengeSetupForm');
    const saveBtn = document.getElementById('challengeSetupSave');
    if (!toggle || !form || !saveBtn) return;

    populateChallengeForm();

    toggle.addEventListener('click', () => {
        const open = form.style.display === 'none' || form.style.display === '';
        form.style.display = open ? 'block' : 'none';
        toggle.setAttribute('aria-expanded', String(open));
    });

    saveBtn.addEventListener('click', saveChallengeConfig);
}

function populateChallengeForm() {
    const cfg = loadChallengeCfg();
    const keep = loadKeepCfg();
    
    const eq = document.getElementById('challengeEquity');
    const tgt = document.getElementById('challengeTarget');
    const mdd = document.getElementById('challengeMaxDD');
    const keepEq = document.getElementById('keepEquity');
    const keepTgt = document.getElementById('keepTarget');
    const keepMdd = document.getElementById('keepMaxDD');
    
    if (eq && cfg.equity) eq.value = cfg.equity;
    const savedGoal = cfg.goalValue != null ? cfg.goalValue : (cfg.targetPct || '');
    if (tgt && savedGoal) tgt.value = savedGoal;
    if (mdd && cfg.maxDDLimit) mdd.value = cfg.maxDDLimit;
    
    // Populate keep checkboxes
    if (keepEq) keepEq.checked = !!keep.keepEquity;
    if (keepTgt) keepTgt.checked = !!keep.keepTarget;
    if (keepMdd) keepMdd.checked = !!keep.keepMaxDD;
}

function saveChallengeConfig() {
    const equity = parseFloat(document.getElementById('challengeEquity').value);
    const goalValue = parseFloat(document.getElementById('challengeTarget').value);
    const maxDDLimit = parseFloat(document.getElementById('challengeMaxDD').value);
    const keepEquity = document.getElementById('keepEquity')?.checked || false;
    const keepTarget = document.getElementById('keepTarget')?.checked || false;
    const keepMaxDD = document.getElementById('keepMaxDD')?.checked || false;
    
    if (!equity || equity <= 0) {
        showToast('Enter a valid starting equity.', 'error'); return;
    }
    
    // Save monthly config
    const monthCfg = {
        equity,
        goalType: 'percent',
        goalValue: goalValue || 0,
        targetPct: goalValue || 0,
        maxDDLimit: maxDDLimit || 0,
    };
    saveMonthlyCfg(viewYear, viewMonth, monthCfg);
    
    // Save keep preferences and values for future months
    const keepCfg = {
        keepEquity,
        keepTarget,
        keepMaxDD,
        equity: equity || 0,
        goalValue: goalValue || 0,
        maxDDLimit: maxDDLimit || 0,
    };
    
    // If keepMaxDD is on, track the max DD from this month for future comparison
    if (keepMaxDD) {
        const m = computeMetrics();
        const currentKeep = loadKeepCfg();
        keepCfg.historicalMaxDD = Math.max(m.maxDrawdownPct, currentKeep.historicalMaxDD || 0);
    }
    
    saveKeepCfg(keepCfg);
    
    const form = document.getElementById('challengeSetupForm');
    const toggle = document.getElementById('challengeSetupToggle');
    if (form) form.style.display = 'none';
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    
    updateChallengeSummary();
    showToast('Monthly target saved.');
}

/* ─── TOAST ──────────────────────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, type = 'success') {
    let t = document.getElementById('pnl-toast');
    if (!t) { t = document.createElement('div'); t.id = 'pnl-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = `pnl-toast pnl-toast--${type} show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ─── MONTH NAV ──────────────────────────────────────────────────────── */
function prevMonth() { if (viewMonth === 0) { viewMonth = 11; viewYear--; } else viewMonth--; renderCalendar(); populateChallengeForm(); }
function nextMonth() { if (viewMonth === 11) { viewMonth = 0; viewYear++; } else viewMonth++; renderCalendar(); populateChallengeForm(); }

/* ─── THEME ──────────────────────────────────────────────────────────── */
function applyTheme(theme) {
    pnlHtmlEl.setAttribute('data-theme', theme);
    localStorage.setItem(PNL_THEME_KEY, theme);
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
    renderCalendar();
}

/* ─── EVENT BINDINGS ──────────────────────────────────────────────────── */
document.getElementById('prevMonth').addEventListener('click', prevMonth);
document.getElementById('nextMonth').addEventListener('click', nextMonth);

// Day detail
document.getElementById('detailCloseBtn').addEventListener('click', closeDayDetail);
document.getElementById('dayDetailOverlay').addEventListener('click', e => { if (e.target.id === 'dayDetailOverlay') closeDayDetail(); });
document.getElementById('detailAddBtn').addEventListener('click', () => { if (detailDate) { const d = detailDate; closeDayDetail(); openAddTrade(d); } });

// Trade modal
document.getElementById('tradeModalClose').addEventListener('click', closeTradeModal);
document.getElementById('tradeModalCancel').addEventListener('click', closeTradeModal);
document.getElementById('tradeModalOverlay').addEventListener('click', e => { if (e.target.id === 'tradeModalOverlay') closeTradeModal(); });
document.getElementById('tpBtn').addEventListener('click', () => setDir('TP'));
document.getElementById('slBtn').addEventListener('click', () => setDir('SL'));
document.getElementById('ntBtn').addEventListener('click', () => setDir('NT'));
document.getElementById('tradeModalDone').addEventListener('click', saveTrade);
document.getElementById('amountInput').addEventListener('keydown', e => { if (e.key === 'Enter') saveTrade(); });

// Time input auto-format (HH:MM)
(function() {
    const ti = document.getElementById('execTimeInput');
    ti.addEventListener('input', function() {
        let v = this.value.replace(/[^\d]/g, '').slice(0, 4);
        if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2);
        this.value = v;
    });
    ti.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') saveTrade();
    });
})();

// Screenshot
document.getElementById('screenshotInput').addEventListener('change', e => { if (e.target.files[0]) handleScreenUpload(e.target.files[0]); });
const uploadArea = document.getElementById('screenshotUploadArea');
uploadArea.addEventListener('click', () => document.getElementById('screenshotInput').click());
uploadArea.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('screenshotInput').click(); });
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => { e.preventDefault(); uploadArea.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleScreenUpload(e.dataTransfer.files[0]); });
document.getElementById('screenshotRemoveBtn').addEventListener('click', e => { e.stopPropagation(); resetScreenPreview(); });

/* ─── LIGHTBOX ────────────────────────────────────────────────────────── */
function openLightbox(src) {
    const ov = document.getElementById('lightboxOverlay');
    const img = document.getElementById('lightboxImg');
    if (!ov || !img) return;
    img.src = src;
    ov.classList.add('open');
    ov.setAttribute('aria-hidden', 'false');
}

function closeLightbox() {
    const ov = document.getElementById('lightboxOverlay');
    if (!ov) return;
    ov.classList.remove('open');
    ov.setAttribute('aria-hidden', 'true');
    const img = document.getElementById('lightboxImg');
    if (img) img.src = '';
}

// Lightbox
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightboxOverlay').addEventListener('click', e => { if (e.target.id === 'lightboxOverlay') closeLightbox(); });


// Theme
document.querySelectorAll('.theme-btn').forEach(btn => btn.addEventListener('click', () => applyTheme(btn.dataset.theme)));

// Keyboard
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (document.getElementById('lightboxOverlay').classList.contains('open')) { closeLightbox(); return; }
        if (document.getElementById('tradeModalOverlay').classList.contains('open')) { closeTradeModal(); return; }
        if (document.getElementById('dayDetailOverlay').classList.contains('open')) { closeDayDetail(); return; }
    }
    const anyOpen = ['lightboxOverlay', 'tradeModalOverlay', 'dayDetailOverlay']
        .some(id => document.getElementById(id).classList.contains('open'));
    if (!anyOpen) { if (e.key === 'ArrowLeft') prevMonth(); if (e.key === 'ArrowRight') nextMonth(); }
});

// Hamburger
const hamBtn = document.getElementById('hamburger');
const mobNav = document.getElementById('mobileMenu');
if (hamBtn && mobNav) {
    hamBtn.addEventListener('click', () => {
        const open = hamBtn.classList.toggle('open');
        mobNav.classList.toggle('open', open);
        hamBtn.setAttribute('aria-expanded', String(open));
        mobNav.setAttribute('aria-hidden', String(!open));
    });
}

/* ─── INIT ───────────────────────────────────────────────────────────── */
data = loadData();
applyTheme(localStorage.getItem(PNL_THEME_KEY) || 'dark');
// applyTheme → renderCalendar → updateSummary → updateChallengeSummary
initChallengePanel();

// Re-render on language change
document.addEventListener('altivor:languagechange', () => {
    renderCalendar();
    if (detailDate) {
        const d = new Date(detailDate + 'T00:00:00');
        document.getElementById('detailDayName').textContent = getDayNames()[(d.getDay() + 6) % 7];
        document.getElementById('detailDateLabel').textContent = `${getMonthNames()[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
        renderDetailSummary();
        renderTradeList();
    }
    const modalOv = document.getElementById('tradeModalOverlay');
    const addEl = document.getElementById('tradeModalTitle');
    if (addEl && modalOv && modalOv.classList.contains('open')) {
        addEl.textContent = editTradeId ? t('pnl_edit_trade', 'Edit Trade') : t('pnl_add_trade', 'Add Trade');
    }
});
