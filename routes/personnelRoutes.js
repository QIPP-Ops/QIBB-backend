const express = require('express');
const { protect, admin } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');
const c = require('../controllers/personnelShiftReportController');
const rosterController = require('../controllers/rosterController');
const settings = require('../controllers/systemSettingsController');
const { hasPortalAdminAccess } = require('../middleware/superAdmin');

const router = express.Router();

router.get('/settings/email-notifications', protect, requireSuperAdmin, settings.listAdminEmailNotifications);
router.patch('/settings/email-notifications/:userId', protect, requireSuperAdmin, settings.patchAdminEmailNotifications);

router.get('/shift-reports', protect, c.listShiftReports);
router.post('/shift-reports', protect, c.createShiftReport);
router.put('/shift-reports/:id', protect, c.updateShiftReport);
router.get('/shift-reports/:id/audit', protect, admin, c.getShiftReportAudit);

const operationsDashboard = require('../controllers/personnelOperationsDashboardController');
router.get('/me/operations-dashboard', protect, operationsDashboard.getOperationsDashboard);

function requirePersonnelInlineEditor(req, res, next) {
  if (hasPortalAdminAccess(req)) return next();
  return res.status(403).json({ message: 'Only administrators may edit personnel profile fields.' });
}

router.patch('/:empId', protect, requirePersonnelInlineEditor, rosterController.patchPersonnelInline);

module.exports = router;
