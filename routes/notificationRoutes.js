const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const c = require('../controllers/notificationController');

router.get('/', protect, c.listNotifications);
router.get('/chemistry-alarm-count', protect, c.unreadChemistryAlarm);
router.patch('/read-all', protect, c.markAllRead);
router.patch('/:id/read', protect, c.markRead);

module.exports = router;
