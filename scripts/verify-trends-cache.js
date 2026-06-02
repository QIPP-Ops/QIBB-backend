#!/usr/bin/env node
/**
 * CI / post-ingest check: plant-trends-cache.json must have time series data.
 *
 * Usage:
 *   node scripts/verify-trends-cache.js
 *   node scripts/verify-trends-cache.js path/to/plant-trends-cache.json
 */
const path = require('path');
const {
  CACHE_FILE,
  readPlantTrendsCacheFromDisk,
  hasUsablePlantTrendsCache,
  hasTrendSeriesData,
} = require('../services/plantReports/plantTrendsCache');

const cachePath = process.argv[2] ? path.resolve(process.argv[2]) : CACHE_FILE;
const data = process.argv[2]
  ? JSON.parse(require('fs').readFileSync(cachePath, 'utf8'))
  : readPlantTrendsCacheFromDisk();

if (!data) {
  console.error(`[verify-trends-cache] missing file: ${cachePath}`);
  process.exit(1);
}

const metricCount = Array.isArray(data.metrics) ? data.metrics.length : 0;
const seriesKeys = Object.keys(data.seriesByKey || {}).filter(
  (k) => Array.isArray(data.seriesByKey[k]) && data.seriesByKey[k].length > 0
);

if (!hasUsablePlantTrendsCache(data) || !hasTrendSeriesData(data)) {
  console.error(
    `[verify-trends-cache] FAIL ${cachePath}: metrics=${metricCount}, seriesKeys=${seriesKeys.length}`
  );
  console.error(
    '  Run: npm run ingest:parse-json  OR  npm run ingest:local -- --cache-only  (with Cosmos populated)'
  );
  process.exit(1);
}

console.log(
  `[verify-trends-cache] OK ${cachePath}: metrics=${metricCount}, seriesKeys=${seriesKeys.length}, generatedAt=${data.generatedAt}`
);
process.exit(0);
