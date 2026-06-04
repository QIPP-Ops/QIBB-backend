const mongoose = require('mongoose');

const SavedTrendSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, required: true },
    metric: { type: String, required: true },
    units: [{ type: String }],
    chartType: { type: String, enum: ['line', 'bar', 'area'], default: 'line' },
    from: { type: String, default: null },
    to: { type: String, default: null },
    rollingDays: { type: Number, default: 30 },
    createdBy: { type: String, required: true },
    showOnHomePage: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model('SavedTrend', SavedTrendSchema, 'savedtrends');
