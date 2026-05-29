const AdminConfig = require('../models/AdminConfig');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function findPtwPersonForUser(user) {
  if (!user) return null;
  const config = await AdminConfig.findOne().lean();
  if (!config?.ptwPersonnel?.length) return null;

  const email = normalizeEmail(user.email);
  const name = normalizeName(user.name);

  const empId = String(user.empId || '').trim();

  return config.ptwPersonnel.find((p) => {
    if (empId && String(p.empId || '').trim() === empId) return true;
    if (empId && String(p.empNo || '').trim() === empId) return true;
    if (p.email && normalizeEmail(p.email) === email) return true;
    if (p.name && normalizeName(p.name) === name) return true;
    return false;
  }) || null;
}

function hasAuth(person, ...keys) {
  if (!person?.authorizations?.length) return false;
  const set = new Set(person.authorizations);
  return keys.some((k) => set.has(k));
}

/** Any listed PTW authorization grants portal access. */
async function requirePtwAccess(req, res, next) {
  try {
    const { hasPortalAdminAccess } = require('./superAdmin');
    if (hasPortalAdminAccess(req)) {
      req.ptwPerson = { name: req.user.name, authorizations: ['admin'] };
      return next();
    }
    const person = await findPtwPersonForUser(req.user);
    if (!person) {
      return res.status(403).json({
        message: 'You are not on the PTW authorization list. Contact the Safety Coordinator.',
        code: 'PTW_NOT_AUTHORIZED',
      });
    }
    req.ptwPerson = person;
    return next();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

module.exports = {
  findPtwPersonForUser,
  hasAuth,
  requirePtwAccess,
};
