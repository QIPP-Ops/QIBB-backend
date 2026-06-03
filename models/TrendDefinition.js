const mongoose = require('mongoose');

const MetricSeriesSchema = new mongoose.Schema(
  {
    key: { type: String, default: '' },
    keyPattern: { type: String, default: '' },
    label: { type: String, default: '' },
    color: { type: String, default: '' },
    aggregation: {
      type: String,
      enum: ['avg', 'sum', 'last', 'max', 'min'],
      default: 'avg',
    },
  },
  { _id: false }
);

const TrendDefinitionSchema = new mongoose.Schema(
  {
    panelId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    category: {
      type: String,
      enum: ['energy', 'water', 'chemistry', 'environment', 'shift', 'general'],
      default: 'general',
    },
    metricSeries: { type: [MetricSeriesSchema], default: [] },
    unit: { type: String, default: '' },
    chartType: {
      type: String,
      enum: ['line', 'area', 'bar', 'scatter', 'composed', 'gauge', 'kpi'],
      default: 'line',
    },
    theme: { type: String, default: 'default' },
    dataSource: {
      type: String,
      enum: ['plant_metric_point', 'chemistry_water'],
      default: 'plant_metric_point',
    },
    showOnHome: { type: Boolean, default: false },
    showOnManagement: { type: Boolean, default: false },
    showOnTrends: { type: Boolean, default: false },
    showOnInsightStrip: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    appliesToRoutes: { type: [String], default: [] },
    monthlyAggregation: { type: String, default: 'sum' },
    maxKeys: { type: Number, default: 4 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrendDefinition', TrendDefinitionSchema);
