const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Super-admin service account — hidden from roster UIs and non-deletable. */
function isProtectedAccountEmail(email) {
  return normalizeEmail(email) === SUPER_ADMIN_EMAIL;
}

function filterProtectedAccounts(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => !isProtectedAccountEmail(r.email));
}

module.exports = { isProtectedAccountEmail, filterProtectedAccounts, normalizeEmail };
