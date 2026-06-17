function getSmtpUser() {
  return (process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
}

function getSmtpPassword() {
  return (process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
}

function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim()
    && getSmtpUser()
    && getSmtpPassword()
  );
}

function isResendConfigured() {
  return Boolean((process.env.RESEND_API_KEY || '').trim());
}

function isEmailConfigured() {
  return isResendConfigured() || isSmtpConfigured();
}

module.exports = {
  getSmtpUser,
  getSmtpPassword,
  isSmtpConfigured,
  isResendConfigured,
  isEmailConfigured,
};
