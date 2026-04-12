'use strict';

const nodemailer = require('nodemailer');
const crypto = require('crypto');

const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

const BASE_URL = (process.env.ALTIVOR_BASE_URL || 'http://localhost:8090').replace(/\/+$/, '');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE !== 'false';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[email-service] SMTP not configured — verification emails will be logged to console only.');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: true }
  });

  return _transporter;
}

function generateVerificationToken() {
  const token = crypto.randomBytes(VERIFICATION_TOKEN_BYTES).toString('hex');
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS).toISOString();
  return { token, expiresAt };
}

function isTokenExpired(expiresAtIso) {
  if (!expiresAtIso) return true;
  return new Date(expiresAtIso).getTime() <= Date.now();
}

function buildVerificationUrl(token) {
  return `${BASE_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

function buildVerificationHtml(firstName, verificationUrl) {
  const name = firstName || 'there';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Inter','Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#111113;border:1px solid #1e1e22;border-radius:12px;padding:40px 36px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:28px;">
          <span style="font-family:'DM Serif Display',Georgia,serif;font-size:20px;color:#f0f0f0;letter-spacing:0.02em;">ALTIVOR INSTITUTE</span>
        </td></tr>

        <!-- Heading -->
        <tr><td align="center" style="padding-bottom:12px;">
          <h1 style="margin:0;font-size:22px;font-weight:600;color:#f0f0f0;font-family:'Inter','Segoe UI',Arial,sans-serif;">Verify your email address</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding-bottom:28px;font-size:14px;line-height:1.7;color:#9a9a9e;text-align:center;">
          Hi ${name},<br><br>
          Thank you for registering at ALTIVOR INSTITUTE. To activate your account and access the platform, please confirm your email address by clicking the button below.
        </td></tr>

        <!-- Button -->
        <tr><td align="center" style="padding-bottom:28px;">
          <a href="${verificationUrl}" target="_blank" style="display:inline-block;padding:12px 36px;background:#f0f0f0;color:#0a0a0a;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;letter-spacing:0.01em;">Confirm Email</a>
        </td></tr>

        <!-- Fallback link -->
        <tr><td style="padding-bottom:24px;font-size:12px;color:#5a5a5e;text-align:center;word-break:break-all;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${verificationUrl}" style="color:#7a7a80;text-decoration:underline;">${verificationUrl}</a>
        </td></tr>

        <!-- Expiry notice -->
        <tr><td style="padding-bottom:8px;font-size:12px;color:#5a5a5e;text-align:center;">
          This link expires in 24 hours. If you did not create an account, you can safely ignore this email.
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:16px 0 12px;"><hr style="border:none;border-top:1px solid #1e1e22;margin:0;"></td></tr>

        <!-- Footer -->
        <tr><td style="font-size:11px;color:#3a3a3e;text-align:center;line-height:1.6;">
          ALTIVOR INSTITUTE — Operational frameworks for disciplined market execution.<br>
          This is an automated message. Do not reply.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendVerificationEmail(user, token) {
  const verificationUrl = buildVerificationUrl(token);
  const html = buildVerificationHtml(user.firstName, verificationUrl);
  const fromAddress = process.env.SMTP_FROM || 'ALTIVOR INSTITUTE <noreply@altivor.institute>';

  const mailOptions = {
    from: fromAddress,
    to: user.email,
    subject: 'Verify your email — ALTIVOR INSTITUTE',
    html
  };

  const transporter = getTransporter();

  if (!transporter) {
    console.log('\n══════════════════════════════════════════════════════');
    console.log('[email-service] VERIFICATION EMAIL (console fallback)');
    console.log('  To:    ', user.email);
    console.log('  Token: ', token);
    console.log('  Link:  ', verificationUrl);
    console.log('══════════════════════════════════════════════════════\n');
    return { accepted: [user.email], messageId: 'console-' + Date.now() };
  }

  const info = await transporter.sendMail(mailOptions);
  console.log(`[email-service] Verification email sent to ${user.email} (messageId: ${info.messageId})`);
  return info;
}

module.exports = {
  VERIFICATION_TOKEN_TTL_MS,
  generateVerificationToken,
  isTokenExpired,
  sendVerificationEmail
};
