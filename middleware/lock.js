const AdminConfig = require('../models/AdminConfig');

exports.checkEditingLock = async (req, res, next) => {
  try {
    if (req.user?.role === 'admin') return next();

    const config = await AdminConfig.findOne();
    if (!config) {
      return res.status(503).json({
        message: 'System configuration unavailable. Editing is temporarily disabled.',
      });
    }
    if (config.editingLocked) {
      return res.status(403).json({
        message: 'System is currently locked for editing by administrator.',
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
