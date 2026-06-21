const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const c = require('../controllers/adminController');
const audit = require('../controllers/auditLogController');
const loginLog = require('../controllers/loginLogController');
const settings = require('../controllers/systemSettingsController');
const leaveAccrual = require('../controllers/leaveAccrualController');
const authController = require('../controllers/authController');
const emailBroadcast = require('../controllers/emailBroadcastController');
const tabVisibility = require('../controllers/tabVisibilityController');
const leaveTimesheetVisibility = require('../controllers/leaveTimesheetVisibilityController');
const orgLayout = require('../controllers/orgLayoutController');
const surveyController = require('../controllers/surveyController');
const groupPreset = require('../controllers/groupPresetController');
const { protect, admin } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');
const { requireAuditLogViewer } = require('../middleware/auditLogAccess');

const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many PIN attempts. Please try again later.' },
});

router.get('/leave-accrual', protect, requireSuperAdmin, leaveAccrual.listAccrualRates);
router.patch('/leave-accrual/bulk', protect, requireSuperAdmin, leaveAccrual.bulkPatchAccrualRates);
router.patch('/leave-accrual/:empId', protect, requireSuperAdmin, leaveAccrual.patchAccrualRates);

router.get('/settings/shift-report-reminders', protect, admin, settings.getShiftReportEmailReminders);
router.patch('/settings/shift-report-reminders/:crew', protect, admin, settings.patchShiftReportReminderForCrew);
router.get('/settings/email-notifications', protect, requireSuperAdmin, settings.listAdminEmailNotifications);
router.patch('/settings/email-notifications/:userId', protect, requireSuperAdmin, settings.patchAdminEmailNotifications);
router.get('/email-presets', protect, requireSuperAdmin, emailBroadcast.listEmailPresets);
router.put('/email-presets', protect, requireSuperAdmin, emailBroadcast.saveEmailPresets);
router.post('/email-broadcast', protect, requireSuperAdmin, emailBroadcast.sendEmailBroadcast);
router.get('/email-domains', protect, requireSuperAdmin, c.getEmailDomains);
router.patch('/email-domains', protect, requireSuperAdmin, c.patchEmailDomains);
router.get('/audit-log', protect, requireAuditLogViewer, audit.getAuditLog);
router.get('/login-logs', protect, requireSuperAdmin, loginLog.getLoginLogs);

router.get('/group-presets', protect, admin, groupPreset.listGroupPresets);
router.put('/group-presets', protect, requireSuperAdmin, groupPreset.saveGroupPresets);
router.patch('/employees/:empId/group', protect, admin, groupPreset.assignEmployeeGroup);

router.get('/org-layout/:crewId', protect, admin, orgLayout.getOrgLayout);
router.patch('/org-layout/:crewId', protect, requireSuperAdmin, orgLayout.patchOrgLayout);
router.delete('/org-layout/:crewId', protect, requireSuperAdmin, orgLayout.resetOrgLayout);

router.get('/surveys', protect, surveyController.listSurveys);
router.post('/surveys', protect, surveyController.createSurvey);
router.post('/surveys/assign', protect, surveyController.assignSurvey);

router.post('/seed-ptw', protect, requireSuperAdmin, c.seedPtwAuthorization);
router.get('/ptw-audit', protect, requireSuperAdmin, c.getPtwAuditLog);
router.get('/ptw-personnel', protect, c.getPtwPersonnel);
router.post('/ptw-personnel', protect, requireSuperAdmin, c.addPtwPersonnel);
router.put('/ptw-personnel/:id', protect, requireSuperAdmin, c.updatePtwPersonnel);
router.patch('/ptw-personnel/:id', protect, requireSuperAdmin, c.updatePtwPersonnel);
router.delete('/ptw-personnel/:id', protect, requireSuperAdmin, c.deletePtwPersonnel);

router.get('/ptw', protect, c.getPtwPersonnel);
router.post('/ptw', protect, requireSuperAdmin, c.addPtwPersonnel);
router.patch('/ptw/:id', protect, requireSuperAdmin, c.updatePtwPersonnel);
router.delete('/ptw/:id', protect, requireSuperAdmin, c.deletePtwPersonnel);

router.get('/status', protect, c.getStatus);
router.get('/config', protect, admin, c.getConfig);
router.post('/set-pin', protect, admin, c.setPin);
router.post('/check-pin', pinLimiter, protect, c.checkPin);
router.post('/set-lock', protect, admin, c.setLock);
router.put('/lock', protect, admin, c.setLock);

router.post('/crews', protect, admin, c.addCrew);
router.patch('/crews/:crewId', protect, requireSuperAdmin, c.patchCrew);
router.delete('/crews/:crew', protect, requireSuperAdmin, c.removeCrew);
router.post('/roles', protect, requireSuperAdmin, c.addRole);
router.patch('/roles/:roleId', protect, requireSuperAdmin, c.patchRole);
router.delete('/roles/:role', protect, requireSuperAdmin, c.removeRole);

router.post('/crew', protect, admin, c.addCrew);
router.delete('/crew/:crew', protect, admin, c.removeCrew);
router.post('/role', protect, admin, c.addRole);
router.delete('/role/:role', protect, admin, c.removeRole);

router.get('/curriculum', protect, c.getCurriculum);
router.post('/curriculum', protect, admin, c.addCurriculumItem);
router.put('/curriculum/:id', protect, admin, c.updateCurriculumItem);
router.patch('/curriculum/:id', protect, admin, c.updateCurriculumItem);
router.delete('/curriculum/:id', protect, admin, c.deleteCurriculumItem);

router.post('/users/clear-placeholder-emails', protect, admin, c.clearPlaceholderEmails);
router.get('/users', protect, admin, c.getAllUsers);
router.get('/users/pending', protect, admin, c.getPendingUsers);
router.put('/users/:id/approve', protect, admin, c.approveUser);
router.patch('/users/:id/approve', protect, admin, c.approveUser);
router.put('/users/:id/role', protect, admin, c.updateUserRole);
router.patch('/users/:id/role', protect, admin, c.updateUserRole);
router.delete('/users/:id/reject', protect, admin, c.rejectUser);
router.delete('/users/:id', protect, admin, c.rejectUser);
router.post('/users/:id/reset-password', protect, requireSuperAdmin, authController.adminResetPassword);
router.get('/users/:id/tab-visibility', protect, requireSuperAdmin, tabVisibility.getUserTabVisibility);
router.patch('/users/:id/tab-visibility', protect, requireSuperAdmin, tabVisibility.patchUserTabVisibility);
router.get('/users/:id/leave-timesheet-visibility', protect, requireSuperAdmin, leaveTimesheetVisibility.getUserLeaveTimesheetVisibility);
router.patch('/users/:id/leave-timesheet-visibility', protect, requireSuperAdmin, leaveTimesheetVisibility.patchUserLeaveTimesheetVisibility);

module.exports = router;
