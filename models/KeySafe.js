const mongoose = require('mongoose');
const { DEPARTMENTS } = require('../constants/qippLifecycle');

const keySafeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  displayName: { type: String, default: '' },
  status: { type: String, default: '', index: true },
  description: { type: String, default: '' },
  keyCount: { type: Number, default: 0 },
  department: { type: String, enum: DEPARTMENTS, default: undefined, index: true },
}, { timestamps: true });

module.exports = mongoose.model('KeySafe', keySafeSchema);
