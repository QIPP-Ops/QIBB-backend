const PROTECTED = new Set(['admin@acwaops.com', 'admin@acwapower.com']);

/** Seeded / invented roster emails — not real login addresses. */
function isPlaceholderEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const e = email.trim().toLowerCase();
  if (!e) return false;
  if (PROTECTED.has(e)) return false;
  if (/@roster\.acwaops\.local$/i.test(e)) return true;
  if (/@roster\./i.test(e)) return true;
  if (/\.local@/i.test(e) || /@(example|test|placeholder)\./i.test(e)) return true;
  if (/^emp[\d._-]+@/i.test(e)) return true;
  return false;
}

function isValidEmailFormat(email) {
  if (!email || typeof email !== 'string') return false;
  const e = email.trim();
  if (!e.includes('@')) return false;
  const parts = e.split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1].trim();
  return domain.length > 0 && domain.includes('.');
}

function sanitizeEmailForClient(email) {
  return isPlaceholderEmail(email) ? '' : (email || '').trim();
}

module.exports = { isPlaceholderEmail, sanitizeEmailForClient, isValidEmailFormat, PROTECTED };
