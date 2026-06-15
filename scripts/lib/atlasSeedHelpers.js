const { isValidEmailFormat } = require('../../utils/placeholderEmail');
const { loadBundledEmailPresets } = require('../../services/emailPresetsService');
const { SUPER_ADMIN_EMAIL } = require('../../config/superAdmin');
const { getSmtpUser, getSmtpPassword } = require('../../config/smtp');

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPersonnelEmailIndex(personnelEmails) {
  const byEmpId = new Map();
  const byName = new Map();

  for (const row of personnelEmails || []) {
    const email = String(row.email || '').trim().toLowerCase();
    if (!email || !isValidEmailFormat(email)) continue;
    const empId = String(row.empId || '').trim();
    if (empId) byEmpId.set(empId, email);
    const nameKey = normalizeName(row.name);
    if (nameKey) byName.set(nameKey, email);
  }

  return { byEmpId, byName };
}

/**
 * Resolve deliverable email for a roster row using inline email, empId, or name lookup.
 */
function resolvePersonEmail(person, emailIndex) {
  const inline = String(person.email || '').trim().toLowerCase();
  if (inline && isValidEmailFormat(inline)) return inline;

  const empId = String(person.empId || '').trim();
  if (empId && emailIndex.byEmpId.has(empId)) {
    return emailIndex.byEmpId.get(empId);
  }

  const nameKey = normalizeName(person.name || person.fullName);
  if (nameKey && emailIndex.byName.has(nameKey)) {
    return emailIndex.byName.get(nameKey);
  }

  return '';
}

function rosterEmpId(person) {
  const id = String(person.empId || '').trim();
  if (id) return id;
  if (person.id != null) return `ROSTER-${person.id}`;
  return `ROSTER-${normalizeName(person.name).replace(/\s+/g, '-') || 'unknown'}`;
}

function mapRosterLeaves(leaves) {
  return (leaves || []).map((l) => ({
    start: new Date(l.start),
    end: new Date(l.end),
    type: l.type || 'Planned',
  }));
}

function buildRosterUserFields(person, email, passwordHash) {
  return {
    name: person.name || person.fullName || 'Unknown',
    fullName: person.fullName || person.name || '',
    email: email.toLowerCase(),
    passwordHash,
    empId: rosterEmpId(person),
    crew: person.crew || 'General',
    role: person.role || 'Local Operator',
    color: person.color || 'crew-grey',
    accessRole: 'viewer',
    isApproved: true,
    isEmailVerified: true,
    isActive: true,
    leaves: mapRosterLeaves(person.leaves),
  };
}

/** Extract email from `Name <user@domain.com>` or plain address. */
function parseEmailFromSmtpFrom(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const angle = value.match(/<([^>]+)>/);
  if (angle && isValidEmailFormat(angle[1])) {
    return angle[1].trim().toLowerCase();
  }
  if (isValidEmailFormat(value)) return value.toLowerCase();
  return '';
}

/**
 * Super admin login for seed — prefers explicit overrides, then SMTP mailbox creds.
 * @returns {{ email: string, password: string, emailSource: string, passwordSource: string }}
 */
function resolveSuperAdminCredentials() {
  let email = '';
  let emailSource = '';

  if (process.env.SUPER_ADMIN_EMAIL?.trim()) {
    email = process.env.SUPER_ADMIN_EMAIL.trim().toLowerCase();
    emailSource = 'SUPER_ADMIN_EMAIL';
  } else if (getSmtpUser()) {
    email = getSmtpUser().toLowerCase();
    emailSource = 'SMTP_USER';
  } else {
    const fromEmail = parseEmailFromSmtpFrom(process.env.SMTP_FROM);
    if (fromEmail) {
      email = fromEmail;
      emailSource = 'SMTP_FROM';
    } else {
      email = SUPER_ADMIN_EMAIL;
      emailSource = 'default';
    }
  }

  let password = '';
  let passwordSource = '';

  if (process.env.SUPER_ADMIN_PASSWORD?.trim()) {
    password = process.env.SUPER_ADMIN_PASSWORD.trim();
    passwordSource = 'SUPER_ADMIN_PASSWORD';
  } else if (process.env.SEED_SUPER_ADMIN_PASSWORD?.trim()) {
    password = process.env.SEED_SUPER_ADMIN_PASSWORD.trim();
    passwordSource = 'SEED_SUPER_ADMIN_PASSWORD';
  } else if (getSmtpPassword()) {
    password = getSmtpPassword();
    passwordSource = 'SMTP_PASS';
  }

  return { email, password, emailSource, passwordSource };
}

/** @deprecated use resolveSuperAdminCredentials */
function resolveSuperAdminEmailFromEnv() {
  return resolveSuperAdminCredentials().email;
}

function bundledEmailPresets() {
  return loadBundledEmailPresets();
}

module.exports = {
  normalizeName,
  buildPersonnelEmailIndex,
  resolvePersonEmail,
  rosterEmpId,
  mapRosterLeaves,
  buildRosterUserFields,
  parseEmailFromSmtpFrom,
  resolveSuperAdminCredentials,
  resolveSuperAdminEmailFromEnv,
  bundledEmailPresets,
};
