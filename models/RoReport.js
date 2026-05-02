const mongoose = require('mongoose');

const RoReportSchema = new mongoose.Schema({
  reportDate: { type: Date, required: true },
  shift: { type: String, required: true },
  dmfUnits: [{
    unitNumber: Number,
    status: String,
    inletFlow: Number,
    dp: Number
  }],
  cfUnits: [{
    unitNumber: Number,
    status: String,
    dp: Number,
    turbidity: Number
  }],
  equipment: [{
    name: String,
    inService: Number,
    standBy: Number,
    outOfService: Number
  }],
  pass1Units: [{
    unitNumber: Number,
    status: String,
    inletPressure: Number,
    dp: Number
  }],
  pass2Units: [{
    unitNumber: Number,
    status: String,
    inletPressure: Number,
    dp: Number
  }],
  mbUnits: [{
    unitNumber: Number,
    status: String,
    dp: Number,
    inletFlow: Number
  }],
  tanks: {
    swAMm: Number,
    swBMm: Number,
    dmAMm: Number,
    dmBMm: Number,
    swAM3: Number,
    swBM3: Number,
    dmAM3: Number,
    dmBM3: Number,
    swProductionM3hr: Number,
    dmProductionM3hr: Number,
    swProduction24h: Number,
    swConsumption24h: Number,
    dmProduction24h: Number,
    dmConsumption24h: Number
  },
  activities: [{
    time: String,
    description: String
  }]
}, { timestamps: true });

// Ensure unique index on reportDate and shift
RoReportSchema.index({ reportDate: 1, shift: 1 }, { unique: true });

module.exports = mongoose.model('RoReport', RoReportSchema);
