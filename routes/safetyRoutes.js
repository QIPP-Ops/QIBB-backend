const express = require('express');
const router = express.Router();
const safetyController = require('../controllers/safetyController');
const { protect } = require('../middleware/auth');

// GET is public so it can be seen on the dashboard/safety page without login
router.get('/', safetyController.getAllPermits);

// Mutations require protection
router.post('/', protect, safetyController.createPermit);
router.patch('/:id', protect, safetyController.updatePermitStatus);
router.delete('/:id', protect, safetyController.deletePermit);

module.exports = router;
