#!/usr/bin/env node
/**
 * Rebuild plant-trends-cache.json from Cosmos PlantMetricPoint (production path).
 *
 * Usage: npm run rebuild:trends-cache
 * Env: MONGODB_URI or COSMOS_URI
 */
require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/database');
const { writePlantTrendsCache, getPlantTrendsCachePath } = require('../services/plantReports/plantTrendsCache');

async function main() {
  await connectDB();
  try {
    const result = await writePlantTrendsCache();
    const path = getPlantTrendsCachePath();
    console.log(
      `[rebuild-trends-cache] ok — ${result.metricCount ?? 0} metrics → ${path} (${result.generatedAt || 'now'})`
    );
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  console.error('[rebuild-trends-cache] failed:', err.message);
  process.exit(1);
});
