const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');
const reportController = require('../controllers/reportController');

router.use(protect, requireSuperAdmin);

router.get('/leave-summary', reportController.getLeaveSummary);
router.get('/attendance', reportController.getAttendanceReport);
router.get('/balance-snapshot', reportController.getBalanceSnapshot);
router.get('/staffing-conflicts', reportController.getStaffingConflicts);
router.get('/kpi-scores', reportController.getKpiScores);
router.get('/balance-history', reportController.getBalanceHistory);

module.exports = router;
