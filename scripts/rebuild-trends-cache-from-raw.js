#!/usr/bin/env node
/**
 * Rebuild data/plant-trends-cache.json from data/plant-raw-metrics.json (no re-parse).
 *
 * Usage:
 *   npm run rebuild:trends-cache
 *   node scripts/rebuild-trends-cache-from-raw.js [path/to/plant-raw-metrics.json]
 */
const fs = require('fs');
const path = require('path');
const {
  RAW_METRICS_FILE,
  buildPlantTrendsCacheFromPoints,
  writeTrendsCacheFiles,
  hasUsablePlantTrendsCache,
} = require('../services/plantReports/plantTrendsCache');

const rawPath = process.argv[2] ? path.resolve(process.argv[2]) : RAW_METRICS_FILE;

if (!fs.existsSync(rawPath)) {
  console.error(`[rebuild-trends-cache] missing: ${rawPath}`);
  console.error('  Run: npm run ingest:parse-json');
  process.exit(1);
}

console.log(`[rebuild-trends-cache] reading ${rawPath}…`);
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const points = Array.isArray(raw.points) ? raw.points : [];
if (!points.length) {
  console.error(`[rebuild-trends-cache] no points in ${rawPath} (pointCount=${raw.pointCount ?? 0})`);
  process.exit(1);
}

const cachePayload = buildPlantTrendsCacheFromPoints(points, {
  parseMeta: {
    rebuiltFromRaw: rawPath,
    source: raw.source,
    filesParsed: raw.filesParsed,
    totalPoints: points.length,
  },
});
cachePayload.ingestStatus = {
  lastSuccessAt: new Date().toISOString(),
  filesProcessed: raw.filesParsed ?? raw.files?.length ?? 0,
  filesScanned: raw.filesScanned ?? 0,
  pointsUpserted: points.length,
  metricsDiscovered: cachePayload.metrics.length,
  ingestSource: raw.source || 'rebuild-from-raw',
};

const written = writeTrendsCacheFiles(cachePayload, null);
if (!hasUsablePlantTrendsCache(cachePayload)) {
  console.error('[rebuild-trends-cache] built cache has no time series');
  process.exit(1);
}

console.log(
  `[rebuild-trends-cache] OK metrics=${written.metricCount} series=${written.seriesCount} → ${written.cachePath}`
);
