const mongoose = require('mongoose');
const FileMapping = require('../../models/FileMapping');
const PlantMetricPoint = require('../../models/PlantMetricPoint');
const { PlantMetric } = require('../../models/PlantMetric');
const { slugKey } = require('./excelUtils');
const { canonicalMetricKey } = require('./metricKeys');

function isoDay(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Min/max reportDate per metricKey from Cosmos (single aggregate). */
async function fetchMetricDateRangesByKey() {
  if (mongoose.connection.readyState !== 1) return new Map();
  try {
    const rows = await PlantMetricPoint.aggregate([
      {
        $group: {
          _id: '$metricKey',
          earliest: { $min: '$reportDate' },
          latest: { $max: '$reportDate' },
        },
      },
    ]);
    const map = new Map();
    for (const row of rows) {
      const earliest = isoDay(row.earliest);
      const latest = isoDay(row.latest);
      if (!earliest || !latest) continue;
      map.set(row._id, { earliest, latest });
    }
    return map;
  } catch {
    return new Map();
  }
}

async function buildDisplayNameStrings() {
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

/**
 * GET /plant-data/metric-display-names payload: per metricKey
 * { displayName?, dateRange: { earliest, latest } | null }
 */
async function buildMetricDisplayNameMap() {
  const displayNames = await buildDisplayNameStrings();
  const dateRanges = await fetchMetricDateRangesByKey();
  const keys = new Set([...Object.keys(displayNames), ...dateRanges.keys()]);
  const data = {};

  for (const key of keys) {
    const dn = displayNames[key];
    const dr = dateRanges.get(key);
    const entry = {
      dateRange: dr ? { earliest: dr.earliest, latest: dr.latest } : null,
    };
    if (dn) entry.displayName = dn;
    data[key] = entry;
  }

  return data;
}

module.exports = {
  buildMetricDisplayNameMap,
  buildDisplayNameStrings,
  fetchMetricDateRangesByKey,
};
