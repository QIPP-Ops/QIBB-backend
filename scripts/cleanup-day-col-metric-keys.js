#!/usr/bin/env node
/**
 * Delete PlantMetricPoint documents whose metricKey embeds day/column indices
 * (legacy ingest: total_dm_prod_day_5, generation_col_4, etc.).
 *
 * Usage: npm run cleanup:day-col-metrics
 * Env: MONGODB_URI or COSMOS_URI
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { getMongoUri } = require('../config/database');
const { deleteBadDayColMetricPoints } = require('../services/plantReports/productionBootCleanup');

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('Set MONGODB_URI or COSMOS_URI');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, { retryWrites: false, serverSelectionTimeoutMS: 20000 });
  } catch (err) {
    if (err.code === 'ETIMEOUT' || /timed out/i.test(err.message)) {
      console.error(
        'Cosmos connection timed out (ETIMEOUT). Run from production network or VPN.'
      );
      process.exit(2);
    }
    throw err;
  }

  const result = await deleteBadDayColMetricPoints();
  console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
