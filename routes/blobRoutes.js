const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');
const c = require('../controllers/blobController');

router.get('/files', protect, admin, c.listBlobFiles);
router.get('/preview', protect, requireSuperAdmin, c.previewBlobFile);

module.exports = router;
