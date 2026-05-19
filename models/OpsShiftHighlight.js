const mongoose = require('mongoose');

const OpsShiftHighlightSchema = new mongoose.Schema({
  reportDate: { type: String, required: true, index: true },
  sourceFile: { type: String, required: true },
  sheetName: { type: String, default: '' },
  category: { type: String, default: 'remark' },
  text: { type: String, required: true },
  author: { type: String, default: '' },
  crew: { type: String, default: '' },
  occurredAt: { type: Date, default: null },
  ingestedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

OpsShiftHighlightSchema.index({ ingestedAt: -1 });
OpsShiftHighlightSchema.index({ sourceFile: 1, reportDate: 1, text: 1 }, { unique: true });

module.exports = mongoose.model('OpsShiftHighlight', OpsShiftHighlightSchema);
