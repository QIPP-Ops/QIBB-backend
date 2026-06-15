const { getMongoUri } = require('./database');

function validateEnv() {
  if (!process.env.JWT_SECRET?.trim()) {
    console.error('Missing required environment variable: JWT_SECRET');
    process.exit(1);
  }
  if (!getMongoUri()) {
    console.error('Missing database URI: set COSMOS_URI or MONGODB_URI');
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
      'Warning: FRONTEND_URL is not set — password reset links will use https://qipp.live'
    );
  }
}

module.exports = { validateEnv };
