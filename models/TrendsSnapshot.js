const mongoose = require('mongoose');

const TrendsSnapshotSchema = new mongoose.Schema({
  water: {
    grConsumption:    { type: Map, of: Number },
    totalGrConsumption: Number,
    tankLevels: {
      ST1: Number, ST2: Number,
      DT1: Number, DT2: Number,
    },
    swProduction:  Number,
    swConsumption: Number,
    dmProduction:  Number,
    dmConsumption: Number,
  },
  energy: {
    contractedCapacityMW:  Number,
    totalActualEnergyMWh:  Number,
    peakAvailabilityMW:    Number,
    hourlyData: [{
      hour: String,
      actualMWh: Number,
      availableMW: Number,
    }],
  },
  dailyOps: {
    totalPlantLoadMW: Number,
    groups: { type: Map, of: Number },
  },
  chemistry: {
    ro: { type: mongoose.Schema.Types.Mixed },
    hrsg: { type: mongoose.Schema.Types.Mixed },
  },
  airFilterDP: { type: mongoose.Schema.Types.Mixed },
  fgFilterDP:  { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

module.exports = mongoose.model('TrendsSnapshot', TrendsSnapshotSchema);