const mongoose = require('mongoose');

const DELEGATION_STATUSES = ['pending', 'approved', 'declined', 'cancelled'];

const ActingAssignmentSchema = new mongoose.Schema({
  absentEmpId: { type: String, required: true, index: true },
  coverEmpId: { type: String, required: true, index: true },
  /** Legacy role key (shift_in_charge, supervisor) or slug for any role */
  role: { type: String, required: true },
  /** Absent person's job role label at time of request */
  roleAtTime: { type: String, default: '' },
  crew: { type: String, required: true, index: true },
  startDate: { type: String, required: true }, // YYYY-MM-DD
  endDate: { type: String, required: true }, // YYYY-MM-DD
  leaveId: { type: String, default: null, index: true },
  status: {
    type: String,
    enum: DELEGATION_STATUSES,
    default: 'pending',
  },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  requestedAt: { type: Date, default: Date.now },
  respondedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  notes: { type: String, default: '' },
}, { timestamps: true });

ActingAssignmentSchema.index({ crew: 1, startDate: 1, endDate: 1 });
ActingAssignmentSchema.index({ absentEmpId: 1, startDate: 1, endDate: 1 });
ActingAssignmentSchema.index({ coverEmpId: 1, status: 1 });

module.exports = mongoose.model('ActingAssignment', ActingAssignmentSchema);
module.exports.DELEGATION_STATUSES = DELEGATION_STATUSES;
