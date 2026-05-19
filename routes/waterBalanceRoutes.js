const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/waterBalanceController');
const { protect } = require('../middleware/auth');

router.get('/', protect, ctrl.getLatest);
router.get('/bydate', protect, ctrl.getByDate);

module.exports = router;
