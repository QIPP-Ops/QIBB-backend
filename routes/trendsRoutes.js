const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const ctrl     = require('../controllers/trendsController');
const plantData = require('../controllers/plantDataController');
const savedTrend = require('../controllers/savedTrendController');
const { protect, admin } = require('../middleware/auth');
const { opsLead } = require('../middleware/opsLead');
const { requireSuperAdmin } = require('../middleware/superAdmin');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/', protect, ctrl.getLatestTrends);
router.get('/history', protect, ctrl.getTrendsHistory);
router.post('/sync', protect, admin, ctrl.syncFromSharePoint);
router.post('/sync-blob', protect, admin, ctrl.syncFromBlob);
router.post('/upload', protect, admin, upload.single('file'), ctrl.uploadReport);

router.get('/saved', protect, savedTrend.listSavedTrends);
router.post('/saved', protect, savedTrend.createSavedTrend);
router.put('/saved/:id', protect, requireSuperAdmin, savedTrend.updateSavedTrend);
router.delete('/saved/:id', protect, requireSuperAdmin, savedTrend.deleteSavedTrend);
router.patch('/saved/:id/home', protect, requireSuperAdmin, savedTrend.toggleHomePage);

router.patch('/:id', protect, opsLead, plantData.patchCustomTrend);
router.delete('/:id', protect, opsLead, plantData.deleteCustomTrend);

module.exports = router;
