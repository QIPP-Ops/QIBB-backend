const mongoose = require('mongoose');

const ChemistryHistorySchema = new mongoose.Schema(
  {
    parameterKey: { type: String, required: true, index: true },
    tankName: { type: String, default: '' },
    value: { type: Number, required: true },
    unit: { type: String, default: '' },
    timestamp: { type: Date, required: true, index: true },
    source: { type: String, default: 'ingest' },
  },
  { timestamps: true }
);

ChemistryHistorySchema.index({ parameterKey: 1, timestamp: 1 });

module.exports = mongoose.model('ChemistryHistory', ChemistryHistorySchema);
