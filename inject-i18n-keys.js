const fs = require('fs');

const i18nPath = 'i18n.js';
const keysPath = 'i18n-consent-keys.json';

let content = fs.readFileSync(i18nPath, 'utf8');
const newKeys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));

const langs = ['en','it','de','pl','es','pt','ar','zh','ru','hi','fr'];

for (const lang of langs) {
    const keys = newKeys[lang];
    if (!keys) { console.log(`SKIP ${lang}: no keys in JSON`); continue; }

    // Find the language block: "lang: {" ... "}"
    // We need to find the closing "}" of the language block
    // Strategy: find "lang: {" then count braces to find the matching "}"
    const startRegex = new RegExp(`(\\b${lang}:\\s*\\{)`);
    const startMatch = content.match(startRegex);
    if (!startMatch) { console.log(`SKIP ${lang}: block not found`); continue; }

    const blockStart = content.indexOf(startMatch[0]);
    let braceCount = 0;
    let blockEnd = -1;
    let inString = false;
    let strChar = '';

    for (let i = blockStart; i < content.length; i++) {
        const ch = content[i];
        if (inString) {
            if (ch === '\\') { i++; continue; }
            if (ch === strChar) inString = false;
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') {
            inString = true;
            strChar = ch;
            continue;
        }
        if (ch === '{') braceCount++;
        if (ch === '}') {
            braceCount--;
            if (braceCount === 0) { blockEnd = i; break; }
        }
    }

    if (blockEnd === -1) { console.log(`SKIP ${lang}: closing brace not found`); continue; }

    // Check which keys already exist in this block
    const blockContent = content.substring(blockStart, blockEnd);
    const newEntries = [];
    let skipped = 0;

    for (const [key, val] of Object.entries(keys)) {
        // Check if key already exists in block
        const keyRegex = new RegExp(`\\b${key}\\s*:`);
        if (keyRegex.test(blockContent)) {
            skipped++;
            continue;
        }
        // Escape single quotes in value for JS string
        const escaped = val.replace(/'/g, "\\'");
        newEntries.push(`        ${key}: '${escaped}'`);
    }

    if (newEntries.length === 0) {
        console.log(`${lang}: all ${skipped} keys already exist`);
        continue;
    }

    // Insert before the closing brace
    const insertion = ',\n' + newEntries.join(',\n') + '\n';
    content = content.substring(0, blockEnd) + insertion + content.substring(blockEnd);

    console.log(`${lang}: added ${newEntries.length} keys, skipped ${skipped} existing`);
}

fs.writeFileSync(i18nPath, content, 'utf8');
console.log('Done! i18n.js updated.');
