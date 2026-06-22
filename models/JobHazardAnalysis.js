const mongoose = require('mongoose');
const { JHA_STATUSES, DEPARTMENTS } = require('../constants/qippLifecycle');

const jobHazardAnalysisSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  status: { type: String, required: true, enum: JHA_STATUSES, index: true },
  prometheusStatusCode: { type: String, default: '' },
  workOrderCode: { type: String, default: '', index: true },
  equipmentCode: { type: String, default: '' },
  workDescription: { type: String, default: '' },
  equipmentDescription: { type: String, default: '' },
  department: { type: String, enum: DEPARTMENTS, default: undefined, index: true },
  permitPackageId: { type: String, default: '', index: true },
  submittedBy: { type: String, default: '' },
  approvedBy: { type: String, default: '' },
  notes: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('JobHazardAnalysis', jobHazardAnalysisSchema);
