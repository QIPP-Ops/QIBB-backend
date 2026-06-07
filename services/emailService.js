const nodemailer = require('nodemailer');
const { getFrontendBaseUrl } = require('../config/frontendUrl');
const { getSmtpUser, getSmtpPassword, isEmailConfigured } = require('../config/smtp');
const { ACWA_EMAIL_LOGO_SVG, BRAND_MOTTO_HTML } = require('./emailBrandAssets');

function createTransporter() {
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: {
      user: getSmtpUser(),
      pass: getSmtpPassword(),
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'true',
      minVersion: 'TLSv1.2',
    },
  });
}

function getFromAddress() {
  const name = process.env.SMTP_FROM_NAME || "ACWA Ops System";
  return `"${name}" <${getSmtpUser()}>`;
}

function getDefaultMailExtras() {
  const replyTo = (process.env.SMTP_REPLY_TO || process.env.EMAIL_REPLY_TO || "").trim();
  const cc = (process.env.SMTP_DEFAULT_CC || process.env.EMAIL_DEFAULT_CC || "").trim();
  return {
    ...(replyTo ? { replyTo } : {}),
    ...(cc ? { cc } : {}),
  };
}

async function sendMail(options) {
  if (!isEmailConfigured()) {
    throw new Error('SMTP is not configured (SMTP_HOST, SMTP_USER, and SMTP_PASS or EMAIL_PASS required).');
  }
  const transporter = createTransporter();
  const defaults = getDefaultMailExtras();
  await transporter.sendMail({
    from: getFromAddress(),
    ...defaults,
    ...options,
  });
}

// ─── Shared HTML wrapper ─────────────────────────────────────────────────────
function emailTemplate(title, bodyHtml) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      body { margin:0; padding:0; background:#f4f4f8; font-family:'Segoe UI',Arial,sans-serif; }
      .wrapper { max-width:520px; margin:40px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
      .header { background:#F9F7FC; padding:28px 40px; text-align:center; border-bottom:1px solid #E3DCF5; }
      .header .logo { display:inline-block; line-height:0; }
      .body { padding:40px; color:#2E2044; }
      .body h2 { font-size:22px; font-weight:800; margin:0 0 8px; }
      .body p { font-size:15px; line-height:1.6; color:#555; margin:0 0 16px; }
      .otp-box { background:#f4f4f8; border-radius:12px; padding:20px; text-align:center; margin:24px 0; }
      .otp-box span { font-size:40px; font-weight:900; letter-spacing:0.3em; color:#9273DA; }
      .btn { display:inline-block; background:#9273DA; color:#fff !important; text-decoration:none; font-weight:700; font-size:15px; padding:14px 32px; border-radius:10px; margin:16px 0; }
      .footer { background:#9273DA; padding:24px 40px; text-align:center; font-size:12px; color:#fff; border-top:1px solid rgba(255,255,255,0.15); }
      .brand-motto { font-size:18px; line-height:1.35; font-weight:600; margin-bottom:10px; }
      .motto-white { color:#ffffff; }
      .motto-muted { color:#2E2044; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="header">
        <div class="logo">${ACWA_EMAIL_LOGO_SVG}</div>
      </div>
      <div class="body">
        <h2>${title}</h2>
        ${bodyHtml}
      </div>
      <div class="footer">
        ${BRAND_MOTTO_HTML}
        This is an automated message — do not reply.
      </div>
    </div>
  </body>
  </html>`;
}

// ─── OTP Email ───────────────────────────────────────────────────────────────
exports.sendOtpEmail = async (email, name, otp) => {
  const html = emailTemplate('Verify Your Email', `
    <p>Hello <strong>${name}</strong>,</p>
    <p>Use the OTP below to verify your email address. It expires in <strong>10 minutes</strong>.</p>
    <div class="otp-box"><span>${otp}</span></div>
    <p>If you did not register, ignore this email.</p>
  `);

  await sendMail({
    to:      email,
    subject: 'Your ACWA Ops Verification Code',
    html,
  });
};

// ─── Password Reset Email ────────────────────────────────────────────────────
exports.sendResetEmail = async (email, name, resetUrl) => {
  const html = emailTemplate('Reset Your Password', `
    <p>Hello <strong>${name}</strong>,</p>
    <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
    <div style="text-align:center;">
      <a href="${resetUrl}" class="btn">Reset Password</a>
    </div>
    <p>If you did not request a reset, ignore this email. Your password will not change.</p>
  `);

  await sendMail({
    to:      email,
    subject: 'ACWA Ops — Password Reset Request',
    html,
  });
};

// ─── Admin Temp Password Email ───────────────────────────────────────────────
exports.sendTempPasswordEmail = async (email, name, tempPassword) => {
  const html = emailTemplate('Your Password Has Been Reset', `
    <p>Hello <strong>${name}</strong>,</p>
    <p>An administrator has reset your password. Use the temporary password below to log in, then change it immediately.</p>
    <div class="otp-box"><span style="font-size:24px;letter-spacing:0.15em;">${tempPassword}</span></div>
    <p>For security, please update your password after logging in.</p>
  `);

  await sendMail({
    to:      email,
    subject: 'ACWA Ops — Your Temporary Password',
    html,
  });
};

exports.isEmailConfigured = isEmailConfigured;
exports.getFrontendBaseUrl = getFrontendBaseUrl;
exports.sendMail = sendMail;
exports.emailTemplate = emailTemplate;
