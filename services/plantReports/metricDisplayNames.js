const FileMapping = require('../../models/FileMapping');
const { PlantMetric } = require('../../models/PlantMetric');
const { slugKey } = require('./excelUtils');
const { canonicalMetricKey } = require('./metricKeys');

async function buildMetricDisplayNameMap() {
  const map = {};

  const mappings = await FileMapping.find().lean();
  for (const mapping of mappings) {
    for (const m of mapping.metrics || []) {
      const displayName = String(m.displayName || '').trim();
      if (!displayName) continue;
      const key = slugKey(['mapped', mapping.name, displayName]);
      map[key] = displayName;
      map[canonicalMetricKey(key)] = displayName;
    }
  }

  const metrics = await PlantMetric.find().select('metricKey label displayName').lean();
  for (const m of metrics) {
    const ck = canonicalMetricKey(m.metricKey);
    const dn = String(m.displayName || '').trim();
    const label = String(m.label || '').trim();
    if (dn && !map[ck]) map[ck] = dn;
    if (label && !/^col\d+$/i.test(label) && !map[ck]) map[ck] = label;
    if (dn) map[m.metricKey] = dn;
    if (label && !/^col\d+$/i.test(label)) map[m.metricKey] = map[m.metricKey] || label;
  }

  try {
    const TrendDisplayConfig = require('../../models/TrendDisplayConfig');
    const cfg = await TrendDisplayConfig.findOne({ singleton: 'default' }).lean();
    const overrides = cfg?.metricLabels || {};
    for (const [key, label] of Object.entries(overrides)) {
      const dn = String(label || '').trim();
      if (dn) map[key] = dn;
    }
  } catch {
    /* optional when DB unavailable */
  }

  return map;
}

module.exports = { buildMetricDisplayNameMap };
