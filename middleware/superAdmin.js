const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');

function superAdminEmail() {
  return SUPER_ADMIN_EMAIL;
}

function isSuperAdmin(req) {
  const e = req.user?.email ? String(req.user.email).trim().toLowerCase() : '';
  return e && e === superAdminEmail();
}

exports.superAdminEmail = superAdminEmail;
exports.isSuperAdmin = isSuperAdmin;

exports.requireSuperAdmin = (req, res, next) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      message: 'Only the designated super administrator may perform this action.',
    });
  }
  next();
};
