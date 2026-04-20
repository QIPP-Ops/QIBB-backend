const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/register', authController.register); // Remove or protect after first admin
router.post('/login', authController.login);
router.get('/verify', auth, authController.verify);

module.exports = router;
