const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const { getFrontendBaseUrl } = require('../config/frontendUrl');
const { getSmtpUser, getSmtpPassword, isEmailConfigured } = require('../config/smtp');
const {
  getResendApiKey,
  isResendConfigured,
  getEmailProvider,
  getFromAddress,
} = require('../config/emailProvider');
const { ACWA_EMAIL_LOGO_SVG, BRAND_MOTTO_HTML } = require('./emailBrandAssets');
const { emailCallout, emailCtaButton, emailHighlightBox, emailInfoList, emailMuted } = require('./emailHtmlHelpers');
const SMTP_CONNECTION_TIMEOUT_MS = parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10) || 60000;
const SMTP_SOCKET_TIMEOUT_MS = parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS, 10) || 60000;
const SMTP_GREETING_TIMEOUT_MS = parseInt(process.env.SMTP_GREETING_TIMEOUT_MS, 10) || 60000;
const SMTP_SEND_RETRIES = Math.max(1, parseInt(process.env.SMTP_SEND_RETRIES, 10) || 2);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSmtpTransportOptions() {
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  return {
    host: process.env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: {
      user: getSmtpUser(),
      pass: getSmtpPassword(),
    },
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'true',
      minVersion: 'TLSv1.2',
    },
  };
}

function createTransporter() {
  return nodemailer.createTransport(getSmtpTransportOptions());
}

function isRetryableSmtpError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '').toUpperCase();
  return (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    code === 'ETIMEDOUT' ||
    code === 'ESOCKET' ||
    code === 'ECONNECTION'
  );
}

function isLikelyRenderSmtpBlock(err) {
  if (process.env.RENDER !== 'true') return false;
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '').toUpperCase();
  return (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNECTION'
  );
}

function smtpFailureHint(err) {
  if (isLikelyRenderSmtpBlock(err)) {
    return (
      'SMTP connection blocked or timed out on Render. Free Render web services block outbound ports 25/465/587 — ' +
      'upgrade to a paid instance or use an HTTP email API (SendGrid, Resend, Mailgun). ' +
      'Verify: GET /health/email?verify=1'
    );
  }

  const msg = String(err?.message || err || 'SMTP send failed');
  if (msg.toLowerCase().includes('timeout')) {
    return (
      `${msg}. For GoDaddy Workspace email try SMTP_HOST=smtpout.secureserver.net ` +
      'SMTP_PORT=465 SMTP_SECURE=true (or port 587 with SMTP_SECURE=false).'
    );
  }

  return msg;
}

function normalizeAddressList(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const list = value.map((v) => String(v).trim()).filter(Boolean);
    return list.length ? list : undefined;
  }
  const list = String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

function toResendAttachments(attachments) {
  if (!attachments?.length) return undefined;
  return attachments.map((file) => ({
    filename: file.filename,
    content: Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content || ''),
    contentType: file.contentType,
  }));
}

async function verifyResendConnection() {
  if (!isResendConfigured()) {
    throw new Error('Resend is not configured (RESEND_API_KEY required).');
  }
  const resend = new Resend(getResendApiKey());
  const { error } = await resend.domains.list();
  if (error) throw new Error(error.message || 'Resend API verification failed');
  return { ok: true, provider: 'resend' };
}

async function sendViaResend(options) {
  const resend = new Resend(getResendApiKey());
  const defaults = getDefaultMailExtras();
  const to = normalizeAddressList(options.to);
  if (!to?.length) throw new Error('Resend send requires at least one recipient.');

  const payload = {
    from: getFromAddress(),
    to,
    subject: options.subject,
    html: options.html,
    ...(options.text ? { text: options.text } : {}),
    ...(normalizeAddressList(options.cc) ? { cc: normalizeAddressList(options.cc) } : {}),
    ...(normalizeAddressList(options.bcc) ? { bcc: normalizeAddressList(options.bcc) } : {}),
    ...(options.replyTo || defaults.replyTo
      ? { reply_to: options.replyTo || defaults.replyTo }
      : {}),
    ...(toResendAttachments(options.attachments)
      ? { attachments: toResendAttachments(options.attachments) }
      : {}),
  };

  const { error } = await resend.emails.send(payload);
  if (error) {
    throw new Error(error.message || 'Resend send failed');
  }
}

