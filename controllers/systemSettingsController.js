const {
  isShiftReportEmailRemindersEnabled,
  setShiftReportEmailRemindersEnabled,
} = require('../services/systemSettingsService');
const {
  listPortalAdminsForToggle,
  setReceiveEmailNotifications,
} = require('../services/adminEmailService');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

exports.getShiftReportEmailReminders = async (req, res) => {
  try {
    const enabled = await isShiftReportEmailRemindersEnabled();
    res.json({ key: 'shiftReportEmailReminders', value: enabled });
  } catch (err) {
    res.status(500).json({ message: 'Error reading setting', error: err.message });
  }
};

exports.patchShiftReportEmailReminders = async (req, res) => {
  try {
    const enabled = req.body?.value !== undefined ? Boolean(req.body.value) : Boolean(req.body.enabled);
    await setShiftReportEmailRemindersEnabled(enabled);
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.NOTIFICATION_SETTINGS_CHANGED,
      targetType: 'settings',
      targetId: 'shiftReportEmailReminders',
      targetName: 'Shift report reminders',
      after: { enabled },
      req,
    });
    res.json({ key: 'shiftReportEmailReminders', value: enabled });
  } catch (err) {
    res.status(500).json({ message: 'Error updating setting', error: err.message });
  }
};

exports.listAdminEmailNotifications = async (req, res) => {
  try {
    const admins = await listPortalAdminsForToggle();
    res.json({
      admins: admins.map((a) => ({
        userId: a._id,
        name: a.name,
        email: a.email,
        empId: a.empId,
        receiveEmailNotifications: Boolean(a.receiveEmailNotifications),
      })),
    });
  } catch (err) {
    res.status(500).json({ message: 'Error listing admins', error: err.message });
  }
};

exports.patchAdminEmailNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    const enabled =
      req.body?.receiveEmailNotifications !== undefined
        ? Boolean(req.body.receiveEmailNotifications)
        : Boolean(req.body.value);

    const user = await setReceiveEmailNotifications(userId, enabled);
    if (!user) {
      return res.status(404).json({ message: 'Admin user not found.' });
    }
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.NOTIFICATION_SETTINGS_CHANGED,
      targetType: 'admin_user',
      targetId: user._id?.toString(),
      targetName: user.name,
      after: { receiveEmailNotifications: Boolean(user.receiveEmailNotifications) },
      req,
    });

    res.json({
      userId: user._id,
      name: user.name,
      email: user.email,
      empId: user.empId,
      receiveEmailNotifications: Boolean(user.receiveEmailNotifications),
    });
  } catch (err) {
    res.status(500).json({ message: 'Error updating preference', error: err.message });
  }
};
