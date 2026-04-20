const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

router.get('/status', adminController.getStatus);
router.post('/set-pin', adminController.setPin);
router.post('/check-pin', adminController.checkPin);
router.post('/set-lock', adminController.setLock);

module.exports = router;
