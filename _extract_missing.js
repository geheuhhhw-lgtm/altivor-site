const fs = require('fs');
const i18n = fs.readFileSync('i18n.js', 'utf8');
const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));
const missing = {};
htmlFiles.forEach(f => {
    const h = fs.readFileSync(f, 'utf8');
    const re = /data-i18n="([^"]+)"[^>]*>([\s\S]*?)<\//g;
    let m;
    while ((m = re.exec(h)) !== null) {
        const key = m[1];
        const val = m[2].replace(/\s+/g, ' ').trim();
        if (!i18n.includes(key + ':') && !i18n.includes(key + ' :')) {
            if (!missing[key] || val.length > missing[key].length) missing[key] = val;
        }
    }
});
const sorted = Object.entries(missing).sort((a, b) => a[0].localeCompare(b[0]));
fs.writeFileSync('_missing_keys.json', JSON.stringify(Object.fromEntries(sorted), null, 2), 'utf8');
console.log('Wrote ' + sorted.length + ' keys');
