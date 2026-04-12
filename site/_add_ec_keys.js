const fs = require('fs');
const keys = {
    ec_stages: 'stages',
    ec_allowed_yes: 'Trade Allowed — YES',
    ec_allowed_no: 'Trade Allowed — NO',
    ec_decision_yes: 'Decision: Permission stays YES because no blocking condition is active.',
    ec_decision_no: 'Decision: Permission stays NO until the blocking conditions are removed.',
    ec_good_decision: 'Good decision.',
};
const lines = Object.entries(keys).map(([k, v]) => {
    const escaped = v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return "        " + k + ": '" + escaped + "'";
});
const block = ",\n" + lines.join(",\n");
let i18n = fs.readFileSync('i18n.js', 'utf8');
const marker = "tl_cancel: 'Cancel'";
const pos = i18n.indexOf(marker);
if (pos === -1) { console.log('MARKER NOT FOUND'); process.exit(1); }
const endOfLine = pos + marker.length;
i18n = i18n.slice(0, endOfLine) + block + i18n.slice(endOfLine);
fs.writeFileSync('i18n.js', i18n, 'utf8');
console.log('Added ' + Object.keys(keys).length + ' ec_* keys to EN');
