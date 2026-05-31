const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const c = require('../controllers/plantDataController');

/** Manual blob → DB → JSON cache ingest (admin only). */
router.post('/trigger', protect, c.runIngestNow);

module.exports = router;
