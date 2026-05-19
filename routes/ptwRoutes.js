const express = require('express');
const router = express.Router();
const ptwController = require('../controllers/ptwController');
const { protect } = require('../middleware/auth');
const { requirePtwAccess } = require('../middleware/ptwAccess');

router.get('/access', protect, ptwController.getMyAccess);

router.use(protect, requirePtwAccess);

router.get('/', ptwController.getAllPermits);
router.get('/permits', ptwController.getAllPermits);
router.post('/', ptwController.createPermit);
router.post('/permits', ptwController.createPermit);
router.put('/:id', ptwController.updatePermitStatus);
router.patch('/:id', ptwController.updatePermitStatus);
router.put('/permits/:id', ptwController.updatePermitStatus);
router.patch('/permits/:id', ptwController.updatePermitStatus);
router.delete('/:id', ptwController.deletePermit);
router.delete('/permits/:id', ptwController.deletePermit);

module.exports = router;
