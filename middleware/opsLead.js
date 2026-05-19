const AdminUser = require('../models/AdminUser');
const { userCanAccessOpsTools } = require('../services/shiftScheduleService');

/** Admin accessRole OR management job roles (Supervisor, Shift in Charge, etc.) */
exports.opsLead = async (req, res, next) => {
  try {
    if (req.user?.role === 'admin') {
      req.dbUser = await AdminUser.findById(req.user.id).select('-passwordHash');
      return next();
    }
    const dbUser = await AdminUser.findById(req.user.id).select('-passwordHash');
    if (!dbUser) {
      return res.status(401).json({ message: 'User not found.' });
    }
    if (!userCanAccessOpsTools(dbUser)) {
      return res.status(403).json({
        message: 'Access denied. Administrator or management role required.',
      });
    }
    req.dbUser = dbUser;
    next();
  } catch (err) {
    res.status(500).json({ message: 'Authorization check failed.', error: err.message });
  }
};
