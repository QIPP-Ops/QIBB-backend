const { canViewAuditLogs, canViewLoginLogs } = require('../utils/logAccessPermissions');
const { isPlantManagerFromToken } = require('../services/plantManagerService');

function requireAuditLogViewer(req, res, next) {
  if (!canViewAuditLogs(req)) {
    return res.status(403).json({
      message:
        'Audit log access is restricted to super administrators, the plant manager, and crew administrators.',
    });
  }
  return next();
}

function requireLoginLogViewer(req, res, next) {
  if (!canViewLoginLogs(req)) {
    return res.status(403).json({
      message:
        'Login log access is restricted to super administrators, the plant manager, and crew administrators.',
    });
  }
  return next();
}

module.exports = {
  requireAuditLogViewer,
  requireLoginLogViewer,
  isPlantManagerFromToken,
};
