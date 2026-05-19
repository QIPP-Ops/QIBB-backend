const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/dailyOperationController');
const { protect } = require('../middleware/auth');

router.get('/', protect, ctrl.getLatest);
router.get('/bydate', protect, ctrl.getByDate);
router.get('/summary', protect, ctrl.getSummary);
router.get('/kpis', protect, ctrl.getKpis);

module.exports = router;
