const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const c = require('../controllers/chemistryController');

router.get('/history', protect, c.getHistory);

module.exports = router;
