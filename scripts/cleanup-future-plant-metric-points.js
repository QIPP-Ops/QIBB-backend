#!/usr/bin/env node
/**
 * Delete PlantMetricPoint documents with reportDate after local end-of-today.
 *
 * Usage: npm run cleanup:future-metrics
 * Env: MONGODB_URI or COSMOS_URI
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { getMongoUri } = require('../config/database');
const { deleteFuturePlantMetricPoints } = require('../services/plantReports/productionBootCleanup');

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
        `Cosmos connection timed out (ETIMEOUT). Run on production or VPN:\n  npm run cleanup:future-metrics`
      );
      process.exit(2);
    }
    throw err;
  }

  const result = await deleteFuturePlantMetricPoints();
  console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
