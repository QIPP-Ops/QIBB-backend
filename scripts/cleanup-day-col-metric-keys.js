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
const PlantMetricPoint = require('../models/PlantMetricPoint');
const { PlantMetric } = require('../models/PlantMetric');
const { BAD_METRIC_KEY_RE } = require('../services/plantReports/metricKeys');

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

  const filter = { metricKey: { $regex: BAD_METRIC_KEY_RE } };
  const badCount = await PlantMetricPoint.countDocuments(filter);
  console.log(`PlantMetricPoint with bad day/col metricKey: ${badCount}`);

  let deletedCount = 0;
  if (badCount > 0) {
    const res = await PlantMetricPoint.deleteMany(filter);
    deletedCount = res.deletedCount;
    console.log(`Deleted ${deletedCount} PlantMetricPoint document(s)`);
  }

  const badMetrics = await PlantMetric.find({ metricKey: { $regex: BAD_METRIC_KEY_RE } })
    .select('metricKey')
    .lean();
  let metricsDeleted = 0;
  if (badMetrics.length) {
    const mRes = await PlantMetric.deleteMany({ metricKey: { $regex: BAD_METRIC_KEY_RE } });
    metricsDeleted = mRes.deletedCount;
    console.log(`Deleted ${metricsDeleted} PlantMetric catalog row(s)`);
  }

  const remaining = await PlantMetricPoint.countDocuments(filter);
  console.log(
    JSON.stringify(
      { deletedCount, metricsDeleted, remainingBadPoints: remaining },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
