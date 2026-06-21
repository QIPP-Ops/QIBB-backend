const { isSuperAdmin } = require('./superAdmin');

function isPlantManagerFromToken(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (role.includes('plant manager') || role.includes('operations manager')) return true;
  const blob = `${user.name || ''} ${user.fullName || ''}`.toLowerCase();
  return blob.includes('bandar') && (blob.includes('aldogaish') || blob.includes('aldogais'));
}

function requireAuditLogViewer(req, res, next) {
  if (isSuperAdmin(req)) return next();
  if (isPlantManagerFromToken(req.user)) return next();
  return res.status(403).json({
    message: 'Audit log access is restricted to super administrators and the plant manager.',
  });
}

module.exports = { requireAuditLogViewer, isPlantManagerFromToken };
