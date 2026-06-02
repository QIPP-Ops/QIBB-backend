const mongoose = require('mongoose');

const IngestLogSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, index: true },
    blobLastModified: { type: Date, required: true },
    processedAt: { type: Date, default: Date.now },
    parserUsed: { type: String, default: '' },
    noMatch: { type: Boolean, default: false },
    metricsWritten: { type: Number, default: 0 },
    skipped: { type: Boolean, default: false },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

IngestLogSchema.index({ filename: 1, blobLastModified: 1 }, { unique: true });

module.exports = mongoose.model('IngestLog', IngestLogSchema);
