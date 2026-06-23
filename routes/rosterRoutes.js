const express = require('express');

const router = express.Router();

const c = require('../controllers/rosterController');

const actingCover = require('../controllers/actingCoverController');

const { protect, admin } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');

const { checkEditingLock } = require('../middleware/lock');



router.get('/acting-cover', protect, actingCover.listActingCover);

router.post('/acting-cover', protect, actingCover.createActingCover);

router.delete('/acting-cover/:id', protect, actingCover.cancelDelegation);



router.get('/delegations', protect, actingCover.listDelegations);

router.get('/delegations/inbox', protect, actingCover.getDelegationInbox);

router.get('/org-overlay', protect, actingCover.getOrgOverlay);

router.post('/delegations', protect, actingCover.createDelegation);

router.post('/delegations/resolve-conflict', protect, actingCover.resolveConflictDelegation);

router.post('/delegations/:id/approve', protect, actingCover.approveDelegation);

router.post('/delegations/:id/decline', protect, actingCover.declineDelegation);

router.delete('/delegations/:id', protect, actingCover.cancelDelegation);



router.get('/', protect, c.getRoster);

router.get('/personnel-directory', protect, admin, c.getPersonnelDirectory);

router.patch('/:empId/personnel-profile', protect, admin, c.patchPersonnelProfile);

router.patch('/:empId/set-plant-manager', protect, requireSuperAdmin, c.setPlantManager);

router.post('/', protect, admin, c.createEmployee);

router.put('/:empId', protect, c.updateEmployee);

router.delete('/:empId', protect, requireSuperAdmin, c.deleteEmployee);

router.post('/leave', protect, checkEditingLock, c.addLeave);

router.patch('/leave/:employeeId/:leaveId/approve', protect, checkEditingLock, c.approveLeave);
router.patch('/leave/:employeeId/:leaveId/reject', protect, checkEditingLock, c.rejectLeave);

router.patch('/leave/:employeeId/:leaveId', protect, checkEditingLock, c.updateLeave);

router.delete('/leave/:employeeId/:leaveId', protect, checkEditingLock, c.removeLeave);

router.patch('/:empId/compensate-balance', protect, c.patchCompensateBalance);

router.patch('/:empId/leave-balances', protect, c.patchLeaveBalances);



router.post('/:empId/kpi', protect, c.addKpi);

router.patch('/:empId/kpi/:kpiId', protect, c.updateKpi);

router.delete('/:empId/kpi/:kpiId', protect, admin, c.deleteKpi);



router.get('/:empId/calendar.ics', protect, c.exportIcs);



module.exports = router;

