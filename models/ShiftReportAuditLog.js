const mongoose = require('mongoose');

const ShiftReportAuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: ['SHIFT_REPORT_CREATED', 'SHIFT_REPORT_UPDATED', 'SHIFT_REPORT_DELETED'],
    },
    shiftReportId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    actorEmail: { type: String, default: '' },
    actorName: { type: String, default: '' },
    targetEmpId: { type: String, default: '' },
    targetName: { type: String, default: '' },
    summary: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

ShiftReportAuditLogSchema.index({ shiftReportId: 1, createdAt: -1 });
ShiftReportAuditLogSchema.index({ targetEmpId: 1, createdAt: -1 });

module.exports = mongoose.model('ShiftReportAuditLog', ShiftReportAuditLogSchema);
