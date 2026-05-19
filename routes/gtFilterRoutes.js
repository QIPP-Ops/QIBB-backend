const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/gtFilterController');
const { protect } = require('../middleware/auth');

router.get('/', protect, ctrl.getLatest);
router.get('/bydate', protect, ctrl.getByDate);
router.get('/summary', protect, ctrl.getUnitSummary);

module.exports = router;
