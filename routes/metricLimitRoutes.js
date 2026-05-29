const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const c = require('../controllers/metricLimitController');

router.get('/', protect, c.listMetricLimits);
router.put('/', protect, admin, c.upsertMetricLimit);
router.post('/', protect, admin, c.upsertMetricLimit);
router.delete('/:metricKey', protect, admin, c.deleteMetricLimit);

module.exports = router;
