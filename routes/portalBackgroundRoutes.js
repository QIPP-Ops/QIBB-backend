const express = require('express');
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');
const portalBackground = require('../controllers/portalBackgroundController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
});

router.get('/', protect, portalBackground.getPortalBackgrounds);
router.patch('/:sectionKey', protect, requireSuperAdmin, portalBackground.patchPortalBackground);
router.delete('/:sectionKey', protect, requireSuperAdmin, portalBackground.deletePortalBackground);
router.post('/upload', protect, requireSuperAdmin, upload.single('file'), portalBackground.uploadPortalBackground);

module.exports = router;
