const express = require('express');
const router = express.Router();
const roReportController = require('../controllers/roReportController');
const { protect } = require('../middleware/auth');

router.get('/', protect, roReportController.getAllReports);
router.get('/latest', protect, roReportController.getLatestReport);
router.get('/:id', protect, roReportController.getReportById);

module.exports = router;
