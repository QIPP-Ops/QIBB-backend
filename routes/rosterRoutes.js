const express = require('express');
const router = express.Router();
const rosterController = require('../controllers/rosterController');

router.get('/', rosterController.getRoster);
router.post('/', rosterController.createEmployee);
router.put('/:empId', rosterController.updateEmployee);
router.delete('/:empId', rosterController.deleteEmployee);
router.post('/leave', rosterController.addLeave);
router.delete('/leave/:employeeId/:leaveId', rosterController.removeLeave);

module.exports = router;
