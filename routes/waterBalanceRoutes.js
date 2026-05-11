const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/waterBalanceController');

router.get('/',        ctrl.getLatest);
router.get('/bydate',  ctrl.getByDate);

module.exports = router;
