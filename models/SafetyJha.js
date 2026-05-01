const mongoose = require('mongoose');

const safetyJhaSchema = new mongoose.Schema({
  jhaNo: { type: String, required: true, unique: true },
  status: { type: String, required: true },
  jhaType: String,
  location: String,
  equipmentNo: String,
  equipmentDesc: String,
  workDesc: String
}, { timestamps: true });

module.exports = mongoose.model('SafetyJha', safetyJhaSchema);
