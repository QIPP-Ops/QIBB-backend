const express = require('express');
const { protect } = require('../middleware/auth');
const c = require('../controllers/chatController');

const router = express.Router();

router.get('/rooms', protect, c.listRooms);
router.get('/rooms/:roomId/messages', protect, c.getMessages);
router.post('/rooms/:roomId/messages', protect, c.postMessage);
router.post('/rooms/:roomId/upload', protect, c.uploadFile);
router.get('/rooms/:roomId/roster', protect, c.getRoster);
router.get('/rooms/:roomId/search', protect, c.search);
router.patch('/rooms/:roomId', protect, c.patchRoom);
router.patch('/rooms/:roomId/mute', protect, c.muteRoom);
router.patch('/rooms/:roomId/read', protect, c.markRead);
router.post('/topics', protect, c.createTopic);
router.patch('/messages/:messageId', protect, c.editMessage);
router.delete('/rooms/:roomId/messages/:messageId', protect, c.deleteMessage);
router.post('/messages/:messageId/react', protect, c.react);
router.post('/rooms/:roomId/messages/:messageId/pin', protect, c.pin);

module.exports = router;
