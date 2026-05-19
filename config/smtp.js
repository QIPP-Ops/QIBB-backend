function getSmtpPassword() {
  return (process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
}

function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim()
    && process.env.SMTP_USER?.trim()
    && getSmtpPassword()
  );
}

module.exports = {
  getSmtpPassword,
  isEmailConfigured,
};
