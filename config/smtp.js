function getSmtpUser() {
  return (process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
}

function getSmtpPassword() {
  return (process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
}

function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim()
    && getSmtpUser()
    && getSmtpPassword()
  );
}

module.exports = {
  getSmtpUser,
  getSmtpPassword,
  isEmailConfigured,
};
