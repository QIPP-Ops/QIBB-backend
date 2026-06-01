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

const TrendDisplayConfigSchema = new mongoose.Schema({
  singleton: { type: String, default: 'default', unique: true },
  panels: { type: [PanelOverrideSchema], default: [] },
  customTrends: { type: [CustomTrendOverrideSchema], default: [] },
  metricLabels: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('TrendDisplayConfig', TrendDisplayConfigSchema);
