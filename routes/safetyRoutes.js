const express = require('express');
const router = express.Router();
const safetyController = require('../controllers/safetyController');
const { protect } = require('../middleware/auth');

// GET is public so it can be seen on the dashboard/safety page without login
router.get('/dashboard', safetyController.getSafetyDashboard);
router.get('/permits', safetyController.getAllPermits);
router.get('/jhas', safetyController.getJhas);
router.get('/work-orders', safetyController.getWorkOrders);
router.get('/loto-safes', safetyController.getLotoSafes);
router.get('/isolation-points', safetyController.getIsolationPoints);
router.get('/', safetyController.getAllPermits); // Keep default for backward compatibility

// Mutations require protection
router.post('/', protect, safetyController.createPermit);
router.patch('/:id', protect, safetyController.updatePermitStatus);
router.delete('/:id', protect, safetyController.deletePermit);

module.exports = router;
