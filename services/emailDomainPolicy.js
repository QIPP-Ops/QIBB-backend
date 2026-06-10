const AdminConfig = require('../models/AdminConfig');

const DEFAULT_ALLOWED_DOMAINS = ['acwapower.com', 'nomac.com'];
const DEFAULT_AUTO_APPROVED_DOMAINS = ['acwapower.com', 'nomac.com'];

function normalizeDomainList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean))];
}

async function getEmailDomainPolicy() {
  const config = await AdminConfig.findOne().lean();
  const allowed = normalizeDomainList(config?.allowedEmailDomains);
  const autoApproved = normalizeDomainList(config?.autoApprovedEmailDomains);
  return {
    allowed: allowed.length ? allowed : [...DEFAULT_ALLOWED_DOMAINS],
    autoApproved: autoApproved.length ? autoApproved : [...DEFAULT_AUTO_APPROVED_DOMAINS],
  };
}

function emailDomain(email) {
  return String(email || '').split('@')[1]?.toLowerCase() || '';
}

async function isAllowedEmailDomain(email) {
  const { allowed } = await getEmailDomainPolicy();
  return allowed.includes(emailDomain(email));
}

async function isAutoApprovedDomain(email) {
  const { autoApproved } = await getEmailDomainPolicy();
  return autoApproved.includes(emailDomain(email));
}

module.exports = {
  DEFAULT_ALLOWED_DOMAINS,
  DEFAULT_AUTO_APPROVED_DOMAINS,
  normalizeDomainList,
  getEmailDomainPolicy,
  isAllowedEmailDomain,
  isAutoApprovedDomain,
  emailDomain,
};
