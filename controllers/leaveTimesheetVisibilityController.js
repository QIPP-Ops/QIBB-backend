const AdminUser = require('../models/AdminUser');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const { isProtectedAccountEmail } = require('../utils/protectedAccounts');

exports.getUserLeaveTimesheetVisibility = async (req, res) => {
  try {
    const user = await AdminUser.findById(req.params.id)
      .select('name email hiddenFromLeaveTimesheet')
      .lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json({
      userId: user._id,
      name: user.name,
      email: user.email,
      hiddenFromLeaveTimesheet: Boolean(user.hiddenFromLeaveTimesheet),
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching leave timesheet visibility', error: err.message });
  }
};

exports.patchUserLeaveTimesheetVisibility = async (req, res) => {
  try {
    const hidden = req.body?.hiddenFromLeaveTimesheet;
    if (typeof hidden !== 'boolean') {
      return res.status(400).json({ message: 'hiddenFromLeaveTimesheet boolean is required.' });
    }

    const user = await AdminUser.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (isProtectedAccountEmail(user.email)) {
      return res.status(403).json({ message: 'Leave timesheet visibility cannot be changed for the super-admin account.' });
    }

    const before = Boolean(user.hiddenFromLeaveTimesheet);
    user.hiddenFromLeaveTimesheet = hidden;
    await user.save();

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.LEAVE_TIMESHEET_VISIBILITY_CHANGED,
      targetType: 'admin_user',
      targetId: user._id?.toString(),
      targetName: user.name,
      before: { hiddenFromLeaveTimesheet: before },
      after: { hiddenFromLeaveTimesheet: hidden },
      req,
    });

    res.json({
      userId: user._id,
      name: user.name,
      email: user.email,
      hiddenFromLeaveTimesheet: Boolean(user.hiddenFromLeaveTimesheet),
    });
  } catch (err) {
    res.status(500).json({ message: 'Error updating leave timesheet visibility', error: err.message });
  }
};
