const express        = require('express');
const router         = express.Router();
const authController = require('../controllers/authController');
const { protect, admin } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');

router.get('/register-options',                   authController.getRegisterOptions);
router.post('/register',                          authController.register);
router.post('/login',                             authController.login);
router.get('/me',               protect,          authController.me);
router.get('/verify',           protect,          authController.verify);

// ─── Email OTP ───────────────────────────────────────────────────────────────
router.post('/verify-otp',                        authController.verifyOtp);
router.post('/resend-otp',                        authController.resendOtp);

// ─── Password Reset ──────────────────────────────────────────────────────────
router.post('/forgot-password',                   authController.forgotPassword);
router.post('/reset-password',                    authController.resetPassword);
router.post('/change-password', protect,          authController.changePassword);
router.patch('/profile', protect,                 authController.updateProfile);

// ─── Admin Force-Reset & Access Control ──────────────────────────────────────
router.post('/admin/reset-password/:userId', protect, requireSuperAdmin, authController.adminResetPassword);
router.patch('/admin/revoke-access/:userId', protect, requireSuperAdmin, authController.adminRevokeAccess);
router.post('/admin-reset/:id', protect, requireSuperAdmin, authController.adminResetPassword);

module.exports = router;
