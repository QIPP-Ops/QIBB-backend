const express        = require('express');
const router         = express.Router();
const authController = require('../controllers/authController');
const { protect, admin } = require('../middleware/auth');

router.post('/register',                          authController.register);
router.post('/login',                             authController.login);
router.get('/verify',           protect,          authController.verify);

// ─── Email OTP ───────────────────────────────────────────────────────────────
router.post('/verify-otp',                        authController.verifyOtp);
router.post('/resend-otp',                        authController.resendOtp);

// ─── Password Reset ──────────────────────────────────────────────────────────
router.post('/forgot-password',                   authController.forgotPassword);
router.post('/reset-password',                    authController.resetPassword);

// ─── Admin Force-Reset ───────────────────────────────────────────────────────
router.post('/admin-reset/:id', protect, admin,   authController.adminResetPassword);

module.exports = router;
