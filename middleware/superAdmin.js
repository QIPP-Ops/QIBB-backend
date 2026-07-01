const {
  SUPER_ADMIN_EMAIL,
  MOHAMMAD_ALGARNI_EMAILS,
} = require('../config/superAdmin');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function resolveUser(reqOrUser) {
  if (!reqOrUser) return null;
  if (reqOrUser.user) return reqOrUser.user;
  return reqOrUser;
}

function superAdminEmail() {
  return SUPER_ADMIN_EMAIL;
}

function isPrimarySuperAdminUser(user) {
  const e = normalizeEmail(user?.email);
  return Boolean(e && e === superAdminEmail());
}

/** Full super-admin privileges — primary account or delegated `superAdmin` flag. */
function isSuperAdmin(req) {
  const user = resolveUser(req);
  if (!user) return false;
  if (isPrimarySuperAdminUser(user)) return true;
  return Boolean(user.superAdmin);
}

/** Alias used across controllers/middleware. */
function isSuperAdminUser(req) {
  return isSuperAdmin(req);
}

/** Mohammad Algarni — sole manager of delegated super-admin access. */
function isMohammadAlgarniUser(user) {
  const row = resolveUser(user);
  if (!row) return false;
  const email = normalizeEmail(row.email);
  if (email && MOHAMMAD_ALGARNI_EMAILS.has(email)) return true;
  const blob = [row.name, row.displayName, row.fullName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return blob.includes('algarni') || blob.includes('al garni');
}

function canManageSuperAdminAccess(req) {
  return isMohammadAlgarniUser(req);
}

/** Portal admin routes — super admin always has full admin access. */
function hasPortalAdminAccess(req) {
  if (isSuperAdmin(req)) return true;
  const user = resolveUser(req);
  return user?.role === 'admin' || user?.accessRole === 'admin';
}

exports.superAdminEmail = superAdminEmail;
exports.isPrimarySuperAdminUser = isPrimarySuperAdminUser;
exports.isSuperAdmin = isSuperAdmin;
exports.isSuperAdminUser = isSuperAdminUser;
exports.isMohammadAlgarniUser = isMohammadAlgarniUser;
exports.canManageSuperAdminAccess = canManageSuperAdminAccess;
exports.hasPortalAdminAccess = hasPortalAdminAccess;

exports.requireSuperAdmin = (req, res, next) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      message: 'Only the designated super administrator may perform this action.',
    });
  }
  next();
};

exports.requireSuperAdminManager = (req, res, next) => {
  if (!canManageSuperAdminAccess(req)) {
    return res.status(403).json({
      message: 'Only Mohammad Algarni may manage super administrator access.',
    });
  }
  next();
};
