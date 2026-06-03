const path = require('path');
const PlantIngestionState = require('../../models/PlantIngestionState');
const { PlantMetric } = require('../../models/PlantMetric');
const { processIngestResult } = require('./ingestProcessResult');
const { classifyReport } = require('./excelUtils');
const { ingestWorkbookFromBuffer } = require('./ingestWorkbook');
const { getParserForFilename } = require('./parsers/parserRegistry');
const {
  listReportBlobs,
  downloadBlobBuffer,
  CONTAINER,
} = require('./blobReports');
const {
  resolveIngestSource,
  ingestSourceLabel,
  assertBlobIngestConfigured,
  blobIngestConfigured,
} = require('./blobIngestPolicy');
const { syncTrendsSnapshotFromBlob } = require('./syncTrendsSnapshot');
const { backfillTrendSnapshotsFromBlobs } = require('./backfillTrendSnapshots');
const { runLocalIngestionLegacy } = require('./runLocalIngestionLegacy');

const MAX_FILES = parseInt(process.env.PLANT_INGEST_MAX_FILES || '800', 10);
const MAX_AGE_DAYS = parseInt(process.env.PLANT_INGEST_MAX_AGE_DAYS || '365', 10);

async function runBlobIngestion(forceAll) {
  assertBlobIngestConfigured();
  const maxAge = forceAll ? 3650 : MAX_AGE_DAYS;
  const limit = forceAll ? Math.max(MAX_FILES, 800) : MAX_FILES;
  const allBlobs = await listReportBlobs({ maxAgeDays: maxAge });
  const recognized = allBlobs.filter((b) => {
    const base = path.basename(b.name);
    return Boolean(getParserForFilename(base)) || classifyReport(base) !== 'other';
  });
  const blobs = recognized.slice(0, limit);

  let pointsUpserted = 0;
  let highlightsUpserted = 0;
  let filesProcessed = 0;
  const byKind = {};
  const errors = [];

  for (const blob of blobs) {
    try {
      const buffer = await downloadBlobBuffer(blob.name);
      const result = await ingestWorkbookFromBuffer(buffer, blob.name, {
        lastModified: blob.lastModified,
      });
      const stats = await processIngestResult(result);
      if (result.skipped) continue;
      filesProcessed += 1;
      byKind[stats.kind] = (byKind[stats.kind] || 0) + 1;
      pointsUpserted += stats.pointsUpserted;
      highlightsUpserted += stats.highlightsUpserted;
    } catch (err) {
      const msg = `${blob.name}: ${err.message}`;
      console.warn(`[plant-ingest] skip blob ${msg}`);
      if (errors.length < 8) errors.push(msg);
    }
  }

  return {
    source: 'blob',
    filesScanned: allBlobs.length,
    filesRecognized: recognized.length,
    filesProcessed,
    pointsUpserted,
    highlightsUpserted,
    byKind,
    errors,
  };
}

