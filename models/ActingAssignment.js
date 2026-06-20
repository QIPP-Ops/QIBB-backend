const mongoose = require('mongoose');

const ActingAssignmentSchema = new mongoose.Schema({
  absentEmpId: { type: String, required: true, index: true },
  coverEmpId: { type: String, required: true, index: true },
  role: {
    type: String,
    required: true,
    enum: ['shift_in_charge', 'supervisor'],
  },
  crew: { type: String, required: true, index: true },
  startDate: { type: String, required: true }, // YYYY-MM-DD
  endDate: { type: String, required: true }, // YYYY-MM-DD
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  notes: { type: String, default: '' },
}, { timestamps: true });

ActingAssignmentSchema.index({ crew: 1, startDate: 1, endDate: 1 });
ActingAssignmentSchema.index({ absentEmpId: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('ActingAssignment', ActingAssignmentSchema);
