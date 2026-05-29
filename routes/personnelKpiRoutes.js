const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const c = require('../controllers/personnelKpiController');

router.get('/member/:memberId', protect, c.getMemberKpi);
router.get('/crew/:crewId', protect, c.getCrewKpi);
router.get('/all', protect, c.getAllKpis);

module.exports = router;
