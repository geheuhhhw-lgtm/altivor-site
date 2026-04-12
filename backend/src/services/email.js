'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');
const fs = require('fs');
const path = require('path');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { host, port, secure, user, pass } = config.smtp;
  if (!host || !user || !pass) {
    console.warn('[EMAIL] SMTP nie skonfigurowany — emaile nie będą wysyłane. Ustaw SMTP_* w .env');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  return transporter;
}

function getVerificationEmailHtml(verifyUrl) {
  const templatePath = path.join(__dirname, '../templates/verification-email.html');
  let html = '';

  try {
    html = fs.readFileSync(templatePath, 'utf8');
  } catch {
    html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:2rem;background:#0a0a0a;color:#e5e5e5;">
  <h1 style="font-size:1.5rem;margin-bottom:1rem;">Potwierdź adres email</h1>
  <p>Kliknij poniżej, aby zweryfikować swój adres email:</p>
  <p style="margin:1.5rem 0;"><a href="{{VERIFY_URL}}" style="display:inline-block;padding:0.75rem 1.5rem;background:#8bbdb4;color:#0a0a0a;text-decoration:none;font-weight:600;border-radius:6px;">Potwierdź email</a></p>
  <p style="font-size:0.85rem;color:#888;">Link ważny 24 godziny. Jeśli nie zakładałeś konta, zignoruj tę wiadomość.</p>
  <p style="font-size:0.8rem;color:#666;margin-top:2rem;">— ALTIVOR INSTITUTE</p>
</body>
</html>`;
  }

  return html.replace(/\{\{VERIFY_URL\}\}/g, verifyUrl);
}

async function sendVerificationEmail(toEmail, verifyUrl) {
  const transport = getTransporter();
  if (!transport) {
    console.log(`[EMAIL] Symulacja: wysłano mail weryfikacyjny na ${toEmail}`);
    console.log(`[EMAIL] Link: ${verifyUrl}`);
    return { simulated: true };
  }

  const html = getVerificationEmailHtml(verifyUrl);
  const from = `"${config.mail.fromName}" <${config.mail.fromEmail}>`;

  await transport.sendMail({
    from,
    to: toEmail,
    subject: 'Potwierdź adres email — ALTIVOR INSTITUTE',
    html,
    text: `Potwierdź adres email, klikając: ${verifyUrl}`
  });

  return { sent: true };
}

function getPasswordResetEmailHtml(resetCode) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:2rem;background:#0a0a0a;color:#e5e5e5;">
  <h1 style="font-size:1.5rem;margin-bottom:1rem;">Reset hasła</h1>
  <p>Otrzymaliśmy prośbę o reset hasła do Twojego konta.</p>
  <p style="margin:1.5rem 0;">Twój kod weryfikacyjny:</p>
  <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:1.5rem;text-align:center;margin:1.5rem 0;">
    <span style="font-size:2rem;font-weight:700;letter-spacing:0.3em;color:#d6be96;">${resetCode}</span>
  </div>
  <p style="font-size:0.85rem;color:#888;">Kod ważny 15 minut. Jeśli nie prosiłeś o reset hasła, zignoruj tę wiadomość.</p>
  <p style="font-size:0.8rem;color:#666;margin-top:2rem;">— ALTIVOR INSTITUTE</p>
</body>
</html>`;
}

async function sendPasswordResetEmail(toEmail, resetCode) {
  const transport = getTransporter();
  if (!transport) {
    console.log(`[EMAIL] Symulacja: wysłano mail z kodem resetującym na ${toEmail}`);
    console.log(`[EMAIL] Kod: ${resetCode}`);
    return { simulated: true };
  }

  const html = getPasswordResetEmailHtml(resetCode);
  const from = `"${config.mail.fromName}" <${config.mail.fromEmail}>`;

  await transport.sendMail({
    from,
    to: toEmail,
    subject: 'Reset hasła — ALTIVOR INSTITUTE',
    html,
    text: `Twój kod do resetu hasła: ${resetCode}. Kod ważny 15 minut.`
  });

  return { sent: true };
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};
