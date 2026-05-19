const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { opsLead } = require('../middleware/opsLead');
const c = require('../controllers/rosterOpsController');

router.get('/schedule', protect, c.getSchedule);
router.get('/coverage', protect, opsLead, c.getCoverage);
router.get('/audit', protect, opsLead, c.getAuditLog);
router.post('/shift-override', protect, opsLead, c.setShiftOverride);
router.delete('/shift-override/:empId/:date', protect, opsLead, c.clearShiftOverride);

module.exports = router;
