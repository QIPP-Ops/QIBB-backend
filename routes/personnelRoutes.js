const express = require('express');
const { protect } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');
const c = require('../controllers/personnelShiftReportController');

const router = express.Router();

router.get('/shift-reports', protect, c.listShiftReports);
router.post('/shift-reports', protect, c.createShiftReport);
router.put('/shift-reports/:id', protect, c.updateShiftReport);
router.get('/shift-reports/:id/audit', protect, requireSuperAdmin, c.getShiftReportAudit);

module.exports = router;
