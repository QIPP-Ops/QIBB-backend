const mongoose = require('mongoose');

/** One numeric reading extracted from a plant Excel report */
const PlantMetricPointSchema = new mongoose.Schema({
  metricKey: { type: String, required: true, index: true },
  label: { type: String, required: true },
  category: { type: String, default: 'general', index: true },
  unit: { type: String, default: '' },
  reportDate: { type: String, required: true, index: true },
  value: { type: Number, required: true },
  equipmentId: { type: String, default: '' },
  sourceFile: { type: String, required: true },
  sheetName: { type: String, default: '' },
  columnKey: { type: String, default: '' },
}, { timestamps: true });

PlantMetricPointSchema.index(
  { metricKey: 1, reportDate: 1, sourceFile: 1, equipmentId: 1, columnKey: 1 },
  { unique: true }
);

module.exports = mongoose.model('PlantMetricPoint', PlantMetricPointSchema);
