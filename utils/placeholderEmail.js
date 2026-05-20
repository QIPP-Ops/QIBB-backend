const PROTECTED = new Set(['admin@acwaops.com', 'admin@acwapower.com']);

/** Seeded / invented roster emails — not real login addresses. */
function isPlaceholderEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const e = email.trim().toLowerCase();
  if (!e) return false;
  if (PROTECTED.has(e)) return false;
  if (/@acwapower\.com$/i.test(e)) return true;
  if (/\.local@/i.test(e) || /@(example|test|placeholder)\./i.test(e)) return true;
  if (/^emp[\d._-]+@/i.test(e)) return true;
  return false;
}

function sanitizeEmailForClient(email) {
  return isPlaceholderEmail(email) ? '' : (email || '').trim();
}

module.exports = { isPlaceholderEmail, sanitizeEmailForClient, PROTECTED };
