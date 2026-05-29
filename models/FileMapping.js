const mongoose = require('mongoose');

const MetricMappingSchema = new mongoose.Schema(
  {
    nameCellRef: { type: String, required: true },
    valueCellRef: { type: String, required: true },
    displayName: { type: String, default: '' },
  },
  { _id: false }
);

const FileMappingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    filenamePattern: { type: String, required: true, trim: true },
    orientation: { type: String, enum: ['row', 'column'], default: 'row' },
    dateCell: { type: String, required: true, trim: true },
    headerRow: { type: Number, default: 1, min: 1 },
    metrics: { type: [MetricMappingSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

FileMappingSchema.index({ filenamePattern: 1 });

module.exports = mongoose.model('FileMapping', FileMappingSchema);
