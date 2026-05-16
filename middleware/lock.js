const AdminConfig = require('../models/AdminConfig');

exports.checkEditingLock = async (req, res, next) => {
  try {
    // Admins always bypass the lock
    if (req.user?.role === 'admin') return next();

    const config = await AdminConfig.findOne();
    if (config?.editingLocked) {
      return res.status(403).json({ 
        message: 'System is currently locked for editing by administrator.' 
      });
    }
    next();
  } catch (err) {
    // If config lookup fails, don't block the request — fail open
    console.error('Lock check error:', err.message);
    next();
  }
};
