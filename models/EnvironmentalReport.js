const mongoose = require('mongoose');

const EnvironmentalReportSchema = new mongoose.Schema({ // TODO: COSMOS_COMPAT_CHECK
  date: { type: Date, required: true, unique: true },
  so2: Number,
  nox: Number,
  co: Number,
  particulate: Number,
  stackTemp: Number,
  remarks: String
}, { timestamps: true });

module.exports = mongoose.model('EnvironmentalReport', EnvironmentalReportSchema);