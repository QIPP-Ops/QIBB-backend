const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const environmentalReportController = require('../controllers/environmentalReportController');
const { protect } = require('../middleware/auth');

router.get('/', protect, environmentalReportController.getAll);
router.post('/', protect, environmentalReportController.create);
router.put('/:id', protect, environmentalReportController.update);
router.delete('/:id', protect, environmentalReportController.remove);
router.get('/export/csv', protect, environmentalReportController.exportCSV);
router.get('/export/excel', protect, environmentalReportController.exportExcel);
router.post('/import', protect, upload.single('file'), environmentalReportController.importData);

module.exports = router;
