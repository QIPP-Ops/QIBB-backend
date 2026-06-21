const mongoose = require('mongoose');

const ChatRoomSchema = new mongoose.Schema(
  {
    crew: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    type: { type: String, enum: ['crew', 'topic'], default: 'crew' },
    parentRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', default: null },
    postingMode: { type: String, enum: ['open', 'read_only'], default: 'open' },
    restrictedPosters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }],
    mutedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ChatRoomSchema.index({ crew: 1, slug: 1 }, { unique: true });
ChatRoomSchema.index({ parentRoomId: 1 });

module.exports = mongoose.model('ChatRoom', ChatRoomSchema);
