const { isValidEmailFormat } = require('../../utils/placeholderEmail');
const { loadBundledEmailPresets } = require('../../services/emailPresetsService');
const { SUPER_ADMIN_EMAIL } = require('../../config/superAdmin');

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

function resolveSuperAdminEmailFromEnv() {
  const fromEnv = (
    process.env.SUPER_ADMIN_EMAIL
    || process.env.SMTP_USER
    || process.env.EMAIL_USER
    || SUPER_ADMIN_EMAIL
  );
  return String(fromEnv || '').trim().toLowerCase();
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
  resolveSuperAdminEmailFromEnv,
  bundledEmailPresets,
};
