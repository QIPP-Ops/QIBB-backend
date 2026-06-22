const mongoose = require('mongoose');
const { SAFETY_PERMIT_STATUSES, DEPARTMENTS } = require('../constants/qippLifecycle');

const safetyPermitSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  status: { type: String, required: true, enum: SAFETY_PERMIT_STATUSES, index: true },
  prometheusStatusCode: { type: String, default: '' },
  typeCode: { type: String, default: 'PTW', index: true },
  typeLabel: { type: String, default: '' },
  workOrderCode: { type: String, default: '', index: true },
  jhaCode: { type: String, default: '' },
  equipmentCode: { type: String, default: '', index: true },
  equipmentDescription: { type: String, default: '' },
  workDescription: { type: String, default: '' },
  locationName: { type: String, default: '' },
  validFrom: { type: String, default: '' },
  validTo: { type: String, default: '' },
  numberOfWorkers: { type: Number, default: 0 },
  department: { type: String, enum: DEPARTMENTS, default: undefined, index: true },
  permitPackageId: { type: String, default: '', index: true },
  /** Optional link to legacy flat PTW workflow document */
  legacyPtwId: { type: mongoose.Schema.Types.ObjectId, ref: 'PTW', default: null },
}, { timestamps: true });

module.exports = mongoose.model('SafetyPermit', safetyPermitSchema);
