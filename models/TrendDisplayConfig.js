const mongoose = require('mongoose');

const PanelOverrideSchema = new mongoose.Schema({
  panelId: { type: String, required: true },
  displayName: { type: String, default: '' },
  metricKeys: [{ type: String }],
}, { _id: false });

const CustomTrendOverrideSchema = new mongoose.Schema({
  trendId: { type: String, required: true },
  displayName: { type: String, default: '' },
  metricKeys: [{ type: String }],
}, { _id: false });

const HomePageSectionSchema = new mongoose.Schema({
  sectionId: { type: String, required: true },
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  unitOverride: { type: String, default: '' },
}, { _id: false });

const MetricBarItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, default: '' },
  unit: { type: String, default: '' },
  color: { type: String, default: '' },
  big: { type: Boolean, default: true },
  field: { type: String, default: '' },
  metricKeys: [{ type: String }],
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, { _id: false });

const InsightStripItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, default: '' },
  unit: { type: String, default: '' },
  kpiId: { type: String, default: '' },
  metricKeys: [{ type: String }],
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, { _id: false });

const TrendDisplayConfigSchema = new mongoose.Schema({
  singleton: { type: String, default: 'default', unique: true },
  panels: { type: [PanelOverrideSchema], default: [] },
  customTrends: { type: [CustomTrendOverrideSchema], default: [] },
  metricLabels: { type: mongoose.Schema.Types.Mixed, default: {} },
  homePageLayout: { type: [HomePageSectionSchema], default: [] },
  metricBar: { type: [MetricBarItemSchema], default: [] },
  insightStrip: { type: [InsightStripItemSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('TrendDisplayConfig', TrendDisplayConfigSchema);
