/**
 * Injects index.html main-content i18n keys into i18n.js
 * Run: node inject-index-i18n.js
 */
const fs = require('fs');

// Language block end markers (reg_consent_error lines)
const LANG_ORDER = ['en','it','de','pl','es','pt','ar','zh','ru','hi','fr'];

const K = {};

// ─── ENGLISH ───
K.en = {
card_da_desc: "Each framework defines explicit entry conditions, structural invalidation criteria, and documentation checkpoints.",
card_rg_desc: "Position sizing, maximum exposure, and drawdown thresholds are fixed at cycle commencement.",
card_vs_desc: "Every trade is logged, every rule is tracked, and every cycle produces a structured behavioral audit.",
challenge_tag: "The Challenge", challenge_h2: "The US100 Validation Process",
challenge_body: "The US100 Challenge is a structured 55-trade validation cycle. Each trade is evaluated against 6 execution rules.",
challenge_rules_title: "6 Structural Execution Rules",
challenge_rule1: "Pre-session structural analysis documented before session open",
challenge_rule2: "Entry executed only at pre-identified structural reference levels",
challenge_rule3: "Stop-loss placed at structural invalidation — not arbitrary distance",
challenge_rule4: "Position size within declared fixed-fractional risk allocation",
challenge_rule5: "No re-entry after a missed or invalidated setup within the same session",
challenge_rule6: "Trade documented in the Operational Panel before session close",
challenge_pass_title: "Cycle Completion Criteria",
challenge_pass_body: "A participant completes the validation cycle by logging 55 trades.",
infra_body: "The ALTIVOR Operational Panel is the participant\u2019s primary interface during an active validation cycle.",
infra_log_title: "Trade Log", infra_log_desc: "A structured, session-by-session trade entry interface.",
infra_cycle_title: "55-trade Cycle Counter", infra_cycle_desc: "Real-time tracking within the 55-trade validation cycle.",
infra_risk_title: "Risk Governance Module", infra_risk_desc: "Live drawdown position relative to defined thresholds.",
infra_audit_title: "Behavioral Audit", infra_audit_desc: "Flags protocol deviations and maintains chronological audit record.",
infra_report_title: "Monthly Report Export", infra_report_desc: "Structured PDF behavioral audit report exportable monthly.",
infra_score_title: "Execution Compliance Score", infra_score_desc: "Per-rule compliance breakdown across the active cycle.",
pnl_body: "The ALTIVOR PnL Calendar transforms trade activity into a clear, session-by-session record.",
pnl_feat1_title: "Daily Session Overview", pnl_feat1_desc: "Trade count and session outcome, color-coded by compliance.",
pnl_feat2_title: "Monthly Cycle Tracking", pnl_feat2_desc: "Navigate weeks and months to review the validation cycle.",
pnl_feat3_title: "Goal Reference Layer", pnl_feat3_desc: "Set a monthly reference point without outcome dependency.",
pnl_feat4_title: "Structural Consistency View", pnl_feat4_desc: "A behavioral mirror showing operational consistency.",
docs_body: "The ALTIVOR documentation suite provides operational specifications and reference material.",
docs_tag_full: "Full Access", docs_fw_title: "Client Edition Framework",
docs_fw_desc: "The complete operational specification document for the US100 framework.",
docs_fw_note: "Available with both Framework Pack and Full Access plans.",
docs_tag_locked: "Full Access Only",
docs_reg_title: "Regulatory and Evaluation Structure",
docs_reg_desc: "Compliance criteria, behavioral assessment methodology, and validation thresholds.",
docs_reg_note: "Available with both Framework Pack and Full Access plans.",
docs_case_title: "Case Study Library",
docs_case_desc: "Anonymized cycle review documents from completed validation cycles.",
docs_case_note: "Exclusively available with the Full Access plan.",
env_body: "The US100 framework operates across three distinct functional environments.",
env_analysis_label: "Market Analysis", env_analysis_desc: "Charting and structural analysis in TradingView.",
env_analysis_tag: "Analysis Layer", env_exec_label: "Execution",
env_exec_desc: "Execution platform for all US100 CFD trades in MT5.",
env_exec_tag: "Execution Layer", env_log_label: "Logging and Validation",
env_log_platform: "Altivor Operational Panel",
env_log_desc: "Primary data capture and compliance monitoring interface.", env_log_tag: "Validation Layer",
price_tag: "Access", price_h2: "Structure Your Participation",
price_body: "Access to ALTIVOR INSTITUTE is structured in two layers: PREPARE, then a Challenge product. Accessories available separately.",
price_step1_name: "Complete PREPARE", price_step1_desc: "Mandatory procedural gate. Universal. One-time.",
price_step2_name: "Select a Challenge", price_step2_desc: "US100 active. US30 in development. After PREPARE.",
price_step3_name: "Accessories Access", price_step3_desc: "Available separately. 59 \u20ac / mo on challenge pass.",
price_prepare_label: "PREPARE", price_prepare_desc: "Mandatory procedural qualification gate.",
price_prepare_li1: "10-trade compliance evaluation", price_prepare_li2: "6-rule structural checklist",
price_prepare_li3: "Qualification status tracking", price_prepare_li4: "Unlocks all challenge products",
price_prepare_li5: "Framework Documentation", price_prepare_li6: "Operational Panel", price_prepare_li7: "Accessories Suite",
price_prepare_btn: "Begin PREPARE", price_prepare_fine: "One-time. Required before any challenge.",
price_fwpack_label: "Framework Pack", price_fwpack_desc: "Documentation access with full framework specification.",
price_fwpack_li1: "Client Edition Framework Document", price_fwpack_li2: "Regulatory &amp; Evaluation Structure",
price_fwpack_li3: "Case Study Library \u2014 Full Access", price_fwpack_li4: "Operational Panel",
price_fwpack_li5: "Behavioral Audit Module", price_fwpack_li6: "Monthly PDF Report", price_fwpack_li7: "Accessories Suite",
price_fwpack_btn: "Access Framework Pack", price_fwpack_fine: "Requires completed PREPARE. One-time payment.",
price_us100_popular: "Most Popular", price_us100_label: "US100 Challenge",
price_us100_desc: "Full operational access to the US100 framework.",
price_us100_li1: "Client Edition Framework Document", price_us100_li2: "Regulatory &amp; Evaluation Structure",
price_us100_li3: "Case Study Library \u2014 Full Access", price_us100_li4: "Operational Panel \u2014 Full Access",
price_us100_li5: "Behavioral Audit Module", price_us100_li6: "Monthly PDF Report Export",
price_us100_li7: "Accessories Suite \u2014 59 \u20ac / mo on pass",
price_us100_btn: "Start US100 Challenge", price_us100_fine: "Requires PREPARE. Passing unlocks Accessories at 59 \u20ac / mo.",
price_acc_label: "Accessories Only", price_acc_desc: "Monthly access to the full Accessories suite.",
price_acc_li1: "Trading Log \u2014 Daily Journal", price_acc_li2: "PnL Calendar \u2014 Heatmap Tracker",
price_acc_li3: "Economic Calendar", price_acc_li4: "Trading Symbols \u2014 Spreads &amp; Swaps",
price_acc_li5: "Execution Checklist", price_acc_li6: "Trading Calculators", price_acc_li7: "Framework Documentation",
price_acc_btn: "Subscribe \u2014 Accessories", price_acc_fine: "Monthly subscription. No challenge required.",
price_discount_notice: 'Pass your Challenge and unlock <strong>Accessories at 59 \u20ac / month</strong> \u2014 12-month discount.',
price_note: "Accessories is subscription-based. Passing any challenge unlocks 59 \u20ac / month for 12 months.",
sup_tag: "Support", sup_h2: "Expert Support,<br>Mon\u2013Sat",
sup_sub: 'Available <strong>Monday to Saturday</strong> in <strong>10 languages</strong>. No bots. No queues.',
sup_stat1_label: "Availability", sup_stat2_label: "Languages Spoken", sup_stat3_label: "Avg. Response Time",
sup_ch_email: "Email", sup_ch_chat: "Live Chat", sup_ch_chat_val: "Start conversation",
sup_ch_wa: "WhatsApp", sup_ch_wa_val: "Message us directly",
sup_vis_agent: "Support Agent", sup_vis_msg1: "Welcome to ALTIVOR. How can I assist you today?",
sup_vis_msg2: "I need help with the 55-trade cycle documentation.",
sup_vis_msg3: "The Client Edition Framework document covers the full cycle structure.",
faq_q1: "What is ALTIVOR INSTITUTE?", faq_a1: "A structural execution institute for systematic market participation.",
faq_q2: "What is the US100 framework?", faq_a2: "The first active framework for Nasdaq 100 CFD.",
faq_q3: "What is the 55-trade cycle?", faq_a3: "The defined validation unit within the US100 framework.",
faq_q4: "What is the access structure?", faq_a4: "Three layers: PREPARE (29 \u20ac), Challenge (e.g. US100 129 \u20ac), Accessories suite.",
faq_q5: "Is this a funded trading programme?", faq_a5: "No. No capital or funded accounts.",
faq_q6: "Accessories subscription fees?", faq_a6: "79 \u20ac / month. 59 \u20ac / month for challenge passers.",
faq_q7: "What platform do I need?", faq_a7: "MetaTrader 5 for execution, TradingView for analysis.",
faq_q8: "Trading signals or advice?", faq_a8: "No. No signals, recommendations, or advice.",
faq_q9: "How is payment processed?", faq_a9: "Via Stripe with industry-standard encryption.",
faq_q10: "Can I upgrade?", faq_a10: "Yes, by paying the difference at any time."
};

