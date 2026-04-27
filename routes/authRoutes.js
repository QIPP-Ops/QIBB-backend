const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', authController.register); 
router.post('/login', authController.login);
router.get('/verify', protect, authController.verify);

module.exports = router;
