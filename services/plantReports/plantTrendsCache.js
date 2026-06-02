const fs = require('fs');
const path = require('path');
const PlantMetricPoint = require('../../models/PlantMetricPoint');
const PlantIngestionState = require('../../models/PlantIngestionState');
const TrendsSnapshot = require('../../models/TrendsSnapshot');
const { PlantMetric } = require('../../models/PlantMetric');
const { expandDayColumnSeries } = require('./seriesTimeline');
const { canonicalMetricKey, canonicalLabel, dedupeMetricsForListing } = require('./metricKeys');
const { getDateBounds } = require('./historicalDashboard');

const CACHE_DIR = path.join(__dirname, '../../data');
const CACHE_FILE = path.join(CACHE_DIR, 'plant-trends-cache.json');
const RAW_METRICS_FILE = path.join(CACHE_DIR, 'plant-raw-metrics.json');

function yearStartIso() {
  const y = new Date().getFullYear();
  return `${y}-01-01`;
}

/**
 * Build trends cache JSON from in-memory parsed points (no MongoDB).
 * Used by scripts/parse-excel-to-json.js — same shape as GET /api/plant-data/trends-cache.
 */
function buildPlantTrendsCacheFromPoints(allPoints, options = {}) {
  const points = Array.isArray(allPoints) ? allPoints.filter((p) => p && p.metricKey) : [];
  const metricDraft = new Map();
  for (const p of points) {
    const ck = canonicalMetricKey(p.metricKey);
    if (!metricDraft.has(ck)) {
      metricDraft.set(ck, {
        metricKey: ck,
        label: canonicalLabel(p.displayName || p.label, p.metricKey),
        category: p.category || 'other',
        unit: p.unit || '',
      });
    }
  }
  const metrics = dedupeMetricsForListing([...metricDraft.values()]);

  let minDate = null;
  let maxDate = null;
  for (const p of points) {
    const d = String(p.reportDate || '').slice(0, 10);
    if (!d) continue;
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  }
  const from = minDate || yearStartIso();
  const to = maxDate || new Date().toISOString().slice(0, 10);

  const inRange = points.filter((p) => {
    const d = String(p.reportDate || '').slice(0, 10);
    return d && d >= from && d <= to;
  });

  const topKeys = metrics.slice(0, 120).map((m) => m.metricKey);
  const seriesByKey = {};
  for (const key of topKeys) {
    const keyRows = inRange.filter(
      (r) => r.metricKey === key || String(r.metricKey).startsWith(`${key}_day`)
    );
    const series = expandDayColumnSeries(keyRows, [key, ...keyRows.map((r) => r.metricKey)]);
    if (series.length) seriesByKey[key] = series;
  }

  return {
    generatedAt: new Date().toISOString(),
    dateRange: { from, to, minDate, maxDate },
    metrics: metrics.map((m) => ({
      metricKey: m.metricKey,
      label: m.label,
      category: m.category,
      unit: m.unit || '',
    })),
    seriesByKey,
    chemistryWater: options.chemistryWater || { latest: null, snapshots: [] },
    ingestStatus: options.ingestStatus || null,
    parseMeta: options.parseMeta || null,
  };
}

/** Chemistry/water snapshots for trends cache and public home (Mongo TrendsSnapshot). */
async function fetchChemistryWaterSection(from, to) {
  const fromStr = from || yearStartIso();
  const toStr = to || new Date().toISOString().slice(0, 10);
  const since = new Date(`${fromStr}T00:00:00.000Z`);
  const until = new Date(`${toStr}T23:59:59.999Z`);

  const latest = await TrendsSnapshot.findOne().sort({ createdAt: -1 }).lean();
  const snapshots = await TrendsSnapshot.find({ createdAt: { $gte: since, $lte: until } })
    .sort({ createdAt: 1 })
    .limit(2000)
    .select('createdAt water chemistry energy dailyOps')
    .lean();

  return {
    latest: latest
      ? {
          createdAt: latest.createdAt,
          chemistry: latest.chemistry || null,
          water: latest.water || null,
        }
      : null,
    snapshots: snapshots.map((s) => ({
      createdAt: s.createdAt,
      chemistry: s.chemistry || null,
      water: s.water || null,
      energy: s.energy || null,
      dailyOps: s.dailyOps || null,
    })),
  };
}

