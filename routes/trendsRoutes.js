const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const ctrl     = require('../controllers/trendsController');
const { protect, admin } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/',           ctrl.getLatestTrends);
router.get('/history',    ctrl.getTrendsHistory);
router.post('/sync',      protect, admin, ctrl.syncFromSharePoint);
router.post('/upload',    protect, upload.single('file'), ctrl.uploadReport);

module.exports = router;