async function runPlantIngestion(options = {}) {
  const forceAll = Boolean(options.forceAll);
  const source = resolveIngestSource(options);
  const reportsRoot = options.reportsRoot || process.env.PLANT_REPORTS_DIR;

  const sourceLabel = ingestSourceLabel(source) || '';

  await PlantIngestionState.findOneAndUpdate(
    { key: 'global' },
    { $set: { reportsRoot: sourceLabel, lastRunAt: new Date() } },
    { upsert: true, new: true }
  );

  if (!source) {
    const msg = blobIngestConfigured()
      ? 'Invalid ingest options'
      : 'Configure blob storage (BLOB_SAS_URL / AZURE_STORAGE_CONNECTION_STRING) or set ALLOW_LOCAL_FOLDER_INGEST=1 with PLANT_REPORTS_DIR for local dev';
    await PlantIngestionState.updateOne({ key: 'global' }, { $set: { lastError: msg } });
    return { ok: false, message: msg };
  }

  try {
    const batch =
      source === 'blob'
        ? await runBlobIngestion(forceAll)
        : await runLocalIngestionLegacy(reportsRoot, forceAll);

    const metricsDiscovered = await PlantMetric.countDocuments();

    let trendsSnapshot = { ok: false, skipped: true };
    let trendsBackfill = { ok: false, skipped: true };
    if (source === 'blob') {
      try {
        trendsSnapshot = await syncTrendsSnapshotFromBlob({
          maxAgeDays: forceAll ? 3650 : MAX_AGE_DAYS,
        });
      } catch (snapErr) {
        console.warn('[plant-ingest] trends snapshot sync failed:', snapErr.message);
        trendsSnapshot = { ok: false, message: snapErr.message };
      }
      try {
        trendsBackfill = await backfillTrendSnapshotsFromBlobs({
          maxAgeDays: forceAll ? 3650 : MAX_AGE_DAYS,
          maxDays: forceAll ? 366 : parseInt(process.env.TREND_BACKFILL_MAX_DAYS || '365', 10),
          maxFiles: forceAll ? Math.max(MAX_FILES, 800) : Math.max(MAX_FILES, 400),
        });
        if (trendsBackfill.ok) {
          console.log(
            `[plant-ingest] trends backfill: ${trendsBackfill.snapshotsUpserted} day(s) from ${trendsBackfill.datesConsidered} date(s)`
          );
        }
      } catch (bfErr) {
        console.warn('[plant-ingest] trends backfill failed:', bfErr.message);
        trendsBackfill = { ok: false, message: bfErr.message };
      }
    }

    let trendsCache = { ok: false, skipped: true };
    try {
      const { writePlantTrendsCache } = require('./plantTrendsCache');
      trendsCache = await writePlantTrendsCache();
    } catch (cacheErr) {
      const { getPlantTrendsCachePath } = require('./plantTrendsCache');
      const cachePath = getPlantTrendsCachePath();
      console.warn(`[plant-ingest] trends cache write failed (${cachePath}):`, cacheErr.message);
      trendsCache = { ok: false, message: cacheErr.message, path: cachePath };
    }

    await PlantIngestionState.updateOne(
      { key: 'global' },
      {
        $set: {
          lastSuccessAt: new Date(),
          lastError: '',
          filesScanned: batch.filesScanned,
          filesProcessed: batch.filesProcessed,
          highlightsFound: batch.highlightsUpserted,
          metricsDiscovered,
          pointsUpserted: batch.pointsUpserted,
          lastByKind: batch.byKind,
          ingestSource: batch.source,
          lastTrendsSnapshotAt: trendsSnapshot.ok ? new Date() : undefined,
          lastTrendsSnapshotFields: trendsSnapshot.fields || [],
          lastIngestErrors: batch.errors || [],
          lastTrendsCacheAt: trendsCache.generatedAt || undefined,
          lastTrendsCachePath: trendsCache.path || undefined,
        },
      }
    );

    try {
      const { notifyIngestComplete } = require('../notificationService');
      await notifyIngestComplete(
        `${batch.filesProcessed} files, ${batch.pointsUpserted} points upserted (${batch.source})`
      );
    } catch (notifyErr) {
      console.warn('[plant-ingest] notify skipped:', notifyErr.message);
    }

    return {
      ok: true,
      ingestSource: batch.source,
      filesScanned: batch.filesScanned,
      filesProcessed: batch.filesProcessed,
      pointsUpserted: batch.pointsUpserted,
      highlightsUpserted: batch.highlightsUpserted,
      metricsDiscovered,
      byKind: batch.byKind,
      errors: batch.errors,
      trendsSnapshot,
      trendsBackfill,
      trendsCache,
    };
  } catch (err) {
    await PlantIngestionState.updateOne({ key: 'global' }, { $set: { lastError: err.message } });
    throw err;
  }
}

async function ingestBlobFile(blob) {
  const buffer = await downloadBlobBuffer(blob.name);
  const result = await ingestWorkbookFromBuffer(buffer, blob.name, {
    lastModified: blob.lastModified,
  });
  const stats = await processIngestResult(result);
  return { result, stats };
}

module.exports = {
  runPlantIngestion,
  runBlobIngestion,
  ingestBlobFile,
  processIngestResult,
};
