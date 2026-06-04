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
const PlantMetricPoint = require('../models/PlantMetricPoint');
const { endOfToday, todayIso } = require('../services/plantReports/reportDateGuards');

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('Set MONGODB_URI or COSMOS_URI');
    process.exit(1);
  }

  const today = todayIso();
  const cutoff = endOfToday();

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

  const futureCount = await PlantMetricPoint.countDocuments({ reportDate: { $gt: today } });
  console.log(`PlantMetricPoint with reportDate > ${today}: ${futureCount}`);

  if (futureCount === 0) {
    console.log('Nothing to delete.');
    await mongoose.disconnect();
    return;
  }

  const res = await PlantMetricPoint.deleteMany({ reportDate: { $gt: today } });
  console.log(`Deleted ${res.deletedCount} document(s) (cutoff end-of-today: ${cutoff.toISOString()})`);

  const remaining = await PlantMetricPoint.countDocuments({ reportDate: { $gt: today } });
  console.log(`Remaining future-dated rows: ${remaining}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
