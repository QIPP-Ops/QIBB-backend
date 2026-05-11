const mongoose = require('mongoose');

const WaterBalanceSchema = new mongoose.Schema({
  report_date:  { type: String, index: true },
  source_file:  String,
  ingested_at:  String,
}, { strict: false, collection: 'water_balance' });

module.exports = mongoose.models.WaterBalance ||
  mongoose.model('WaterBalance', WaterBalanceSchema);