const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const c = require('../controllers/adminController');
const { protect, admin } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');

const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many PIN attempts. Please try again later.' },
});

router.get('/ptw-audit', protect, requireSuperAdmin, c.getPtwAuditLog);
router.get('/ptw-personnel', protect, c.getPtwPersonnel);
router.post('/ptw-personnel', protect, admin, c.addPtwPersonnel);
router.put('/ptw-personnel/:id', protect, admin, c.updatePtwPersonnel);
router.patch('/ptw-personnel/:id', protect, admin, c.updatePtwPersonnel);
router.delete('/ptw-personnel/:id', protect, admin, c.deletePtwPersonnel);

router.get('/ptw', protect, c.getPtwPersonnel);
router.post('/ptw', protect, admin, c.addPtwPersonnel);
router.patch('/ptw/:id', protect, admin, c.updatePtwPersonnel);
router.delete('/ptw/:id', protect, admin, c.deletePtwPersonnel);

router.get('/status', protect, c.getStatus);
router.get('/config', protect, admin, c.getConfig);
router.post('/set-pin', protect, admin, c.setPin);
router.post('/check-pin', pinLimiter, protect, c.checkPin);
router.post('/set-lock', protect, admin, c.setLock);
router.put('/lock', protect, admin, c.setLock);

router.post('/crews', protect, admin, c.addCrew);
router.delete('/crews/:crew', protect, admin, c.removeCrew);
router.post('/roles', protect, admin, c.addRole);
router.delete('/roles/:role', protect, admin, c.removeRole);

router.post('/crew', protect, admin, c.addCrew);
router.delete('/crew/:crew', protect, admin, c.removeCrew);
router.post('/role', protect, admin, c.addRole);
router.delete('/role/:role', protect, admin, c.removeRole);

router.get('/curriculum', protect, c.getCurriculum);
router.post('/curriculum', protect, admin, c.addCurriculumItem);
router.put('/curriculum/:id', protect, admin, c.updateCurriculumItem);
router.patch('/curriculum/:id', protect, admin, c.updateCurriculumItem);
router.delete('/curriculum/:id', protect, admin, c.deleteCurriculumItem);

router.post('/users/clear-placeholder-emails', protect, admin, c.clearPlaceholderEmails);
router.get('/users', protect, admin, c.getAllUsers);
router.get('/users/pending', protect, admin, c.getPendingUsers);
router.put('/users/:id/approve', protect, admin, c.approveUser);
router.patch('/users/:id/approve', protect, admin, c.approveUser);
router.put('/users/:id/role', protect, admin, c.updateUserRole);
router.patch('/users/:id/role', protect, admin, c.updateUserRole);
router.delete('/users/:id/reject', protect, admin, c.rejectUser);
router.delete('/users/:id', protect, admin, c.rejectUser);

module.exports = router;
