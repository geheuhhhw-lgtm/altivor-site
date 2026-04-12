'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname;
const files = fs.readdirSync(root).filter((file) => file.endsWith('.html'));

const brokenCRLF = [
  '        <p class="footer-disclaimer" data-i18n="footer_reg">',
  '          ALTIVOR INSTITUTE does not provide investment advice, financial services, or market signals. All framework',
  '          content is for structural process documentation purposes only. Market participation involves risk. Past',
  '          process consistency does not indicate future behavioral or financial outcomes.',
  '',
  '      <div class="footer-links">'
].join('\r\n');

const fixedCRLF = [
  '        <p class="footer-disclaimer" data-i18n="footer_reg">',
  '          ALTIVOR INSTITUTE does not provide investment advice, financial services, or market signals. All framework',
  '          content is for structural process documentation purposes only. Market participation involves risk. Past',
  '          process consistency does not indicate future behavioral or financial outcomes.',
  '        </p>',
  '      </div>',
  '',
  '      <div class="footer-links">'
].join('\r\n');

const brokenLF = brokenCRLF.replace(/\r\n/g, '\n');
const fixedLF = fixedCRLF.replace(/\r\n/g, '\n');

let fixedCount = 0;

for (const file of files) {
  const filePath = path.join(root, file);
  const original = fs.readFileSync(filePath, 'utf8');
  let updated = original;

  if (updated.includes(brokenCRLF)) {
    updated = updated.replaceAll(brokenCRLF, fixedCRLF);
  }
  if (updated.includes(brokenLF)) {
    updated = updated.replaceAll(brokenLF, fixedLF);
  }

  if (updated !== original) {
    fs.writeFileSync(filePath, updated, 'utf8');
    fixedCount += 1;
    console.log('Fixed footer structure:', file);
  }
}

console.log('Total files fixed:', fixedCount);