function chemistryWaterHasData(cw) {
  if (!cw) return false;
  if (cw.latest?.chemistry || cw.latest?.water) return true;
  return Array.isArray(cw.snapshots) && cw.snapshots.some((s) => s.chemistry || s.water);
}

async function buildPlantTrendsCachePayload() {
  const bounds = await getDateBounds();
  const from = bounds.minDate?.slice(0, 10) || yearStartIso();
  const to = bounds.maxDate?.slice(0, 10) || new Date().toISOString().slice(0, 10);

  const metrics = dedupeMetricsForListing(
    await PlantMetric.find({ enabledGlobally: { $ne: false } }).lean()
  );

  const topKeys = metrics.slice(0, 120).map((m) => m.metricKey);
  const rows = await PlantMetricPoint.find({
    metricKey: { $in: topKeys },
    reportDate: { $gte: from, $lte: to },
  })
    .sort({ reportDate: 1 })
    .lean();

  const seriesByKey = {};
  for (const key of topKeys) {
    const keyRows = rows.filter((r) => r.metricKey === key || r.metricKey.startsWith(`${key}_day`));
    const series = expandDayColumnSeries(keyRows, [key, ...keyRows.map((r) => r.metricKey)]);
    if (series.length) seriesByKey[key] = series;
  }

  const chemistryWater = await fetchChemistryWaterSection(from, to);

  const ingest = await PlantIngestionState.findOne({ key: 'global' }).lean();

  return {
    generatedAt: new Date().toISOString(),
    dateRange: { from, to, ...bounds },
    metrics: metrics.map((m) => ({
      metricKey: m.metricKey,
      label: m.label,
      category: m.category,
      unit: m.unit || '',
    })),
    seriesByKey,
    chemistryWater,
    ingestStatus: ingest
      ? {
          lastSuccessAt: ingest.lastSuccessAt,
          filesProcessed: ingest.filesProcessed,
          filesScanned: ingest.filesScanned,
          pointsUpserted: ingest.pointsUpserted,
          metricsDiscovered: ingest.metricsDiscovered,
          ingestSource: ingest.ingestSource,
        }
      : null,
  };
}

async function writePlantTrendsCache() {
  const payload = await buildPlantTrendsCachePayload();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(payload), 'utf8');
  return { path: CACHE_FILE, generatedAt: payload.generatedAt, metricCount: payload.metrics.length };
}

function readPlantTrendsCacheFromDisk() {
  if (!fs.existsSync(CACHE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/** True when committed/deployed cache has trend data (skip heavy startup blob parse). */
function hasUsablePlantTrendsCache(data = readPlantTrendsCacheFromDisk()) {
  if (!data?.generatedAt) return false;
  if (Array.isArray(data.metrics) && data.metrics.length > 0) return true;
  const series = data.seriesByKey;
  return Boolean(series && typeof series === 'object' && Object.keys(series).length > 0);
}

function writeTrendsCacheFiles(payload, rawPayload) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(payload), 'utf8');
  if (rawPayload) {
    fs.writeFileSync(RAW_METRICS_FILE, JSON.stringify(rawPayload), 'utf8');
  }
  return {
    cachePath: CACHE_FILE,
    rawPath: rawPayload ? RAW_METRICS_FILE : null,
    generatedAt: payload.generatedAt,
    metricCount: payload.metrics.length,
    seriesCount: Object.keys(payload.seriesByKey || {}).length,
    pointCount: rawPayload?.pointCount ?? 0,
  };
}

module.exports = {
  CACHE_FILE,
  RAW_METRICS_FILE,
  buildPlantTrendsCachePayload,
  buildPlantTrendsCacheFromPoints,
  writePlantTrendsCache,
  writeTrendsCacheFiles,
  readPlantTrendsCacheFromDisk,
  hasUsablePlantTrendsCache,
  fetchChemistryWaterSection,
  chemistryWaterHasData,
  yearStartIso,
};
