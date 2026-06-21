const mongoose = require('mongoose');

const ChatRoomPreferenceSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    muted: { type: Boolean, default: false },
    lastReadAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ChatRoomPreferenceSchema.index({ roomId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('ChatRoomPreference', ChatRoomPreferenceSchema);
