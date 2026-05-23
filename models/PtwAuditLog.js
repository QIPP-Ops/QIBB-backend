const mongoose = require('mongoose');

const PtwAuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorEmail: { type: String, default: '' },
    actorName: { type: String, default: '' },
    targetPersonId: { type: String, default: '' },
    targetName: { type: String, default: '' },
    summary: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PtwAuditLog', PtwAuditLogSchema);
