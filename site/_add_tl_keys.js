const fs = require('fs');
const keys = {
    tl_no_session: 'No session data yet.',
    tl_readout_ready: 'Behavioral readout ready.',
    tl_editing: 'Editing',
    tl_new_entry: 'New entry',
    tl_motivation_hint: 'This answer will stay available in future entries as a reminder.',
    tl_err_pnl: 'Required — enter a number (e.g. 0 or -25.50)',
    tl_err_trades: 'Required — enter 0 or more',
    tl_err_risk: 'Select Risk Exceeded — Yes or No.',
    tl_err_session: 'Select Session Compliant — Yes or No.',
    tl_err_rating: 'Select a Day Assessment rating.',
    tl_err_good: 'Fill in: What did I do well today?',
    tl_err_bad: 'Fill in: Where could I improve?',
    tl_err_improve: 'Fill in: One thing to improve tomorrow.',
    tl_saved: 'Entry saved.',
    tl_updated: 'Entry updated.',
    tl_deleted: 'Entry deleted.',
    tl_today_logged: "Today's entry is already saved. Edit it below.",
    tl_storage_err: 'Storage error.',
    tl_rate_plan: 'In Plan',
    tl_rate_partial: 'Partial',
    tl_rate_broken: 'Rules Broken',
    tl_yes: 'Yes',
    tl_no: 'No',
    tl_day_pnl: 'Day PnL',
    tl_trades: 'Trades',
    tl_risk_exceeded: 'Risk Exceeded',
    tl_session_compliant: 'Session Compliant',
    tl_tos_readout: 'Trader OS Session Readout',
    tl_journal_reflection: 'Journal reflection',
    tl_q_good: 'What I did well',
    tl_q_bad: 'Where I could improve',
    tl_q_improve: 'One thing to fix tomorrow',
    tl_q_motivation: 'Why I chose ALTIVOR',
    tl_q_challenge: 'Why this challenge means something to me',
    tl_edit: 'Edit',
    tl_delete: 'Delete',
    tl_saved_at: 'Saved',
    tl_del_confirm: 'Delete this entry permanently?',
    tl_cancel: 'Cancel',
};
const lines = Object.entries(keys).map(([k, v]) => {
    const escaped = v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return "        " + k + ": '" + escaped + "'";
});
const block = ",\n" + lines.join(",\n");
let i18n = fs.readFileSync('i18n.js', 'utf8');
// Find the end of the EN keys we just added (last wiki_tag key)
const marker = "wiki_tag: 'Knowledge Base'";
const pos = i18n.indexOf(marker);
if (pos === -1) { console.log('MARKER NOT FOUND'); process.exit(1); }
const endOfLine = pos + marker.length;
i18n = i18n.slice(0, endOfLine) + block + i18n.slice(endOfLine);
fs.writeFileSync('i18n.js', i18n, 'utf8');
console.log('Added ' + Object.keys(keys).length + ' tl_* keys to EN');
