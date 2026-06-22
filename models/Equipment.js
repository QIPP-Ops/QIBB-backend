const mongoose = require('mongoose');
const { DEPARTMENTS } = require('../constants/qippLifecycle');

const equipmentSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  description: { type: String, default: '' },
  locationName: { type: String, default: '', index: true },
  team: { type: String, default: '' },
  parentEquipmentCode: { type: String, default: '', index: true },
  department: { type: String, enum: DEPARTMENTS, default: undefined, index: true },
  prometheusInternalId: { type: Number },
}, { timestamps: true });

module.exports = mongoose.model('Equipment', equipmentSchema);
