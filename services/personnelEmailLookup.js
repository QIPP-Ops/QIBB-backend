const personnelEmails = require('../data/personnel-emails.json');
const { isPlaceholderEmail, isValidEmailFormat } = require('../utils/placeholderEmail');

let byEmpId = null;
let byName = null;

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
  for (const row of personnelEmails) {
    const email = String(row.email || '').trim().toLowerCase();
    if (!email || !isValidEmailFormat(email)) continue;
    const empId = String(row.empId || '').trim();
    if (empId) byEmpId.set(empId, email);
    const nameKey = normalizeName(row.name);
    if (nameKey) byName.set(nameKey, email);
  }
}

function resetPersonnelEmailIndexes() {
  byEmpId = null;
  byName = null;
}

/**
 * Resolve a deliverable @nomac.com (or real) address for broadcast/notifications.
 * Falls back to bundled personnel-emails.json when Mongo has placeholder roster emails.
 */
function resolveDeliverableEmail(user) {
  loadIndexes();
  const stored = String(user?.email || '').trim();
  if (stored && !isPlaceholderEmail(stored) && isValidEmailFormat(stored)) {
    return stored.toLowerCase();
  }

  const empId = String(user?.empId || '').trim();
  if (empId && byEmpId.has(empId)) return byEmpId.get(empId);

  const nameKey = normalizeName(user?.name);
  if (nameKey && byName.has(nameKey)) return byName.get(nameKey);

  // Fuzzy fallback only for multi-token names — avoids "Ali" matching "Izhar Ali".
  if (nameTokens(user?.name).length < 2) return '';

  for (const row of personnelEmails) {
    if (namesMatch(user?.name, row.name)) {
      const email = String(row.email || '').trim().toLowerCase();
      if (email && isValidEmailFormat(email)) return email;
    }
  }

  return '';
}

module.exports = {
  resolveDeliverableEmail,
  resetPersonnelEmailIndexes,
  normalizeName,
  namesMatch,
};
