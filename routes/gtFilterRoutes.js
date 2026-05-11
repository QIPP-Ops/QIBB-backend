const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/gtFilterController');

router.get('/',         ctrl.getLatest);
router.get('/bydate',   ctrl.getByDate);
router.get('/summary',  ctrl.getUnitSummary);

module.exports = router;
