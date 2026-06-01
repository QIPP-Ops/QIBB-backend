#!/usr/bin/env node
/**
 * Run plant Excel ingest locally and rebuild data/plant-trends-cache.json.
 *
 * Usage:
 *   npm run ingest:local
 *   npm run ingest:local -- --force
 *   npm run ingest:local -- --cache-only
 *   npm run ingest:local -- "C:\path\to\excel\reports"
 *
 * Env (see .env.example):
 *   MONGODB_URI or COSMOS_URI — required (Cosmos DB)
 *   BLOB_SAS_URL or AZURE_STORAGE_CONNECTION_STRING — production-style ingest from Azure "report" container
 *   PLANT_REPORTS_DIR — local folder of .xlsx files (only used when blob vars are NOT set)
 *
 * Blob wins: if BLOB_SAS_URL is set, PLANT_REPORTS_DIR is ignored. For folder-only local runs,
 * comment out blob settings in .env temporarily.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { getMongoUri } = require('../config/database');
const { runPlantIngestion } = require('../services/plantReports/runIngestion');
const { writePlantTrendsCache } = require('../services/plantReports/plantTrendsCache');
const { blobIngestConfigured } = require('../services/plantReports/blobReports');

const args = process.argv.slice(2);
const forceAll = args.includes('--force');
const cacheOnly = args.includes('--cache-only');
const reportsRoot = args.find((a) => !a.startsWith('--'));

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('Set MONGODB_URI or COSMOS_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(uri, { retryWrites: false });
  console.log('MongoDB connected');

  if (cacheOnly) {
    const cache = await writePlantTrendsCache();
    console.log('Trends cache written:', cache);
    await mongoose.disconnect();
    return;
  }

  if (reportsRoot) {
    process.env.PLANT_REPORTS_DIR = reportsRoot;
  }

  if (!blobIngestConfigured() && !process.env.PLANT_REPORTS_DIR?.trim()) {
    console.error(
      'Configure BLOB_SAS_URL (blob ingest) or PLANT_REPORTS_DIR / pass a folder path for local files.'
    );
    process.exit(1);
  }

  const source = blobIngestConfigured() ? 'Azure Blob' : `folder: ${process.env.PLANT_REPORTS_DIR}`;
  console.log(`Ingest source: ${source}${forceAll ? ' (forceAll)' : ''}`);

  const result = await runPlantIngestion({ forceAll, reportsRoot: process.env.PLANT_REPORTS_DIR });
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