async function sendViaSmtp(options) {
  if (!process.env.SMTP_HOST?.trim() || !getSmtpUser() || !getSmtpPassword()) {
    throw new Error('SMTP is not configured (SMTP_HOST, SMTP_USER, and SMTP_PASS required).');
  }

  const defaults = getDefaultMailExtras();
  let lastErr;

  for (let attempt = 1; attempt <= SMTP_SEND_RETRIES; attempt += 1) {
    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: getFromAddress(),
        ...defaults,
        ...options,
      });
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < SMTP_SEND_RETRIES && isRetryableSmtpError(err)) {
        await sleep(2000 * attempt);
        continue;
      }
      break;
    }
  }

  throw new Error(smtpFailureHint(lastErr));
}

function getDefaultMailExtras() {
  const replyTo = (process.env.SMTP_REPLY_TO || process.env.EMAIL_REPLY_TO || '').trim();
  const cc = (process.env.SMTP_DEFAULT_CC || process.env.EMAIL_DEFAULT_CC || '').trim();
  return {
    ...(replyTo ? { replyTo } : {}),
    ...(cc ? { cc } : {}),
  };
}

async function verifySmtpConnection() {
  if (!process.env.SMTP_HOST?.trim() || !getSmtpUser() || !getSmtpPassword()) {
    throw new Error('SMTP is not configured (SMTP_HOST, SMTP_USER, and SMTP_PASS required).');
  }

  const transporter = createTransporter();
  await transporter.verify();
  return { ok: true, provider: 'smtp' };
}

async function verifyEmailConnection() {
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured (set RESEND_API_KEY or SMTP_* variables).');
  }
  if (isResendConfigured()) return verifyResendConnection();
  return verifySmtpConnection();
}

async function sendMail(options) {
  if (!isEmailConfigured()) {
    throw new Error(
      'Email is not configured. Set RESEND_API_KEY on Render free tier, or SMTP_HOST + SMTP_USER + SMTP_PASS on paid SMTP.'
    );
  }

  if (isResendConfigured()) {
    await sendViaResend(options);
    return;
  }

  await sendViaSmtp(options);
}

