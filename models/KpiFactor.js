const mongoose = require('mongoose');

const KpiFactorSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  defaultWeight: { type: Number, default: 0, min: 0, max: 100 },
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('KpiFactor', KpiFactorSchema);