// Load remaining languages from separate file
const extra = require('./inject-index-i18n-langs.js');
Object.assign(K, extra);

// ─── INJECT LOGIC ───
const file = 'i18n.js';
let src = fs.readFileSync(file, 'utf8');

for (const lang of LANG_ORDER) {
    if (!K[lang]) { console.log(`SKIP ${lang} (no keys)`); continue; }
    const marker = `reg_consent_error:`;
    const lines = src.split('\n');
    let found = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(marker) && !found) {
            // Check if this is in the right language block by looking backwards
            let langMatch = false;
            for (let j = i; j >= Math.max(0, i - 300); j--) {
                const m = lines[j].match(/^\s+(en|it|de|pl|es|pt|ar|zh|ru|hi|fr)\s*:\s*\{/);
                if (m) { langMatch = m[1] === lang; break; }
            }
            if (!langMatch) continue;
            found = true;
            // Build new keys string
            const entries = Object.entries(K[lang]).map(([k, v]) => {
                const escaped = v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `        ${k}: '${escaped}'`;
            });
            const newBlock = ',\n' + entries.join(',\n');
            // Insert after reg_consent_error line
            lines[i] = lines[i] + newBlock;
        }
    }
    if (found) {
        src = lines.join('\n');
        console.log(`Injected ${Object.keys(K[lang]).length} keys into ${lang}`);
    } else {
        console.log(`WARNING: marker not found for ${lang}`);
    }
}

fs.writeFileSync(file, src, 'utf8');
console.log('Done! i18n.js updated.');
