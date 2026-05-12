const express = require('express');
const router = express.Router();
const c = require('../controllers/adminController');
const { protect, admin } = require('../middleware/auth');

// PTW Personnel (4 functions)
router.get('/ptw', c.getPtwPersonnel);
router.post('/ptw', protect, admin, c.addPtwPersonnel);
router.patch('/ptw/:id', protect, admin, c.updatePtwPersonnel);
router.delete('/ptw/:id', protect, admin, c.deletePtwPersonnel);

// Config & Settings (5 functions)
router.get('/status', c.getStatus);
router.get('/config', c.getConfig);
router.post('/set-pin', protect, admin, c.setPin);
router.post('/check-pin', c.checkPin);
router.post('/set-lock', protect, admin, c.setLock);

// Crews & Roles (4 functions)
router.post('/crews', protect, admin, c.addCrew);
router.delete('/crews/:crew', protect, admin, c.removeCrew);
router.post('/roles', protect, admin, c.addRole);
router.delete('/roles/:role', protect, admin, c.removeRole);

// Curriculum (4 functions)
router.get('/curriculum', c.getCurriculum);
router.post('/curriculum', protect, admin, c.addCurriculumItem);
router.patch('/curriculum/:id', protect, admin, c.updateCurriculumItem);
router.delete('/curriculum/:id', protect, admin, c.deleteCurriculumItem);

// User Management (5 functions)
router.get('/users', protect, admin, c.getAllUsers);
router.get('/users/pending', protect, admin, c.getPendingUsers);
router.patch('/users/:id/approve', protect, admin, c.approveUser);
router.patch('/users/:id/role', protect, admin, c.updateUserRole);
router.delete('/users/:id', protect, admin, c.rejectUser); 

module.exports = router;