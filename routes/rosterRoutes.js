const express = require('express');
const router = express.Router();
const c = require('../controllers/rosterController');
const { protect, admin } = require('../middleware/auth');
const { checkEditingLock } = require('../middleware/lock');

router.get('/', c.getRoster);
router.post('/', protect, admin, c.createEmployee);
router.put('/:empId', protect, admin, c.updateEmployee);
router.delete('/:empId', protect, admin, c.deleteEmployee);
router.post('/leave', protect, checkEditingLock, c.addLeave);
router.delete('/leave/:employeeId/:leaveId', protect, checkEditingLock, c.removeLeave);
// KPIs
router.post('/:empId/kpi', protect, c.addKpi);
router.patch('/:empId/kpi/:kpiId', protect, c.updateKpi);
router.delete('/:empId/kpi/:kpiId', protect, admin, c.deleteKpi);
// ICS Calendar
router.get('/:empId/calendar.ics', c.exportIcs);
module.exports = router;