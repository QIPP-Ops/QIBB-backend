const mongoose = require('mongoose');
const { DEPARTMENTS } = require('../constants/qippLifecycle');

const isolationPointSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  equipmentCode: { type: String, default: '', index: true },
  isolationMethodCode: { type: String, default: '', index: true },
  description: { type: String, default: '' },
  department: { type: String, enum: DEPARTMENTS, default: undefined, index: true },
  keySafeCode: { type: String, default: '' },
  isolationTypeCode: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('IsolationPoint', isolationPointSchema);
