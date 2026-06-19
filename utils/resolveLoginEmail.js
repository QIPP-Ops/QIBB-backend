const AdminUser = require('../models/AdminUser');
const { getEmailDomainPolicy } = require('../services/emailDomainPolicy');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function localPart(email) {
  return String(email || '').split('@')[0]?.toLowerCase() || '';
}

/**
 * Resolve a login identifier (full email or username-only) to a normalized email.
 * Username lookup prefers exact DB matches on the local part before domain guessing.
 */
async function resolveLoginEmail(identifier) {
  const raw = normalizeEmail(identifier);
  if (!raw) return '';
  if (raw.includes('@')) return raw;

  const prefixPattern = new RegExp(`^${escapeRegex(raw)}@`, 'i');
  const candidates = await AdminUser.find({ email: prefixPattern }).select('email').lean();

  if (candidates.length === 1) {
    return normalizeEmail(candidates[0].email);
  }

  if (candidates.length > 1) {
    const exact = candidates.filter((c) => localPart(c.email) === raw);
    if (exact.length === 1) return normalizeEmail(exact[0].email);

    const preferredDomains = ['acwaops.com', 'nomac.com', 'acwapower.com'];
    for (const domain of preferredDomains) {
      const match = candidates.find((c) => normalizeEmail(c.email).endsWith(`@${domain}`));
      if (match) return normalizeEmail(match.email);
    }
    return normalizeEmail(candidates[0].email);
  }

  const policy = await getEmailDomainPolicy();
  const domains = [...new Set(['acwaops.com', ...policy.allowed])];
  for (const domain of domains) {
    const constructed = `${raw}@${domain}`;
    const user = await AdminUser.findOne({ email: constructed }).select('email').lean();
    if (user) return normalizeEmail(user.email);
  }

  return `${raw}@acwaops.com`;
}

module.exports = { resolveLoginEmail, normalizeEmail };
