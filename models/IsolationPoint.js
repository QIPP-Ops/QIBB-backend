const mongoose = require('mongoose');

const isolationPointSchema = new mongoose.Schema({ // TODO: COSMOS_COMPAT_CHECK
  isolationPointNo: { type: String, required: true },
  equipmentNo: String,
  method: String,
  description: String
}, { timestamps: true });

module.exports = mongoose.model('IsolationPoint', isolationPointSchema);
