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
 *   PLANT_REPORTS_DIR — local folder (requires ALLOW_LOCAL_FOLDER_INGEST=1)
 *   ALLOW_LOCAL_FOLDER_INGEST=1 — enable dev folder ingest when blob is not configured
 *
 * Production ingest uses Azure Blob only. Blob wins when configured.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { getMongoUri } = require('../config/database');
const { runPlantIngestion } = require('../services/plantReports/runIngestion');
const { writePlantTrendsCache } = require('../services/plantReports/plantTrendsCache');
const {
  blobIngestConfigured,
  resolveIngestSource,
  allowLocalFolderIngest,
} = require('../services/plantReports/blobIngestPolicy');

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

  const source = resolveIngestSource({ reportsRoot: process.env.PLANT_REPORTS_DIR });
  if (!source) {
    console.error(
      'Configure BLOB_SAS_URL / AZURE_STORAGE_CONNECTION_STRING for blob ingest, or set ALLOW_LOCAL_FOLDER_INGEST=1 with PLANT_REPORTS_DIR.'
    );
    process.exit(1);
  }

  const sourceLabel =
    source === 'blob' ? 'Azure Blob' : `local folder: ${process.env.PLANT_REPORTS_DIR}`;
  if (source === 'local' && !allowLocalFolderIngest()) {
    console.error('Local folder ingest requires ALLOW_LOCAL_FOLDER_INGEST=1');
    process.exit(1);
  }
  console.log(`Ingest source: ${sourceLabel}${forceAll ? ' (forceAll)' : ''}`);

  const result = await runPlantIngestion({ forceAll, reportsRoot: process.env.PLANT_REPORTS_DIR });
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
