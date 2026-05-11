const express = require('express');
const router = express.Router();
const c = require('../controllers/adminController');
const { protect, admin } = require('../middleware/auth');

// PTW
router.get('/ptw', c.getPtwPersonnel);
router.post('/ptw', protect, admin, c.addPtwPerson);
router.patch('/ptw/:id', protect, admin, c.updatePtwPerson);
router.delete('/ptw/:id', protect, admin, c.deletePtwPerson);

// Config & Status
router.get('/status', c.getStatus);
router.get('/config', c.getConfig);
router.patch('/config', protect, admin, c.updateConfig);
router.post('/set-pin', protect, admin, c.setPin);
router.post('/check-pin', c.checkPin);
router.post('/set-lock', protect, admin, c.setLock);
router.post('/crews', protect, admin, c.addCrew);
router.delete('/crews/:crew', protect, admin, c.removeCrew);
router.post('/roles', protect, admin, c.addRole);
router.delete('/roles/:role', protect, admin, c.removeRole);

// Achievements
router.get('/achievements', c.getAchievements);
router.post('/achievements', protect, admin, c.addAchievement);
router.patch('/achievements/:id', protect, admin, c.updateAchievement);
router.delete('/achievements/:id', protect, admin, c.deleteAchievement);

// KPI Templates
router.get('/kpi-templates', c.getKpiTemplates);
router.post('/kpi-templates', protect, admin, c.upsertKpiTemplate);

// Users
router.get('/users', protect, admin, c.getAllUsers);
router.get('/users/pending', protect, admin, c.getPendingUsers);
router.patch('/users/:id/approve', protect, admin, c.approveUser);
router.patch('/users/:id/role', protect, admin, c.updateUserRole);
router.delete('/users/:id', protect, admin, c.deleteUser);

module.exports = router;