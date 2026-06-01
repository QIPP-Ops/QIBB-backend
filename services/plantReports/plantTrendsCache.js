const fs = require('fs');
const path = require('path');
const PlantMetricPoint = require('../../models/PlantMetricPoint');
const PlantIngestionState = require('../../models/PlantIngestionState');
const TrendsSnapshot = require('../../models/TrendsSnapshot');
const { PlantMetric } = require('../../models/PlantMetric');
const { expandDayColumnSeries } = require('./seriesTimeline');
const { dedupeMetricsForListing } = require('./metricKeys');
const { getDateBounds } = require('./historicalDashboard');

const CACHE_DIR = path.join(__dirname, '../../data');
const CACHE_FILE = path.join(CACHE_DIR, 'plant-trends-cache.json');

function yearStartIso() {
  const y = new Date().getFullYear();
  return `${y}-01-01`;
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

  const since = new Date(`${from}T00:00:00.000Z`);
  const until = new Date(`${to}T23:59:59.999Z`);
  const latest = await TrendsSnapshot.findOne().sort({ createdAt: -1 }).lean();
  const snapshots = await TrendsSnapshot.find({ createdAt: { $gte: since, $lte: until } })
    .sort({ createdAt: 1 })
    .limit(2000)
    .select('createdAt water chemistry energy dailyOps')
    .lean();

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
    chemistryWater: {
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
    },
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

module.exports = {
  CACHE_FILE,
  buildPlantTrendsCachePayload,
  writePlantTrendsCache,
  readPlantTrendsCacheFromDisk,
  hasUsablePlantTrendsCache,
  yearStartIso,
};
