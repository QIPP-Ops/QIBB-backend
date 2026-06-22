const mongoose = require('mongoose');
const { DEPARTMENTS } = require('../constants/qippLifecycle');

const workPackLinkSchema = new mongoose.Schema({
  workOrderCode: { type: String, default: '' },
  jhaCode: { type: String, default: '' },
  permitCode: { type: String, default: '' },
}, { _id: false });

const permitPackageSchema = new mongoose.Schema({
  packageId: { type: String, required: true, unique: true, index: true },
  equipmentCode: { type: String, default: '', index: true },
  workOrderCodes: [{ type: String }],
  jhaCodes: [{ type: String }],
  permitCodes: [{ type: String }],
  /** Exact WO ↔ JHA ↔ PE triplets inferred during import */
  workPacks: [workPackLinkSchema],
  department: { type: String, enum: DEPARTMENTS, default: undefined, index: true },
  status: { type: String, default: 'active' },
  notes: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('PermitPackage', permitPackageSchema);
