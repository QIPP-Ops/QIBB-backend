const mongoose = require('mongoose');

const PlantPerformanceSchema = new mongoose.Schema({
  date: { type: Date, required: true, unique: true },
  generation: Number,
  netGen: Number,
  load: Number,
  plf: Number,
  efficiency: Number,
  heatRate: Number,
  fuel: Number,
  emissions: {
    nox: Number,
    sox: Number,
    co: Number,
    particulate: Number,
    stackTemp: Number
  },
  water: {
    roProduction: Number
  },
  airIntakeDP: Number,
  aux: Number,
  mfeqh: Number,
  weather: {
    tempMax: Number,
    tempMin: Number,
    tempAvg: Number,
    maxRH: Number,
    minRH: Number,
    windSpeed: Number
  },
  units: [{
    group: String,
    unit: String,
    type: { type: String },
    load: Number,
    generation: Number,
    mfeqh: Number
  }]
}, { timestamps: true });

module.exports = mongoose.model('PlantPerformance', PlantPerformanceSchema);
