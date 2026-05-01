const mongoose = require('mongoose');

const safetyStatsSchema = new mongoose.Schema({
  permitStatus: mongoose.Schema.Types.Mixed,
  permitType: mongoose.Schema.Types.Mixed,
  suppType: mongoose.Schema.Types.Mixed,
  jhaStatus: mongoose.Schema.Types.Mixed,
  workPriority: mongoose.Schema.Types.Mixed,
  ksStatus: mongoose.Schema.Types.Mixed,
  isoMethod: mongoose.Schema.Types.Mixed,
  suppStatus: mongoose.Schema.Types.Mixed,
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('SafetyStats', safetyStatsSchema);
