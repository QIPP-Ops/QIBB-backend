const express = require('express');
const { protect } = require('../middleware/auth');
const c = require('../controllers/attendanceController');

const router = express.Router();

router.get('/', protect, c.listAttendance);
router.post('/', protect, c.upsertAttendance);
router.post('/batch', protect, c.batchUpsertAttendance);
router.post('/sync-from-leave', protect, c.syncAttendanceFromLeave);
router.patch('/:id', protect, c.patchAttendance);
router.delete('/:id', protect, c.deleteAttendance);

module.exports = router;
