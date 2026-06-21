const mongoose = require('mongoose');

const SAFETY_STATUSES = ['pending', 'approved', 'rejected'];

const SafetyObservationSchema = new mongoose.Schema({
  empId: { type: String, required: true, index: true },
  employeeName: { type: String, default: '' },
  crew: { type: String, default: '', index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  location: { type: String, default: '' },
  beforePhoto: { type: String, default: '' },
  afterPhoto: { type: String, default: '' },
  status: { type: String, enum: SAFETY_STATUSES, default: 'pending', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNotes: { type: String, default: '' },
  observationMonth: { type: String, required: true, index: true },
}, { timestamps: true });

SafetyObservationSchema.index({ empId: 1, observationMonth: 1 });

module.exports = mongoose.model('SafetyObservation', SafetyObservationSchema);
module.exports.SAFETY_STATUSES = SAFETY_STATUSES;
