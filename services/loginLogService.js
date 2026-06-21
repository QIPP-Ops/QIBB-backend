const LoginLog = require('../models/LoginLog');

function extractRequestMeta(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const ipAddress =
    req?.ip ||
    (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0].trim()) ||
    '';
  const userAgent = req?.get ? req.get('user-agent') || '' : req?.headers?.['user-agent'] || '';
  return { ipAddress, userAgent };
}

async function logLoginAttempt({ email, user, success, failureCode = '', req }) {
  try {
    const normalizedEmail = String(email || user?.email || '').trim().toLowerCase();
    if (!normalizedEmail) return;

    const { ipAddress, userAgent } = extractRequestMeta(req);

    LoginLog.create({
      timestamp: new Date(),
      email: normalizedEmail,
      userId: user?._id != null ? String(user._id) : '',
      userName: String(user?.name || user?.displayName || '').trim(),
      role: String(user?.accessRole || user?.role || '').trim(),
      crew: String(user?.crew || '').trim(),
      success: Boolean(success),
      failureCode: success ? '' : String(failureCode || '').trim(),
      ipAddress,
      userAgent,
    }).catch((error) => {
      console.error('Login log write failed:', error.message);
    });
  } catch (error) {
    console.error('Login log write failed:', error.message);
  }
}

module.exports = { logLoginAttempt, extractRequestMeta };
