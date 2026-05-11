const mongoose = require('mongoose');

const EnergyHourlySchema = new mongoose.Schema({
  report_date: { type: String, index: true },
  source_file: String,
  ingested_at: String,
}, { strict: false, collection: 'energy_hourly' });

module.exports = mongoose.models.EnergyHourly ||
  mongoose.model('EnergyHourly', EnergyHourlySchema);