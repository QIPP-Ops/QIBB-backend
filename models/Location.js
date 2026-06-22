const mongoose = require('mongoose');
const { DEPARTMENTS } = require('../constants/qippLifecycle');

const locationSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: '' },
  summary: { type: String, default: '' },
  department: { type: String, enum: DEPARTMENTS, default: undefined, index: true },
}, { timestamps: true });

module.exports = mongoose.model('Location', locationSchema);
