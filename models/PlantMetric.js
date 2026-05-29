const mongoose = require('mongoose');

/** Catalog entry for one measurable field from plant Excel reports */
const PlantMetricSchema = new mongoose.Schema({
  metricKey: { type: String, required: true, unique: true },
  label: { type: String, required: true },
  displayName: { type: String, default: '' },
  category: { type: String, default: 'general' },
  unit: { type: String, default: '' },
  sourceFilePattern: { type: String, default: '' },
  sheetName: { type: String, default: '' },
  columnKey: { type: String, default: '' },
  enabledGlobally: { type: Boolean, default: true },
  showOnMainTrend: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
}, { timestamps: true });

const PlantMetricVisibilitySchema = new mongoose.Schema({
  metricKey: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  visible: { type: Boolean, default: true },
}, { timestamps: true });

PlantMetricVisibilitySchema.index({ metricKey: 1, userId: 1 }, { unique: true });

const CustomTrendSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  chartType: {
    type: String,
    enum: ['line', 'area', 'bar', 'composed'],
    default: 'line',
  },
  metricKeys: [{ type: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  sharedWithManagement: { type: Boolean, default: false },
  allowedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }],
  showOnHomePage: { type: Boolean, default: false },
  chartTheme: {
    type: String,
    enum: ['light', 'chemistry', 'emissions', 'st-units'],
    default: 'light',
  },
}, { timestamps: true });

const ManagementTrendAccessSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', unique: true, required: true },
  canBuildTrends: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = {
  PlantMetric: mongoose.model('PlantMetric', PlantMetricSchema),
  PlantMetricVisibility: mongoose.model('PlantMetricVisibility', PlantMetricVisibilitySchema),
  CustomTrend: mongoose.model('CustomTrend', CustomTrendSchema),
  ManagementTrendAccess: mongoose.model('ManagementTrendAccess', ManagementTrendAccessSchema),
};
