const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'shift_missing',
        'quiz_assigned',
        'quiz_completed',
        'quiz_prize_claimed',
        'leave_conflict',
        'leave_approved',
        'leave_rejected',
        'leave_pending',
        'delegation_request',
        'delegation_approved',
        'delegation_declined',
        'roster_lock',
        'roster_unlock',
        'ptw_expiry',
        'chat_mention',
        'chat_message',
        'safety_observation_reminder',
      ],
    },
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    recipientEmpId: { type: String, default: '' },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    message: { type: String, default: '' },
    leaveId: { type: String, default: '' },
    read: { type: Boolean, default: false },
    link: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
    emailSentAt: { type: Date, default: null },
    dedupeKey: { type: String, default: '' },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipientUserId: 1, createdAt: -1 });
NotificationSchema.index({ recipientEmpId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ dedupeKey: 1, recipientUserId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Notification', NotificationSchema);
