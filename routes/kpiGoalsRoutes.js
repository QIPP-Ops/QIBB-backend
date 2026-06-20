const express = require('express');
const router = express.Router();
const c = require('../controllers/kpiGoalsController');
const { protect } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');

router.get('/me', protect, c.getMyKpiGoals);
router.put('/me', protect, c.saveMyKpiGoals);
router.post('/me/submit', protect, c.submitMyKpiGoals);

router.get('/factors', protect, c.listKpiFactors);
router.post('/factors', protect, requireSuperAdmin, c.createKpiFactor);
router.patch('/factors/:id', protect, requireSuperAdmin, c.updateKpiFactor);
router.delete('/factors/:id', protect, requireSuperAdmin, c.deleteKpiFactor);

router.get('/submissions', protect, requireSuperAdmin, c.listEmployeeKpiSubmissions);
router.patch('/submissions/:empId', protect, requireSuperAdmin, c.reviewEmployeeKpi);
router.get('/pending-final', protect, c.listPendingFinalKpiSubmissions);
router.post('/submissions/:empId/final-approve', protect, c.finalApproveEmployeeKpi);

module.exports = router;
