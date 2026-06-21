const fs = require('fs');
const os = require('os');
const path = require('path');
const PlantMetricPoint = require('../../models/PlantMetricPoint');
const PlantIngestionState = require('../../models/PlantIngestionState');
const TrendsSnapshot = require('../../models/TrendsSnapshot');
const { PlantMetric } = require('../../models/PlantMetric');
const { expandDayColumnSeries } = require('./seriesTimeline');
const { canonicalMetricKey, canonicalLabel, dedupeMetricsForListing } = require('./metricKeys');
const { getDateBounds } = require('./historicalDashboard');

/** Committed seed / deploy bundle. */
const BUNDLED_CACHE_DIR = path.join(__dirname, '../../data');
const BUNDLED_CACHE_FILE = path.join(BUNDLED_CACHE_DIR, 'plant-trends-cache.json');
const BUNDLED_RAW_METRICS_FILE = path.join(BUNDLED_CACHE_DIR, 'plant-raw-metrics.json');

let resolvedCacheDir = null;

/** Test-only: clear memoized writable dir between cases. */
function resetPlantTrendsCacheDir() {
  resolvedCacheDir = null;
}

/**
 * Writable directory for plant-trends-cache.json (and plant-raw-metrics.json).
 * Set PLANT_TRENDS_CACHE_DIR when the bundled data/ dir is read-only.
 */
function isDirWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-probe-${process.pid}`);
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function getPlantTrendsCacheDir() {
  if (resolvedCacheDir) return resolvedCacheDir;

  if (process.env.PLANT_TRENDS_CACHE_DIR) {
    resolvedCacheDir = path.resolve(process.env.PLANT_TRENDS_CACHE_DIR);
    return resolvedCacheDir;
  }

  const homeData = path.join(process.env.HOME || '/home', 'data');
  const tmpFallback = path.join(os.tmpdir(), 'qibb-plant-trends');
  const candidates = [BUNDLED_CACHE_DIR, homeData, tmpFallback];

  for (const dir of candidates) {
    if (isDirWritable(dir)) {
      resolvedCacheDir = dir;
      break;
    }
  }

  if (!resolvedCacheDir) {
    resolvedCacheDir = tmpFallback;
    fs.mkdirSync(resolvedCacheDir, { recursive: true });
  }

  if (resolvedCacheDir !== BUNDLED_CACHE_DIR) {
    console.log(
      `[plant-trends-cache] writable dir: ${resolvedCacheDir} (bundled seed: ${BUNDLED_CACHE_DIR})`
    );
  }

  return resolvedCacheDir;
}

function getPlantTrendsCachePath() {
  return path.join(getPlantTrendsCacheDir(), 'plant-trends-cache.json');
}

function getPlantRawMetricsPath() {
  return path.join(getPlantTrendsCacheDir(), 'plant-raw-metrics.json');
}

/**
 * First deploy: copy bundled wwwroot cache into writable dir when writable file is absent.
 */
function seedPlantTrendsCacheFromBundledIfNeeded() {
  const target = getPlantTrendsCachePath();
  if (fs.existsSync(target)) return { seeded: false, path: target };
  if (!fs.existsSync(BUNDLED_CACHE_FILE)) return { seeded: false, path: target };

  try {
    const dir = getPlantTrendsCacheDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(BUNDLED_CACHE_FILE, target);
    if (fs.existsSync(BUNDLED_RAW_METRICS_FILE)) {
      fs.copyFileSync(BUNDLED_RAW_METRICS_FILE, getPlantRawMetricsPath());
    }
    console.log(`[plant-trends-cache] seeded from bundle → ${target}`);
    return { seeded: true, path: target };
  } catch (err) {
    console.warn(`[plant-trends-cache] seed skipped (${target}): ${err.message}`);
    return { seeded: false, path: target, error: err.message };
  }
}

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
      (r) =>
        r.metricKey === key ||
        /_day_?\d+$/i.test(String(r.metricKey)) &&
          canonicalMetricKey(r.metricKey) === key
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

  const keyCounts = await PlantMetricPoint.aggregate([
    { $match: { reportDate: { $gte: from, $lte: to } } },
    { $group: { _id: '$metricKey', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 240 },
  ]);
  const topKeys = [];
  const seenCanonical = new Set();
  for (const row of keyCounts) {
    const ck = canonicalMetricKey(row._id);
    if (!ck || seenCanonical.has(ck)) continue;
    seenCanonical.add(ck);
    topKeys.push(ck);
    if (topKeys.length >= 120) break;
  }
  if (!topKeys.length) {
    topKeys.push(...metrics.slice(0, 40).map((m) => m.metricKey));
  }

  const rows = await PlantMetricPoint.find({
    reportDate: { $gte: from, $lte: to },
    $or: topKeys.flatMap((key) => [
      { metricKey: key },
      { metricKey: { $regex: new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_day_?\\d+$`, 'i') } },
    ]),
  })
    .sort({ reportDate: 1 })
    .lean();

  const seriesByKey = {};
  for (const key of topKeys) {
    const keyRows = rows.filter(
      (r) =>
        r.metricKey === key ||
        (/_day_?\d+$/i.test(String(r.metricKey)) && canonicalMetricKey(r.metricKey) === key)
    );
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

function readCacheFileAt(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function writePlantTrendsCache() {
  const cacheFile = getPlantTrendsCachePath();
  const cacheDir = getPlantTrendsCacheDir();
  const payload = await buildPlantTrendsCachePayload();
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(payload), 'utf8');
  return { path: cacheFile, generatedAt: payload.generatedAt, metricCount: payload.metrics.length };
}

function readPlantTrendsCacheFromDisk() {
  seedPlantTrendsCacheFromBundledIfNeeded();
  const active = getPlantTrendsCachePath();
  const data = readCacheFileAt(active);
  if (data) return data;
  if (active !== BUNDLED_CACHE_FILE) {
    return readCacheFileAt(BUNDLED_CACHE_FILE);
  }
  return null;
}

/** At least one metric key has a non-empty time series (required for charts/KPIs). */
function hasTrendSeriesData(data) {
  const series = data?.seriesByKey;
  if (!series || typeof series !== 'object') return false;
  return Object.values(series).some((rows) => Array.isArray(rows) && rows.length > 0);
}

/** True when committed/deployed cache has trend data (skip heavy startup blob parse). */
function hasUsablePlantTrendsCache(data = readPlantTrendsCacheFromDisk()) {
  if (!data?.generatedAt) return false;
  return hasTrendSeriesData(data);
}

function writeTrendsCacheFiles(payload, rawPayload) {
  const cacheFile = getPlantTrendsCachePath();
  const cacheDir = getPlantTrendsCacheDir();
  const rawFile = getPlantRawMetricsPath();
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(payload), 'utf8');
  if (rawPayload) {
    fs.writeFileSync(rawFile, JSON.stringify(rawPayload), 'utf8');
  }
  return {
    cachePath: cacheFile,
    rawPath: rawPayload ? rawFile : null,
    generatedAt: payload.generatedAt,
    metricCount: payload.metrics.length,
    seriesCount: Object.keys(payload.seriesByKey || {}).length,
    pointCount: rawPayload?.pointCount ?? 0,
  };
}

module.exports = {
  BUNDLED_CACHE_DIR,
  BUNDLED_CACHE_FILE,
  resetPlantTrendsCacheDir,
  getPlantTrendsCacheDir,
  getPlantTrendsCachePath,
  getPlantRawMetricsPath,
  seedPlantTrendsCacheFromBundledIfNeeded,
  get CACHE_FILE() {
    return getPlantTrendsCachePath();
  },
  get RAW_METRICS_FILE() {
    return getPlantRawMetricsPath();
  },
  buildPlantTrendsCachePayload,
  buildPlantTrendsCacheFromPoints,
  writePlantTrendsCache,
  writeTrendsCacheFiles,
  readPlantTrendsCacheFromDisk,
  hasTrendSeriesData,
  hasUsablePlantTrendsCache,
  fetchChemistryWaterSection,
  chemistryWaterHasData,
  yearStartIso,
};
