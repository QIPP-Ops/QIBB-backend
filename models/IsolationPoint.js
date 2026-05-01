const mongoose = require('mongoose');

const isolationPointSchema = new mongoose.Schema({
  isolationPointNo: { type: String, required: true },
  equipmentNo: String,
  method: String,
  description: String
}, { timestamps: true });

module.exports = mongoose.model('IsolationPoint', isolationPointSchema);
