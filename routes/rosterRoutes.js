const express = require('express');
const router = express.Router();
const rosterController = require('../controllers/rosterController');
const { protect, admin } = require('../middleware/auth');
const { checkEditingLock } = require('../middleware/lock');

router.get('/', rosterController.getRoster);
router.post('/', protect, admin, rosterController.createEmployee);
router.put('/:empId', protect, admin, rosterController.updateEmployee);
router.delete('/:empId', protect, admin, rosterController.deleteEmployee);
router.post('/leave', protect, checkEditingLock, rosterController.addLeave);
router.delete('/leave/:employeeId/:leaveId', protect, checkEditingLock, rosterController.removeLeave);

module.exports = router;
