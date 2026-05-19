const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/energyController');
const { protect } = require('../middleware/auth');

router.get('/', protect, ctrl.getLatest);
router.get('/bydate', protect, ctrl.getByDate);
router.get('/summary', protect, ctrl.getSummary);

module.exports = router;
