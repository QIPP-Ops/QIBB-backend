const express = require('express');
const router = express.Router();
const ptwController = require('../controllers/ptwController');
const ptwDashboardController = require('../controllers/ptwDashboardController');
const qippEntityController = require('../controllers/qippEntityController');
const crewCalendarController = require('../controllers/crewCalendarController');
const { protect } = require('../middleware/auth');
const { requirePtwAccess } = require('../middleware/ptwAccess');
const { requireSuperAdmin } = require('../middleware/superAdmin');

router.get('/access', protect, ptwController.getMyAccess);
router.get('/crew', protect, crewCalendarController.getCrew);

router.use(protect, requirePtwAccess);

router.get('/dashboard', ptwDashboardController.getDashboard);

// Structured QIPP entities (Phase A)
router.get('/work-orders', qippEntityController.listWorkOrders);
router.get('/work-orders/:code', qippEntityController.getWorkOrder);
router.get('/jhas', qippEntityController.listJhas);
router.get('/jhas/:code', qippEntityController.getJha);
router.get('/safety-permits', qippEntityController.listSafetyPermits);
router.get('/safety-permits/:code', qippEntityController.getSafetyPermit);
router.get('/isolation-points', qippEntityController.listIsolationPoints);
router.get('/isolation-points/:code', qippEntityController.getIsolationPoint);
router.get('/permit-packages', qippEntityController.listPermitPackages);
router.get('/permit-packages/:packageId', qippEntityController.getPermitPackage);
router.get('/equipment', qippEntityController.listEquipment);
router.get('/equipment/:code', qippEntityController.getEquipment);
router.get('/locations', qippEntityController.listLocations);
router.get('/locations/:code', qippEntityController.getLocation);
router.get('/key-safes', qippEntityController.listKeySafes);
router.get('/key-safes/:code', qippEntityController.getKeySafe);
router.get('/next-pe-code', qippEntityController.getNextPeCode);

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
