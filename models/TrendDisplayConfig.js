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

const TrendDisplayConfigSchema = new mongoose.Schema({
  singleton: { type: String, default: 'default', unique: true },
  panels: { type: [PanelOverrideSchema], default: [] },
  customTrends: { type: [CustomTrendOverrideSchema], default: [] },
  metricLabels: { type: mongoose.Schema.Types.Mixed, default: {} },
  homePageLayout: { type: [HomePageSectionSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('TrendDisplayConfig', TrendDisplayConfigSchema);
