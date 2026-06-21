const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, default: 'application/octet-stream' },
    sizeBytes: { type: Number, default: 0 },
  },
  { _id: false }
);

const ReactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  },
  { _id: false }
);

const ChatMessageSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true, index: true },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', default: null },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    text: { type: String, default: '' },
    attachments: { type: [AttachmentSchema], default: [] },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }],
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    reactions: { type: [ReactionSchema], default: [] },
    pinned: { type: Boolean, default: false },
    pinnedAt: { type: Date, default: null },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

ChatMessageSchema.index({ roomId: 1, createdAt: -1 });
ChatMessageSchema.index({ roomId: 1, text: 'text' });

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
