const mongoose = require('mongoose');

const SafetyRegisteredCaseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
  empId: { type: String, required: true, index: true },
  employeeName: { type: String, default: '' },
  crew: { type: String, default: '', index: true },
  caseNumber: { type: String, required: true, unique: true, index: true },
  savedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

SafetyRegisteredCaseSchema.index({ empId: 1, savedAt: -1 });

module.exports = mongoose.model('SafetyRegisteredCase', SafetyRegisteredCaseSchema);
