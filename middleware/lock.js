const AdminConfig = require('../models/AdminConfig');

exports.checkEditingLock = async (req, res, next) => {
  try {
    const { hasPortalAdminAccess } = require('./superAdmin');
    if (hasPortalAdminAccess(req)) return next();

    const config = await AdminConfig.findOne();
    if (!config) {
      return res.status(503).json({
        message: 'System configuration unavailable. Editing is temporarily disabled.',
      });
    }
    if (config.editingLocked) {
      return res.status(403).json({
        message: 'The roster is currently locked by the administrator.',
      });
    }
    next();
  } catch (err) {
    console.error('Lock check error:', err.message);
    return res.status(503).json({
      message: 'Unable to verify editing lock. Request denied.',
    });
  }
};
