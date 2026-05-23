const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');

function superAdminEmail() {
  return SUPER_ADMIN_EMAIL;
}

function isSuperAdmin(req) {
  const e = req.user?.email ? String(req.user.email).trim().toLowerCase() : '';
  return e && e === superAdminEmail();
}

/** Alias used across controllers/middleware. */
function isSuperAdminUser(req) {
  return isSuperAdmin(req);
}

/** Portal admin routes — super admin always has full admin access. */
function hasPortalAdminAccess(req) {
  if (isSuperAdmin(req)) return true;
  return req.user?.role === 'admin' || req.user?.accessRole === 'admin';
}

exports.superAdminEmail = superAdminEmail;
exports.isSuperAdmin = isSuperAdmin;
exports.isSuperAdminUser = isSuperAdminUser;
exports.hasPortalAdminAccess = hasPortalAdminAccess;

exports.requireSuperAdmin = (req, res, next) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      message: 'Only the designated super administrator may perform this action.',
    });
  }
  next();
};
