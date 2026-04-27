const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, admin } = require('../middleware/auth');

router.get('/status', adminController.getStatus);
router.post('/set-pin', protect, admin, adminController.setPin);
router.post('/check-pin', adminController.checkPin);
router.post('/set-lock', protect, admin, adminController.setLock);

// Dynamic Config Routes
router.get('/config', adminController.getConfig);
router.post('/crews', protect, admin, adminController.addCrew);
router.delete('/crews/:crew', protect, admin, adminController.removeCrew);
router.post('/roles', protect, admin, adminController.addRole);
router.delete('/roles/:role', protect, admin, adminController.removeRole);

module.exports = router;
