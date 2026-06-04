#!/usr/bin/env node
/**
 * Delete stale Daily_water_consumption PlantMetricPoint rows and re-ingest matching blobs/files.
 *
 * Usage:
 *   node scripts/reingest-daily-water-consumption.js
 *   node scripts/reingest-daily-water-consumption.js "C:\path\to\reports"
 *
 * Env: MONGODB_URI or COSMOS_URI; BLOB_SAS_URL (preferred) or ALLOW_LOCAL_FOLDER_INGEST=1 + PLANT_REPORTS_DIR
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { getMongoUri } = require('../config/database');
const PlantMetricPoint = require('../models/PlantMetricPoint');
const { filenameMatchesPattern } = require('../services/plantReports/fileMappingService');
const { walkExcel } = require('../services/plantReports/extractOpsHighlights');
const { ingestWorkbook, ingestWorkbookFromBuffer } = require('../services/plantReports/ingestWorkbook');
const { processIngestResult } = require('../services/plantReports/ingestProcessResult');
const { writePlantTrendsCache } = require('../services/plantReports/plantTrendsCache');
const {
  listReportBlobs,
  downloadBlobBuffer,
} = require('../services/plantReports/blobReports');
const {
  blobIngestConfigured,
  allowLocalFolderIngest,
} = require('../services/plantReports/blobIngestPolicy');

const FOLLOWUP_PATTERN = '*Daily_water_consumption_followup*';
const DELETE_SOURCE_RE = /Daily_water_consumption/i;

function matchesFollowup(name) {
  return filenameMatchesPattern(path.basename(name), FOLLOWUP_PATTERN);
}

async function reingestLocal(reportsRoot) {
  const files = walkExcel(reportsRoot).filter((f) => matchesFollowup(f));
  let filesProcessed = 0;
  let pointsUpserted = 0;

  for (const filePath of files) {
    const rel = path.relative(reportsRoot, filePath).replace(/\\/g, '/');
    const result = await ingestWorkbook(filePath, reportsRoot);
    const stats = await processIngestResult(result);
    if (!result.skipped) {
      filesProcessed += 1;
      pointsUpserted += stats.pointsUpserted;
    }
    console.log(`[reingest-water] ${rel}: ${stats.pointsUpserted} point(s)`);
  }

  return { filesProcessed, pointsUpserted, filesScanned: files.length };
}

async function reingestBlob() {
  const blobs = await listReportBlobs({ maxAgeDays: 3650 });
  const matching = blobs.filter((b) => matchesFollowup(b.name));
  let filesProcessed = 0;
  let pointsUpserted = 0;

  for (const blob of matching) {
    const buffer = await downloadBlobBuffer(blob.name);
    const result = await ingestWorkbookFromBuffer(buffer, blob.name, {
      lastModified: blob.lastModified,
    });
    const stats = await processIngestResult(result);
    if (!result.skipped) {
      filesProcessed += 1;
      pointsUpserted += stats.pointsUpserted;
    }
    console.log(`[reingest-water] ${blob.name}: ${stats.pointsUpserted} point(s)`);
  }

  return { filesProcessed, pointsUpserted, filesScanned: matching.length };
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('Set MONGODB_URI or COSMOS_URI in .env');
    process.exit(1);
  }

  const reportsRootArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (reportsRootArg) {
    process.env.PLANT_REPORTS_DIR = reportsRootArg;
  }

  await mongoose.connect(uri, { retryWrites: false });
  console.log('MongoDB connected');

  const { BAD_METRIC_KEY_RE } = require('../services/plantReports/metricKeys');
  const deleted = await PlantMetricPoint.deleteMany({
    $or: [
      { sourceFile: { $regex: DELETE_SOURCE_RE } },
      { metricKey: { $regex: BAD_METRIC_KEY_RE }, category: 'water' },
    ],
  });
  console.log(
    `Deleted ${deleted.deletedCount} PlantMetricPoint doc(s) (water followup + bad day/col keys)`
  );

  let batch;
  if (blobIngestConfigured()) {
    console.log('Re-ingesting from Azure Blob…');
    batch = await reingestBlob();
  } else if (allowLocalFolderIngest() && process.env.PLANT_REPORTS_DIR?.trim()) {
    const root = process.env.PLANT_REPORTS_DIR.trim();
    if (!fs.existsSync(root)) {
      console.error(`PLANT_REPORTS_DIR not found: ${root}`);
      process.exit(1);
    }
    console.log(`Re-ingesting from folder: ${root}`);
    batch = await reingestLocal(root);
  } else {
    console.warn('No blob config or ALLOW_LOCAL_FOLDER_INGEST=1 + PLANT_REPORTS_DIR — delete-only run');
    batch = { filesProcessed: 0, pointsUpserted: 0, filesScanned: 0 };
  }

  const pointCount = await PlantMetricPoint.countDocuments({
    sourceFile: { $regex: DELETE_SOURCE_RE },
  });

  let trendsCache = { ok: false, skipped: true };
  try {
    trendsCache = await writePlantTrendsCache();
  } catch (err) {
    trendsCache = { ok: false, message: err.message };
  }

  const summary = {
    deletedCount: deleted.deletedCount,
    filesScanned: batch.filesScanned,
    filesProcessed: batch.filesProcessed,
    pointsUpserted: batch.pointsUpserted,
    plantMetricPointCount: pointCount,
    trendsCache,
  };
  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
