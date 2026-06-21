const express = require('express');
const { protect, admin } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');
const c = require('../controllers/personnelShiftReportController');
const rosterController = require('../controllers/rosterController');
const settings = require('../controllers/systemSettingsController');
const safetyObservation = require('../controllers/safetyObservationController');
const { hasPortalAdminAccess } = require('../middleware/superAdmin');
const { isPlantManagerFromToken } = require('../middleware/auditLogAccess');

const router = express.Router();

async function blockPlantManagerShiftReport(req, res, next) {
  if (isPlantManagerFromToken(req.user)) {
    return res.status(403).json({ message: 'Plant manager accounts do not use shift reports.' });
  }
  return next();
}

function requirePersonnelInlineEditor(req, res, next) {
  if (hasPortalAdminAccess(req)) return next();
  return res.status(403).json({ message: 'Only administrators may edit personnel profile fields.' });
}

router.get('/settings/email-notifications', protect, requireSuperAdmin, settings.listAdminEmailNotifications);
router.patch('/settings/email-notifications/:userId', protect, requireSuperAdmin, settings.patchAdminEmailNotifications);

router.get('/shift-reports', protect, blockPlantManagerShiftReport, c.listShiftReports);
router.post('/shift-reports', protect, blockPlantManagerShiftReport, c.createShiftReport);
router.put('/shift-reports/:id', protect, blockPlantManagerShiftReport, c.updateShiftReport);
router.get('/shift-reports/:id/audit', protect, admin, c.getShiftReportAudit);

const operationsDashboard = require('../controllers/personnelOperationsDashboardController');
const surveyController = require('../controllers/surveyController');
router.get('/me/operations-dashboard', protect, operationsDashboard.getOperationsDashboard);
router.get('/me/surveys', protect, surveyController.getMyPendingSurveys);
router.post('/me/surveys/:assignmentId/submit', protect, surveyController.submitSurveyResponse);

router.post('/safety-observations', protect, safetyObservation.submitObservation);
router.get('/safety-observations/mine', protect, safetyObservation.listMyObservations);
router.get('/safety-observations/pending', protect, safetyObservation.listPendingReview);
router.patch('/safety-observations/:id/review', protect, safetyObservation.reviewObservation);
router.get('/safety-observations/compliance', protect, admin, safetyObservation.getMonthlyCompliance);
router.post('/safety-observations/reminders', protect, admin, safetyObservation.sendReminders);

router.patch('/:empId', protect, requirePersonnelInlineEditor, rosterController.patchPersonnelInline);

module.exports = router;
