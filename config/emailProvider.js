const {
  getSmtpUser,
  getSmtpPassword,
  isSmtpConfigured,
  isResendConfigured,
  isEmailConfigured,
} = require('./smtp');

function getResendApiKey() {
  return (process.env.RESEND_API_KEY || '').trim();
}

function getEmailProvider() {
  if (isResendConfigured()) return 'resend';
  if (isSmtpConfigured()) return 'smtp';
  return null;
}

function getFromAddress() {
  const resendFrom = (process.env.RESEND_FROM || '').trim();
  if (isResendConfigured() && resendFrom) return resendFrom;

  const smtpFrom = (process.env.SMTP_FROM || '').trim();
  if (smtpFrom) return smtpFrom;

  const name = process.env.SMTP_FROM_NAME || 'ACWA Ops System';
  const user = getSmtpUser();
  if (user) return `"${name}" <${user}>`;

  if (isResendConfigured()) {
    return 'QIPP Operations <onboarding@resend.dev>';
  }

  return '';
}

module.exports = {
  getResendApiKey,
  isResendConfigured,
  isSmtpConfigured,
  isEmailConfigured,
  getEmailProvider,
  getFromAddress,
  getSmtpUser,
  getSmtpPassword,
};
