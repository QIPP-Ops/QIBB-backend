const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/dailyOperationController');

router.get('/',         ctrl.getLatest);
router.get('/bydate',   ctrl.getByDate);
router.get('/summary',  ctrl.getSummary);
router.get('/kpis',     ctrl.getKpis);

module.exports = router;