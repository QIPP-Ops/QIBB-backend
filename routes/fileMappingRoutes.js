const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');
const c = require('../controllers/fileMappingController');

router.get('/', protect, admin, c.listFileMappings);
router.post('/', protect, requireSuperAdmin, c.createFileMapping);
router.put('/:id', protect, requireSuperAdmin, c.updateFileMapping);
router.delete('/:id', protect, requireSuperAdmin, c.deleteFileMapping);

module.exports = router;
