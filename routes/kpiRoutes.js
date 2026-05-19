const express = require('express');
const router = express.Router();
const kpiController = require('../controllers/kpiController');
const { protect } = require('../middleware/auth');

router.get('/', protect, kpiController.getKpis);

module.exports = router;
