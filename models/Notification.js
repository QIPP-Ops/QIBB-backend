const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'shift_missing',
        'chemistry_alarm',
        'quiz_assigned',
        'quiz_completed',
        'quiz_prize_claimed',
        'leave_conflict',
        'roster_lock',
        'roster_unlock',
        'ingest_complete',
      ],
    },
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
    emailSentAt: { type: Date, default: null },
    dedupeKey: { type: String, default: '' },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipientUserId: 1, createdAt: -1 });
NotificationSchema.index({ dedupeKey: 1, recipientUserId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Notification', NotificationSchema);
