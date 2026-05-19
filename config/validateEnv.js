function validateEnv() {
  const required = ['JWT_SECRET', 'COSMOS_URI'];
  const missing = required.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in values.');
    process.exit(1);
  }

  if (process.env.JWT_SECRET.length < 32) {
    console.warn('Warning: JWT_SECRET should be at least 32 characters for production.');
  }

  const { isEmailConfigured } = require('./smtp');
  if (!isEmailConfigured()) {
    console.warn(
      'Warning: SMTP_HOST, SMTP_USER, and SMTP_PASS (or EMAIL_PASS) are not set — OTP and password reset emails will not send.'
    );
  }
  if (!process.env.FRONTEND_URL?.trim()) {
    console.warn(
      'Warning: FRONTEND_URL is not set — password reset links will use https://qippop.azurewebsites.net'
    );
  }
}

module.exports = { validateEnv };
