const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');
const reportController = require('../controllers/reportController');

router.get('/staffing-conflicts', protect, reportController.getStaffingConflicts);

router.use(protect, requireSuperAdmin);

router.get('/leave-summary', reportController.getLeaveSummary);
router.get('/attendance', reportController.getAttendanceReport);
router.get('/balance-snapshot', reportController.getBalanceSnapshot);
router.get('/kpi-scores', reportController.getKpiScores);
router.get('/balance-history', reportController.getBalanceHistory);

module.exports = router;
