const mongoose = require('mongoose');

const GtAirFilterSchema = new mongoose.Schema({
  report_date: { type: String, index: true },
  source_file: String,
  ingested_at: String,
}, { strict: false, collection: 'gt_air_filter' });

const GtFgFilterSchema = new mongoose.Schema({
  report_date: { type: String, index: true },
  source_file: String,
  ingested_at: String,
}, { strict: false, collection: 'gt_fg_filter' });

module.exports = {
  GtAirFilter: mongoose.models.GtAirFilter || mongoose.model('GtAirFilter', GtAirFilterSchema),
  GtFgFilter:  mongoose.models.GtFgFilter  || mongoose.model('GtFgFilter',  GtFgFilterSchema),
};