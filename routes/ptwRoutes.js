const express = require('express');
const router = express.Router();
const ptwController = require('../controllers/ptwController');
const { protect } = require('../middleware/auth');


router.get('/', ptwController.getAllPermits);

// Mutations require protection
router.post('/', protect, ptwController.createPermit);
router.patch('/:id', protect, ptwController.updatePermitStatus);
router.delete('/:id', protect, ptwController.deletePermit);

module.exports = router;
