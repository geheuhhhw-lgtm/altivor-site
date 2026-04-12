const fs = require('fs');
const path = require('path');

const dir = __dirname;
const srcFile = 'index.html';
const srcHtml = fs.readFileSync(path.join(dir, srcFile), 'utf8');

// Fast extraction: find startMarker, then count <div and </div> using indexOf jumps
function extractDivBlock(html, startMarker) {
    const s = html.indexOf(startMarker);
    if (s === -1) return null;
    let depth = 0;
    let pos = s;
    while (pos < html.length) {
        const nextOpen = html.indexOf('<div', pos);
        const nextClose = html.indexOf('</div>', pos);
        if (nextClose === -1) return null;
        if (nextOpen !== -1 && nextOpen < nextClose) {
            depth++;
            pos = nextOpen + 4;
        } else {
            depth--;
            if (depth === 0) return html.substring(s, nextClose + 6);
            pos = nextClose + 6;
        }
    }
    return null;
}

function extractTag(html, startMarker, closeTag) {
    const s = html.indexOf(startMarker);
    if (s === -1) return null;
    const e = html.indexOf(closeTag, s);
    if (e === -1) return null;
    return html.substring(s, e + closeTag.length);
}

const footerHtml = extractTag(srcHtml, '<footer ', '</footer>');
const cb = extractDivBlock(srcHtml, '<div class="cookie-banner" id="cookieBanner"');
const cp = extractDivBlock(srcHtml, '<div class="cookie-prefs-overlay" id="cookiePrefsOverlay"');
const dm = extractDivBlock(srcHtml, '<div class="docs-overlay" id="docsModal"');
const lm = extractDivBlock(srcHtml, '<div class="auth-overlay" id="loginModal"');
const rm = extractDivBlock(srcHtml, '<div class="auth-overlay" id="registerModal"');

console.log('Footer: ' + (footerHtml ? footerHtml.length + ' chars' : 'NOT FOUND'));
console.log('Cookie banner: ' + (cb ? cb.length + ' chars' : 'NOT FOUND'));
console.log('Cookie prefs: ' + (cp ? cp.length + ' chars' : 'NOT FOUND'));
console.log('Docs modal: ' + (dm ? dm.length + ' chars' : 'NOT FOUND'));
console.log('Login modal: ' + (lm ? lm.length + ' chars' : 'NOT FOUND'));
console.log('Register modal: ' + (rm ? rm.length + ' chars' : 'NOT FOUND'));

if (!footerHtml) { console.error('Footer not found'); process.exit(1); }

const htmlFiles = fs.readdirSync(dir)
    .filter(f => f.endsWith('.html') && f !== srcFile);

let updated = 0;

for (const file of htmlFiles) {
    const filePath = path.join(dir, file);
    let html = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    const oldFooter = extractTag(html, '<footer ', '</footer>');
    if (oldFooter) { html = html.replace(oldFooter, footerHtml); changed = true; }

    const oldCb = extractDivBlock(html, '<div class="cookie-banner" id="cookieBanner"');
    if (oldCb && cb) { html = html.replace(oldCb, cb); changed = true; }

    const oldCp = extractDivBlock(html, '<div class="cookie-prefs-overlay" id="cookiePrefsOverlay"');
    if (oldCp && cp) { html = html.replace(oldCp, cp); changed = true; }

    const oldDm = extractDivBlock(html, '<div class="docs-overlay" id="docsModal"');
    if (oldDm && dm) { html = html.replace(oldDm, dm); changed = true; }

    const oldLm = extractDivBlock(html, '<div class="auth-overlay" id="loginModal"');
    if (oldLm && lm) { html = html.replace(oldLm, lm); changed = true; }

    const oldRm = extractDivBlock(html, '<div class="auth-overlay" id="registerModal"');
    if (oldRm && rm) { html = html.replace(oldRm, rm); changed = true; }

    if (changed) {
        fs.writeFileSync(filePath, html, 'utf8');
        updated++;
        console.log('OK: ' + file);
    } else {
        console.log('SKIP: ' + file);
    }
}

console.log('\nDone! Updated ' + updated + ' files.');
