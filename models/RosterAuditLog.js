const mongoose = require('mongoose');

const RosterAuditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'USER_REGISTERED',
      'USER_APPROVED',
      'USER_REJECTED',
      'USER_ROLE_CHANGED',
      'LEAVE_APPLIED',
      'LEAVE_REMOVED',
      'LEAVE_UPDATED',
      'PROFILE_UPDATED',
      'SHIFT_OVERRIDE',
      'ACTING_COVER_SET',
      'ACTING_COVER_CLEARED',
    ],
  },
  actorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  actorEmail: { type: String, default: '' },
  actorName:  { type: String, default: '' },
  targetEmpId:  { type: String, default: '' },
  targetName:   { type: String, default: '' },
  targetEmail:  { type: String, default: '' },
  summary:    { type: String, required: true },
  metadata:   { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

RosterAuditLogSchema.index({ createdAt: -1 });
RosterAuditLogSchema.index({ targetEmpId: 1, createdAt: -1 });
RosterAuditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('RosterAuditLog', RosterAuditLogSchema);
