const { buildTrendsBundleFromSixBlobs, hasUsableTrendsBundle } = require('./buildTrendsBundleFromSixBlobs');

function isoDay(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function buildMetricDisplayNameMapFromBundle(payload) {
  const data = {};
  const seriesByKey = payload?.seriesByKey ?? {};

  for (const metric of payload?.metrics ?? []) {
    const series = seriesByKey[metric.metricKey] || [];
    let earliest = null;
    let latest = null;
    for (const row of series) {
      const day = isoDay(row.date);
      if (!day) continue;
      if (!earliest || day < earliest) earliest = day;
      if (!latest || day > latest) latest = day;
    }
    const entry = {
      dateRange: earliest && latest ? { earliest, latest } : null,
    };
    if (metric.label) entry.displayName = metric.label;
    data[metric.metricKey] = entry;
  }

  return data;
}

async function applyTrendDisplayOverrides(data) {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return data;
    const TrendDisplayConfig = require('../../models/TrendDisplayConfig');
    const cfg = await TrendDisplayConfig.findOne({ singleton: 'default' }).lean();
    const overrides = cfg?.metricLabels || {};
    for (const [key, label] of Object.entries(overrides)) {
      const dn = String(label || '').trim();
      if (!dn) continue;
      if (data[key]) data[key].displayName = dn;
      else data[key] = { displayName: dn, dateRange: null };
    }
  } catch {
    /* optional when DB unavailable */
  }
  return data;
}

/**
 * GET /plant-data/metric-display-names payload: per metricKey
 * { displayName?, dateRange: { earliest, latest } | null }
 * Built from six-blob bundle; Mongo overrides optional (TrendDisplayConfig only).
 */
async function buildMetricDisplayNameMap() {
  try {
    const { payload } = buildTrendsBundleFromSixBlobs();
    if (hasUsableTrendsBundle(payload)) {
      const data = buildMetricDisplayNameMapFromBundle(payload);
      return applyTrendDisplayOverrides(data);
    }
  } catch {
    /* bundle unavailable */
  }
  return {};
}

/** @deprecated Cosmos date ranges removed — bundle is source of truth. */
async function fetchMetricDateRangesByKey() {
  return new Map();
}

/** @deprecated PlantMetric catalog removed — bundle metrics are source of truth. */
async function buildDisplayNameStrings() {
  const map = await buildMetricDisplayNameMap();
  const out = {};
  for (const [key, entry] of Object.entries(map)) {
    if (entry?.displayName) out[key] = entry.displayName;
  }
  return out;
}

module.exports = {
  buildMetricDisplayNameMap,
  buildDisplayNameStrings,
  fetchMetricDateRangesByKey,
  buildMetricDisplayNameMapFromBundle,
};
