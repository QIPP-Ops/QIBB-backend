const express = require('express');
const router = express.Router();
const rosterController = require('../controllers/rosterController');
const { protect, admin } = require('../middleware/auth');

router.get('/', rosterController.getRoster);
router.post('/', protect, admin, rosterController.createEmployee);
router.put('/:empId', protect, admin, rosterController.updateEmployee);
router.delete('/:empId', protect, admin, rosterController.deleteEmployee);
router.post('/leave', protect, rosterController.addLeave);
router.delete('/leave/:employeeId/:leaveId', protect, rosterController.removeLeave);

module.exports = router;
