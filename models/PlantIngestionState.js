const mongoose = require('mongoose');

const PlantIngestionStateSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  reportsRoot: { type: String, default: '' },
  lastRunAt: { type: Date, default: null },
  lastSuccessAt: { type: Date, default: null },
  lastError: { type: String, default: '' },
  filesScanned: { type: Number, default: 0 },
  highlightsFound: { type: Number, default: 0 },
  metricsDiscovered: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('PlantIngestionState', PlantIngestionStateSchema);
