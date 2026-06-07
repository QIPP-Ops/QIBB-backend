const crypto = require('crypto');
const fs = require('fs');
const {
  readBundledRaw,
  listBundledKinds,
  bundledPath,
  KIND_TO_FILE,
} = require('./trendsBlobBundle');
const { BLOB_FILE_KIND, normalizeTrendBlobByKind } = require('./trendBlobNormalize');
const { inferMetricCategory } = require('../trends/metricCategory');

const SIX_BLOB_KINDS = Object.keys(KIND_TO_FILE);

function inferBlobFormat(raw) {
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === 'object' && Array.isArray(first.readings)) return 'readings_array';
    if (first && typeof first === 'object' && (first.units || first.gts || first.stack_emissions)) {
      return 'nested';
    }
    return 'flat';
  }
  if (raw && typeof raw === 'object' && Array.isArray(raw.data)) return 'wrapped_array';
  return 'object';
}

function slugMetricKey(metric) {
  return String(metric || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

function collectBlobMtimes() {
  const mtimes = {};
  for (const kind of SIX_BLOB_KINDS) {
    const filePath = bundledPath(kind);
    if (filePath && fs.existsSync(filePath)) {
      mtimes[kind] = fs.statSync(filePath).mtimeMs;
    }
  }
  return mtimes;
}

function buildEtag(mtimes) {
  const payload = JSON.stringify(mtimes);
  return `"${crypto.createHash('sha1').update(payload).digest('hex')}"`;
}

function cacheSignature(mtimes) {
  return Object.entries(mtimes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
}

let memoryCache = null;
let memorySig = '';

function buildPayloadFromRecords(records, meta = {}) {
  const seriesByKey = {};
  const metrics = [];
  const metricMeta = new Map();

  for (const row of records) {
    const date = String(row.date || '').slice(0, 10);
    if (!date) continue;
    const metricKey = slugMetricKey(row.metric);
    if (!metricKey) continue;

    if (!seriesByKey[metricKey]) {
      seriesByKey[metricKey] = [];
      metricMeta.set(metricKey, {
        label: row.metric,
        category: inferMetricCategory(metricKey, row.metric, row.sourceKind || ''),
        unit: '',
      });
    }

    seriesByKey[metricKey].push({
      date,
      value: row.value,
      [metricKey]: row.value,
    });
  }

  for (const [metricKey, info] of metricMeta) {
    metrics.push({
      metricKey,
      label: info.label,
      category: info.category,
      unit: info.unit,
    });
  }

  const dates = records.map((r) => String(r.date || '').slice(0, 10)).filter(Boolean).sort();
  const minDate = dates[0] ?? null;
  const maxDate = dates[dates.length - 1] ?? null;

  const totalPoints = Object.values(seriesByKey).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0
  );

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: minDate ?? undefined,
      to: maxDate ?? undefined,
      minDate,
      maxDate,
      pointCount: dates.length,
    },
    metrics,
    seriesByKey,
    blobSource: true,
    blobKinds: meta.blobKinds ?? [],
    bundleMeta: {
      kindsLoaded: meta.blobKinds ?? [],
      totalMetrics: metrics.length,
      totalPoints,
      formats: meta.formats ?? {},
    },
    chemistryWater: { latest: null, snapshots: [] },
    ingestStatus: null,
  };
}

/**
 * Merge all six qipp-data blobs into unified trends payload (seriesByKey + metrics + dateRange).
 */
function buildTrendsBundleFromSixBlobs(options = {}) {
  const mtimes = collectBlobMtimes();
  const sig = cacheSignature(mtimes);

  if (!options.force && memoryCache && memorySig === sig) {
    return { payload: memoryCache, etag: buildEtag(mtimes), mtimes, fromCache: true };
  }

  const availableKinds = listBundledKinds();
  const records = [];
  const formats = {};

  for (const fileKind of availableKinds) {
    const normalizeKind = BLOB_FILE_KIND[fileKind] || fileKind;
    const raw = readBundledRaw(fileKind);
    if (raw == null) continue;
    formats[fileKind] = inferBlobFormat(raw);
    const rows = normalizeTrendBlobByKind(normalizeKind, raw);
    for (const row of rows) {
      records.push({ ...row, sourceKind: normalizeKind });
    }
  }

  const payload = buildPayloadFromRecords(records, { blobKinds: availableKinds, formats });
  memoryCache = payload;
  memorySig = sig;

  return { payload, etag: buildEtag(mtimes), mtimes, fromCache: false };
}

function hasUsableTrendsBundle(data) {
  if (!data?.generatedAt) return false;
  const series = data.seriesByKey;
  if (!series || typeof series !== 'object') return false;
  return Object.values(series).some((rows) => Array.isArray(rows) && rows.length > 0);
}

function resetTrendsBundleCache() {
  memoryCache = null;
  memorySig = '';
}

module.exports = {
  SIX_BLOB_KINDS,
  buildTrendsBundleFromSixBlobs,
  hasUsableTrendsBundle,
  resetTrendsBundleCache,
  buildEtag,
  collectBlobMtimes,
  slugMetricKey,
};
