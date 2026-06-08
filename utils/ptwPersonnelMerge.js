const { resolveDeliverableEmail } = require('../services/personnelEmailLookup');
const { isPlaceholderEmail } = require('./placeholderEmail');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function normalizePtwName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '')
    .trim();
}

function nameTokens(value) {
  return normalizePtwName(value).split(' ').filter(Boolean);
}

function namesFuzzyMatch(a, b) {
  const na = normalizePtwName(a);
  const nb = normalizePtwName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.replace(/\s/g, '') === nb.replace(/\s/g, '')) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;

  const shared = ta.filter((t) => tb.includes(t));
  const minLen = Math.min(ta.length, tb.length);
  return shared.length >= Math.max(2, minLen - 1);
}

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseValidUntil(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(`${s.slice(0, 10)}T12:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) {
    const d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), 12));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatExpiryDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getUTCDate();
  const mon = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${mon} ${year}`;
}

function formatValidUntilDisplay(raw) {
  const d = parseValidUntil(raw);
  if (!d) return raw ? String(raw).trim() : '';
  return formatExpiryDate(d);
}

function daysUntil(from, to) {
  const ms = startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime();
  return Math.round(ms / 86400000);
}

function computePtwExpiryInfo(validUntil, now = new Date()) {
  const expiry = parseValidUntil(validUntil);
  if (!expiry) {
    return {
      validUntil: validUntil ? String(validUntil).trim() : null,
      validUntilFormatted: validUntil ? String(validUntil).trim() : null,
      daysUntilExpiry: null,
      expiringWithin30: false,
      expiringWithin60: false,
      expired: false,
    };
  }

  const daysLeft = daysUntil(now, expiry);
  return {
    validUntil: expiry.toISOString().slice(0, 10),
    validUntilFormatted: formatExpiryDate(expiry),
    daysUntilExpiry: daysLeft,
    expiringWithin30: daysLeft >= 0 && daysLeft <= 30,
    expiringWithin60: daysLeft >= 0 && daysLeft <= 60,
    expired: daysLeft < 0,
  };
}

function findPtwPersonInList(user, ptwPersonnel) {
  if (!user || !ptwPersonnel?.length) return null;

  const empId = String(user.empId || '').trim();
  const email = String(user.email || '').trim().toLowerCase();

  if (empId) {
    const byEmp = ptwPersonnel.find((p) => {
      const pEmp = String(p.empId || p.empNo || '').trim();
      return pEmp && pEmp === empId;
    });
    if (byEmp) return byEmp;
  }

  if (email) {
    const byEmail = ptwPersonnel.find((p) => {
      const pEmail = String(p.email || '').trim().toLowerCase();
      return pEmail && pEmail === email;
    });
    if (byEmail) return byEmail;
  }

  const exact = ptwPersonnel.find((p) => normalizePtwName(p.name) === normalizePtwName(user.name));
  if (exact) return exact;

  return ptwPersonnel.find((p) => namesFuzzyMatch(p.name, user.name)) || null;
}

function findAdminUserForPtwPerson(person, users) {
  if (!person || !users?.length) return null;

  const empId = String(person.empId || person.empNo || '').trim();
  if (empId) {
    const byEmp = users.find((u) => String(u.empId || '').trim() === empId);
    if (byEmp) return byEmp;
  }

  const email = String(person.email || person.notifyEmail || '').trim();
  if (email) {
    const byEmail = users.find(
      (u) => String(u.email || '').trim().toLowerCase() === email.toLowerCase()
    );
    if (byEmail) return byEmail;
  }

  const exact = users.find((u) => normalizePtwName(u.name) === normalizePtwName(person.name));
  if (exact) return exact;

  return users.find((u) => namesFuzzyMatch(u.name, person.name)) || null;
}

function resolveMemberEmail(adminUser, ptwPerson) {
  const notify = String(ptwPerson?.notifyEmail || '').trim();
  if (notify && !isPlaceholderEmail(notify)) return notify;

  if (adminUser) {
    const resolved = resolveDeliverableEmail(adminUser);
    if (resolved) return resolved;
    const stored = String(adminUser.email || '').trim();
    if (stored && !isPlaceholderEmail(stored)) return stored;
  }

  const ptwEmail = String(ptwPerson?.email || '').trim();
  if (ptwEmail && !isPlaceholderEmail(ptwEmail)) return ptwEmail;

  return '';
}

function mergePtwWithRosterMember(ptwPerson, adminUser, now = new Date()) {
  const expiry = computePtwExpiryInfo(ptwPerson?.validUntil, now);
  const email = resolveMemberEmail(adminUser, ptwPerson);
  const rosterOnPtw = Boolean(ptwPerson);
  const ptwOnRoster = Boolean(adminUser);

  return {
    name: ptwPerson?.name || adminUser?.name || '',
    empId: adminUser?.empId || ptwPerson?.empId || ptwPerson?.empNo || '',
    crew: adminUser?.crew || ptwPerson?.crew || '',
    role: adminUser?.role || ptwPerson?.designation || '',
    email: email || null,
    authorizations: ptwPerson?.authorizations || [],
    validUntil: expiry.validUntil,
    validUntilFormatted: expiry.validUntilFormatted,
    daysUntilExpiry: expiry.daysUntilExpiry,
    expiringWithin30: expiry.expiringWithin30,
    expiringWithin60: expiry.expiringWithin60,
    expired: expiry.expired,
    missingEmail: !email,
    rosterMismatch: rosterOnPtw !== ptwOnRoster
      ? (rosterOnPtw ? 'ptw_only' : 'roster_only')
      : null,
    matchedBy: ptwPerson && adminUser ? 'merged' : ptwPerson ? 'ptw_only' : 'roster_only',
  };
}

module.exports = {
  normalizePtwName,
  namesFuzzyMatch,
  parseValidUntil,
  formatExpiryDate,
  formatValidUntilDisplay,
  daysUntil,
  computePtwExpiryInfo,
  findPtwPersonInList,
  findAdminUserForPtwPerson,
  resolveMemberEmail,
  mergePtwWithRosterMember,
};
