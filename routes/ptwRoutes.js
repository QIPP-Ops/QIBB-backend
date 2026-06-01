const express = require('express');
const router = express.Router();
const ptwController = require('../controllers/ptwController');
const ptwDashboardController = require('../controllers/ptwDashboardController');
const { protect } = require('../middleware/auth');
const { requirePtwAccess } = require('../middleware/ptwAccess');
const { requireSuperAdmin } = require('../middleware/superAdmin');

router.get('/access', protect, ptwController.getMyAccess);

router.use(protect, requirePtwAccess);

router.get('/dashboard', ptwDashboardController.getDashboard);
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

router.patch('/authorizations/:personId', requireSuperAdmin, ptwController.patchAuthorizationPerson);
router.post('/authorizations', requireSuperAdmin, ptwController.createAuthorizationPerson);
router.delete('/authorizations/:personId', requireSuperAdmin, ptwController.deleteAuthorizationPerson);

module.exports = router;