function emailTemplate(title, bodyHtml) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${title}</title>
    <style>
      body { margin:0; padding:0; background:#f4f4f8; font-family:'Montserrat','Segoe UI',Arial,sans-serif; -webkit-text-size-adjust:100%; }
      .wrapper { max-width:560px; margin:32px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(46,32,68,0.10); }
      .header { background:#F9F7FC; padding:28px 40px; text-align:center; border-bottom:1px solid #E3DCF5; }
      .header .logo { display:inline-block; line-height:0; }
      .body { padding:36px 40px 40px; color:#2E2044; }
      .body h2 { font-size:22px; font-weight:800; margin:0 0 20px; color:#2E2044; line-height:1.3; }
      .body h3.section-title { font-size:16px; font-weight:700; margin:28px 0 12px; color:#9273DA; line-height:1.35; }
      .body p { font-size:15px; line-height:1.65; color:#555; margin:0 0 16px; }
      .body p.muted, .muted { font-size:13px; color:#6B6280; margin-top:8px; }
      .body p.signoff { font-size:13px; color:#6B5E8A; margin-top:24px; margin-bottom:0; }
      .body ul, .body ol { font-size:15px; line-height:1.65; color:#555; margin:0 0 16px; padding-left:22px; }
      .body li { margin-bottom:6px; }
      ul.info-list { list-style:none; padding:0; margin:16px 0 20px; }
      ul.info-list li { position:relative; padding:8px 0 8px 22px; border-bottom:1px solid #F0ECF8; font-size:14px; color:#444; }
      ul.info-list li:last-child { border-bottom:none; }
      ul.info-list li::before { content:""; position:absolute; left:0; top:14px; width:8px; height:8px; border-radius:50%; background:#9273DA; }
      .callout { background:#F9F7FC; border-left:4px solid #9273DA; border-radius:0 12px 12px 0; padding:16px 18px; margin:20px 0; }
      .callout p { margin:0; color:#2E2044; font-size:14px; line-height:1.6; }
      .callout-warning { background:#FFF9F0; border-left-color:#E8A838; }
      .callout-warning p { color:#5C4A20; }
      .highlight-box, .otp-box { background:#F4F0FC; border:1px solid #E3DCF5; border-radius:12px; padding:22px 20px; text-align:center; margin:24px 0; }
      .highlight-box span, .otp-box span { font-size:40px; font-weight:900; letter-spacing:0.3em; color:#9273DA; }
      .btn-block { text-align:center; margin:24px 0; }
      .btn { display:inline-block; background:#9273DA; color:#fff !important; text-decoration:none; font-weight:700; font-size:15px; padding:14px 32px; border-radius:10px; }
      .detail-table { width:100%; border-collapse:collapse; margin:16px 0 20px; font-size:14px; }
      .detail-table td { padding:10px 12px; border-bottom:1px solid #F0ECF8; vertical-align:top; }
      .detail-table .detail-label { color:#6B6280; font-weight:600; width:38%; }
      .detail-table .detail-value { color:#2E2044; font-weight:500; }
      .footer { background:#9273DA; padding:24px 40px; text-align:center; font-size:12px; color:rgba(255,255,255,0.92); border-top:1px solid rgba(255,255,255,0.15); line-height:1.5; }
      .brand-motto { font-size:17px; line-height:1.35; font-weight:600; margin-bottom:10px; }
      .motto-white { color:#ffffff; }
      .motto-muted { color:#2E2044; }
      @media only screen and (max-width:600px) {
        .wrapper { margin:0; border-radius:0; }
        .header, .body, .footer { padding-left:24px; padding-right:24px; }
        .body h2 { font-size:20px; }
        .highlight-box span, .otp-box span { font-size:28px; letter-spacing:0.15em; }
      }
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

exports.sendOtpEmail = async (email, name, otp) => {
  const html = emailTemplate('Verify Your Email', `
    <p>Hello <strong>${name}</strong>,</p>
    ${emailCallout('<p>Enter this one-time code to verify your email address and activate your QIPP account.</p>')}
    <p>Your verification code expires in <strong>10 minutes</strong>.</p>
    ${emailHighlightBox(otp)}
    ${emailInfoList([
      'Do not share this code with anyone',
      'If the code expires, request a new one from the sign-in page',
    ])}
    ${emailMuted('If you did not register for QIPP, you can safely ignore this email.')}
  `);

  await sendMail({
    to: email,
    subject: 'Your ACWA Ops Verification Code',
    html,
  });
};

exports.sendResetEmail = async (email, name, resetUrl) => {
  const html = emailTemplate('Reset Your Password', `
    <p>Hello <strong>${name}</strong>,</p>
    ${emailCallout('<p>We received a request to reset your QIPP password. Use the button below to choose a new password.</p>')}
    <p>This secure link expires in <strong>1 hour</strong>.</p>
    ${emailCtaButton(resetUrl, 'Reset Password')}
    ${emailInfoList([
      'The link works only once — request another reset if it expires',
      'Your current password stays active until you complete the reset',
    ])}
    ${emailMuted('If you did not request a password reset, ignore this email. Your password will not change.')}
  `);

  await sendMail({
    to: email,
    subject: 'ACWA Ops — Password Reset Request',
    html,
  });
};

exports.sendTempPasswordEmail = async (email, name, tempPassword) => {
  const html = emailTemplate('Your Password Has Been Reset', `
    <p>Hello <strong>${name}</strong>,</p>
    ${emailCallout('<p>An administrator has reset your QIPP account password. Sign in with the temporary password below, then set a new password immediately.</p>', 'warning')}
    ${emailHighlightBox(tempPassword, 'sm')}
    ${emailInfoList([
      'Log in at your usual QIPP URL with this temporary password',
      'Update your password from account settings right after signing in',
      'Do not share this password with anyone',
    ])}
    ${emailMuted('If you did not expect this change, contact your portal administrator.')}
  `);

  await sendMail({
    to: email,
    subject: 'ACWA Ops — Your Temporary Password',
    html,
  });
};

exports.isEmailConfigured = isEmailConfigured;
exports.getFrontendBaseUrl = getFrontendBaseUrl;
exports.getEmailProvider = getEmailProvider;
exports.getFromAddress = getFromAddress;
exports.sendMail = sendMail;
exports.emailTemplate = emailTemplate;
exports.verifySmtpConnection = verifySmtpConnection;
exports.verifyResendConnection = verifyResendConnection;
exports.verifyEmailConnection = verifyEmailConnection;
exports.smtpFailureHint = smtpFailureHint;
exports.isLikelyRenderSmtpBlock = isLikelyRenderSmtpBlock;
exports.getSmtpTransportOptions = getSmtpTransportOptions;
exports.isResendConfigured = isResendConfigured;
