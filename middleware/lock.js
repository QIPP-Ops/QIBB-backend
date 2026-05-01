const AdminConfig = require('../models/AdminConfig');

exports.checkEditingLock = async (req, res, next) => {
  try {
    const config = await AdminConfig.findOne();
    const isLocked = config && config.editingLocked;
    
    const isAdmin = req.user && req.user.role === 'admin';
    const targetEmpId = req.body.employeeId || req.params.employeeId;
    const isOwner = req.user && req.user.empId && targetEmpId && req.user.empId === targetEmpId;

    // 1. Administrators can always edit anything
    if (isAdmin) return next();

    // 2. If locked, non-admins are strictly blocked
    if (isLocked) {
      return res.status(403).json({ message: 'Roster editing is currently locked by administration.' });
    }

    // 3. If NOT locked, non-admins can only edit their own roster
    if (!isOwner) {
      return res.status(403).json({ message: 'Permission Denied: You can only manage your own roster entries.' });
    }

    next();
  } catch (err) {
    res.status(500).json({ message: 'Error checking editing lock', error: err.message });
  }
};
