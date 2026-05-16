const express = require('express');
const router = express.Router();
const c = require('../controllers/adminController');
const { protect, admin } = require('../middleware/auth');

// ─── PTW Personnel (both old and new path styles supported) ──
router.get('/ptw-personnel',           c.getPtwPersonnel);
router.post('/ptw-personnel',          protect, admin, c.addPtwPersonnel);
router.put('/ptw-personnel/:id',       protect, admin, c.updatePtwPersonnel);
router.patch('/ptw-personnel/:id',     protect, admin, c.updatePtwPersonnel);
router.delete('/ptw-personnel/:id',    protect, admin, c.deletePtwPersonnel);

// Backwards-compat aliases (old short path)
router.get('/ptw',                     c.getPtwPersonnel);
router.post('/ptw',                    protect, admin, c.addPtwPersonnel);
router.patch('/ptw/:id',               protect, admin, c.updatePtwPersonnel);
router.delete('/ptw/:id',              protect, admin, c.deletePtwPersonnel);

// ─── Config & Settings ───────────────────────────────────────
router.get('/status',                  c.getStatus);
router.get('/config',                  c.getConfig);
router.post('/set-pin',                protect, admin, c.setPin);
router.post('/check-pin',              c.checkPin);
router.post('/set-lock',               protect, admin, c.setLock);
router.put('/lock',                    protect, admin, c.setLock); // alias

// ─── Crews & Roles (both singular and plural for safety) ─────
router.post('/crews',                  protect, admin, c.addCrew);
router.delete('/crews/:crew',          protect, admin, c.removeCrew);
router.post('/roles',                  protect, admin, c.addRole);
router.delete('/roles/:role',          protect, admin, c.removeRole);

router.post('/crew',                   protect, admin, c.addCrew);
router.delete('/crew/:crew',           protect, admin, c.removeCrew);
router.post('/role',                   protect, admin, c.addRole);
router.delete('/role/:role',           protect, admin, c.removeRole);

// ─── Curriculum ──────────────────────────────────────────────
router.get('/curriculum',              c.getCurriculum);
router.post('/curriculum',             protect, admin, c.addCurriculumItem);
router.put('/curriculum/:id',          protect, admin, c.updateCurriculumItem);
router.patch('/curriculum/:id',        protect, admin, c.updateCurriculumItem);
router.delete('/curriculum/:id',       protect, admin, c.deleteCurriculumItem);

// ─── User Management ─────────────────────────────────────────
router.get('/users',                   protect, admin, c.getAllUsers);
router.get('/users/pending',           protect, admin, c.getPendingUsers);
router.put('/users/:id/approve',       protect, admin, c.approveUser);
router.patch('/users/:id/approve',     protect, admin, c.approveUser);
router.put('/users/:id/role',          protect, admin, c.updateUserRole);
router.patch('/users/:id/role',        protect, admin, c.updateUserRole);
router.delete('/users/:id/reject',     protect, admin, c.rejectUser);
router.delete('/users/:id',            protect, admin, c.rejectUser);

module.exports = router;
