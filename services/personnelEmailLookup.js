const personnelEmails = require('../data/personnel-emails.json');
const { isPlaceholderEmail, isValidEmailFormat } = require('../utils/placeholderEmail');

let byEmpId = null;
let byName = null;
let rowsCache = null;

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(value) {
  return normalizeName(value).split(' ').filter(Boolean);
}

function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;

  const shared = ta.filter((t) => tb.includes(t));
  const minLen = Math.min(ta.length, tb.length);
  return shared.length >= Math.max(2, minLen - 1);
}

function loadIndexes() {
  if (byEmpId) return;
  byEmpId = new Map();
  byName = new Map();
  rowsCache = [];
  for (const row of personnelEmails) {
    const email = String(row.email || '').trim().toLowerCase();
    if (!email || !isValidEmailFormat(email)) continue;
    rowsCache.push(row);
    const empId = String(row.empId || '').trim();
    if (empId) byEmpId.set(empId, email);
    const nameKey = normalizeName(row.name);
    if (nameKey) byName.set(nameKey, email);
  }
}

function resetPersonnelEmailIndexes() {
  byEmpId = null;
  byName = null;
  rowsCache = null;
}

/**
 * Resolve a deliverable address for broadcast/notifications.
 * Maps seeded @roster.acwaops.local placeholders to personnel-emails.json.
 */
function resolveDeliverableEmail(user) {
  loadIndexes();
  const stored = String(user?.email || '').trim();
  if (stored && !isPlaceholderEmail(stored) && isValidEmailFormat(stored)) {
    return stored.toLowerCase();
  }

  const empId = String(user?.empId || '').trim();
  if (empId && byEmpId.has(empId)) return byEmpId.get(empId);

  for (const key of [user?.name, user?.fullName]) {
    const nameKey = normalizeName(key);
    if (nameKey && byName.has(nameKey)) return byName.get(nameKey);
  }

  for (const row of rowsCache || []) {
    const email = String(row.email || '').trim().toLowerCase();
    if (!email || !isValidEmailFormat(email)) continue;
    if (
      namesMatch(user?.name, row.name) ||
      namesMatch(user?.fullName, row.name)
    ) {
      return email;
    }
  }

  return '';
}

/**
 * Replace placeholder roster emails with personnel-emails.json matches.
 */
function syncPlaceholderEmailForUser(user) {
  if (!user || !isPlaceholderEmail(user.email)) {
    return { updated: false, email: user?.email || '' };
  }
  const resolved = resolveDeliverableEmail(user);
  if (resolved && resolved !== user.email) {
    return { updated: true, email: resolved };
  }
  return { updated: false, email: user.email };
}

module.exports = {
  resolveDeliverableEmail,
  syncPlaceholderEmailForUser,
  resetPersonnelEmailIndexes,
  normalizeName,
  namesMatch,
};
