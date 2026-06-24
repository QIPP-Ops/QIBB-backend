const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const c = require('../controllers/personnelKpiController');

router.get('/member/:memberId', protect, c.getMemberKpi);
router.get('/member/:memberId/unified', protect, c.getMemberUnifiedKpi);
router.get('/crew/:crewId', protect, c.getCrewKpi);
router.get('/crew/:crewId/unified', protect, c.getCrewUnifiedKpi);
router.get('/all', protect, c.getAllKpis);

module.exports = router;
