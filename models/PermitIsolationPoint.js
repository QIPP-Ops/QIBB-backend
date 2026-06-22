const mongoose = require('mongoose');

/** Phase C/D stub — runtime permit ↔ isolation point junction (not wired yet). */
const permitIsolationPointSchema = new mongoose.Schema({
  permitCode: { type: String, required: true, index: true },
  isolationPointCode: { type: String, required: true, index: true },
  appliedAt: { type: Date },
  appliedBy: { type: String, default: '' },
  status: { type: String, enum: ['planned', 'applied', 'removed'], default: 'planned' },
  notes: { type: String, default: '' },
}, { timestamps: true });

permitIsolationPointSchema.index({ permitCode: 1, isolationPointCode: 1 }, { unique: true });

module.exports = mongoose.model('PermitIsolationPoint', permitIsolationPointSchema);
