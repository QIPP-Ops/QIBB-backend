const express = require('express');
const router = express.Router();
const ptwController = require('../controllers/ptwController');
const { protect } = require('../middleware/auth');

router.get('/', protect, ptwController.getAllPermits);
router.get('/permits', protect, ptwController.getAllPermits);

router.post('/', protect, ptwController.createPermit);
router.post('/permits', protect, ptwController.createPermit);

router.put('/:id', protect, ptwController.updatePermitStatus);
router.patch('/:id', protect, ptwController.updatePermitStatus);
router.put('/permits/:id', protect, ptwController.updatePermitStatus);
router.patch('/permits/:id', protect, ptwController.updatePermitStatus);

router.delete('/:id', protect, ptwController.deletePermit);
router.delete('/permits/:id', protect, ptwController.deletePermit);

module.exports = router;
