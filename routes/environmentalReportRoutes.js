const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const environmentalReportController = require('../controllers/environmentalReportController');

router.get('/', environmentalReportController.getAll);
router.post('/', environmentalReportController.create);
router.put('/:id', environmentalReportController.update);
router.delete('/:id', environmentalReportController.remove);
router.get('/export/csv', environmentalReportController.exportCSV);
router.get('/export/excel', environmentalReportController.exportExcel);
router.post('/import', upload.single('file'), environmentalReportController.importData);

module.exports = router;
