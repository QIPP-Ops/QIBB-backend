const Notification = require('../models/Notification');

exports.listNotifications = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const rows = await Notification.find({ recipientUserId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const unread = await Notification.countDocuments({
      recipientUserId: req.user.id,
      readAt: null,
    });
    res.json({ notifications: rows, unread });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Notification.findOneAndUpdate(
      { _id: id, recipientUserId: req.user.id },
      { $set: { readAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Notification not found.' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientUserId: req.user.id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.json({ message: 'All notifications marked read.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
