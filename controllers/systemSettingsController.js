const AdminConfig = require('../models/AdminConfig');
const { isSuperAdmin } = require('../middleware/superAdmin');
const {
  getShiftReportRemindersByCrewMap,
  setShiftReportReminderForCrew,
} = require('../services/systemSettingsService');
const {
  listPortalAdminsForToggle,
  setReceiveEmailNotifications,
} = require('../services/adminEmailService');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

function crewsVisibleToActor(req, availableCrews) {
  if (isSuperAdmin(req)) return availableCrews;
  const userCrew = req.user?.crew;
  if (userCrew && availableCrews.includes(userCrew)) return [userCrew];
  return [];
}

function canManageCrewReminders(req, crew) {
  if (isSuperAdmin(req)) return true;
  return Boolean(req.user?.crew && req.user.crew === crew);
}

exports.getShiftReportEmailReminders = async (req, res) => {
  try {
    const config = await AdminConfig.findOne().lean();
    const availableCrews = config?.availableCrews || ['A', 'B', 'C', 'D', 'General', 'S'];
    const map = await getShiftReportRemindersByCrewMap();
    const visible = crewsVisibleToActor(req, availableCrews);

    res.json({
      crews: visible.map((crew) => ({
        crew,
        enabled: map[crew] === true,
        editable: canManageCrewReminders(req, crew),
      })),
    });
  } catch (err) {
    res.status(500).json({ message: 'Error reading setting', error: err.message });
  }
};

exports.patchShiftReportReminderForCrew = async (req, res) => {
  try {
    const crew = String(req.params.crew || '').trim();
    if (!crew) {
      return res.status(400).json({ message: 'Crew is required.' });
    }

    if (!canManageCrewReminders(req, crew)) {
      return res.status(403).json({
        message: 'You may only change shift report reminders for your own crew.',
      });
    }

    const enabled =
      req.body?.value !== undefined ? Boolean(req.body.value) : Boolean(req.body.enabled);

    await setShiftReportReminderForCrew(crew, enabled);
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.NOTIFICATION_SETTINGS_CHANGED,
      targetType: 'settings',
      targetId: `shiftReportEmailReminders:${crew}`,
      targetName: `Shift report reminders (${crew})`,
      after: { crew, enabled },
      req,
    });

    res.json({ crew, enabled });
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
