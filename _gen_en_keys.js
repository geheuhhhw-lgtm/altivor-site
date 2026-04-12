const fs = require('fs');
const missing = JSON.parse(fs.readFileSync('_missing_keys.json', 'utf8'));
const lines = [];
for (const [key, val] of Object.entries(missing)) {
    const escaped = val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    lines.push("        " + key + ": '" + escaped + "'");
}
const block = ",\n" + lines.join(",\n");
const i18n = fs.readFileSync('i18n.js', 'utf8');
// Find reg_consent_error line end, then insert before the newline
const keyStr = "reg_consent_error: 'You must accept the terms to create an account.'";
const pos = i18n.indexOf(keyStr);
if (pos === -1) { console.log('KEY NOT FOUND'); process.exit(1); }
const endOfLine = pos + keyStr.length;
const result = i18n.slice(0, endOfLine) + block + i18n.slice(endOfLine);
fs.writeFileSync('i18n.js', result, 'utf8');
console.log('Inserted ' + Object.keys(missing).length + ' EN keys at position ' + endOfLine);
