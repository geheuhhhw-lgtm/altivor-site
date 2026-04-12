const fs = require('fs');
const h = fs.readFileSync('execution-checklist.html', 'utf8');
const lines = h.split('\n');
let inScript = false;
const hits = [];
const patterns = ['textContent', '.innerHTML', 'showNote(', 'Decision:', 'Good decision', 'Trade Allowed', 'stages', 'Permission'];
lines.forEach((l, i) => {
    if (l.includes('<script') && !l.includes('src=')) inScript = true;
    if (inScript) {
        for (const p of patterns) {
            if (l.includes(p) && l.includes("'")) {
                hits.push((i + 1) + ': ' + l.trim().substring(0, 150));
                break;
            }
        }
    }
    if (l.includes('</script>')) inScript = false;
});
hits.forEach(h => console.log(h));
console.log('Total hits: ' + hits.length);
