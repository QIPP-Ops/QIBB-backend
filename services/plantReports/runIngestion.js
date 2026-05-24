const fs = require('fs');
const path = require('path');
const OpsShiftHighlight = require('../../models/OpsShiftHighlight');
const PlantIngestionState = require('../../models/PlantIngestionState');
const PlantMetricPoint = require('../../models/PlantMetricPoint');
const { PlantMetric } = require('../../models/PlantMetric');
const { walkExcel } = require('./extractOpsHighlights');
const { classifyReport } = require('./excelUtils');
const { ingestWorkbook, ingestWorkbookFromBuffer } = require('./ingestWorkbook');
const {
  listReportBlobs,
  downloadBlobBuffer,
  blobIngestConfigured,
  CONTAINER,
} = require('./blobReports');
const { syncTrendsSnapshotFromBlob } = require('./syncTrendsSnapshot');
const { backfillTrendSnapshotsFromBlobs } = require('./backfillTrendSnapshots');

const MAX_FILES = parseInt(process.env.PLANT_INGEST_MAX_FILES || '800', 10);
const MAX_AGE_DAYS = parseInt(process.env.PLANT_INGEST_MAX_AGE_DAYS || '365', 10);

async function upsertPoints(points) {
  let n = 0;
  for (const p of points) {
    if (p.value == null || !Number.isFinite(p.value)) continue;
    const res = await PlantMetricPoint.updateOne(
      {
        metricKey: p.metricKey,
        reportDate: p.reportDate,
        sourceFile: p.sourceFile,
        equipmentId: p.equipmentId || '',
        columnKey: p.columnKey || '',
      },
      { $set: p },
      { upsert: true }
    );
    if (res.upsertedCount || res.modifiedCount) n += 1;

    const { canonicalMetricKey, canonicalLabel } = require('./metricKeys');
    const ck = canonicalMetricKey(p.metricKey);
    await PlantMetric.updateOne(
      { metricKey: ck },
      {
        $set: {
          label: canonicalLabel(p.label, p.metricKey),
          category: p.category,
          unit: p.unit || '',
          sourceFilePattern: p.sourceFile,
          sheetName: p.sheetName || '',
          columnKey: p.columnKey || '',
        },
      },
      { upsert: true }
    );
  }
  return n;
}

function selectLocalFiles(allFiles) {
  const minMtime = Date.now() - MAX_AGE_DAYS * 86400000;
  return allFiles
    .filter((f) => {
      const kind = classifyReport(path.basename(f));
      if (kind === 'other') return false;
      try {
        return fs.statSync(f).mtimeMs >= minMtime;
      } catch {
        return false;
      }
    })
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

async function processIngestResult(result) {
  let pointsUpserted = 0;
  let highlightsUpserted = 0;
  if (result.skipped) return { pointsUpserted, highlightsUpserted, kind: result.kind };

  pointsUpserted = await upsertPoints(result.points);
  for (const h of result.highlights || []) {
    const res = await OpsShiftHighlight.updateOne(
      { sourceFile: h.sourceFile, reportDate: h.reportDate, text: h.text },
      { $set: h },
      { upsert: true }
    );
    if (res.upsertedCount || res.modifiedCount) highlightsUpserted += 1;
  }
  return { pointsUpserted, highlightsUpserted, kind: result.kind };
}

async function runBlobIngestion(forceAll) {
  const maxAge = forceAll ? 3650 : MAX_AGE_DAYS;
  const limit = forceAll ? Math.max(MAX_FILES, 800) : MAX_FILES;
  const allBlobs = await listReportBlobs({ maxAgeDays: maxAge });
  const recognized = allBlobs.filter((b) => classifyReport(path.basename(b.name)) !== 'other');
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

async function runLocalIngestion(reportsRoot, forceAll) {
  const allFiles = walkExcel(reportsRoot);
  const files = forceAll
    ? allFiles
        .filter((f) => classifyReport(path.basename(f)) !== 'other')
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
        .slice(0, Math.max(MAX_FILES, 200))
    : selectLocalFiles(allFiles).slice(0, MAX_FILES);

  let pointsUpserted = 0;
  let highlightsUpserted = 0;
  let filesProcessed = 0;
  const byKind = {};

  for (const filePath of files) {
    try {
      const result = await ingestWorkbook(filePath, reportsRoot);
      const stats = await processIngestResult(result);
      if (result.skipped) continue;
      filesProcessed += 1;
      byKind[stats.kind] = (byKind[stats.kind] || 0) + 1;
      pointsUpserted += stats.pointsUpserted;
      highlightsUpserted += stats.highlightsUpserted;
    } catch (err) {
      console.warn(`[plant-ingest] skip ${path.basename(filePath)}:`, err.message);
    }
  }

  return {
    source: 'local',
    filesScanned: allFiles.length,
    filesProcessed,
    pointsUpserted,
    highlightsUpserted,
    byKind,
  };
}

async function runPlantIngestion(options = {}) {
  const forceAll = Boolean(options.forceAll);
  const reportsRoot = options.reportsRoot || process.env.PLANT_REPORTS_DIR;
  const useBlob = blobIngestConfigured();

  const sourceLabel = useBlob
    ? `blob:${process.env.BLOB_STORAGE_ACCOUNT || 'acwaopsqipp'}/${CONTAINER}`
    : reportsRoot || '';

  await PlantIngestionState.findOneAndUpdate(
    { key: 'global' },
    { $set: { reportsRoot: sourceLabel, lastRunAt: new Date() } },
    { upsert: true, new: true }
  );

  if (!useBlob && !reportsRoot) {
    await PlantIngestionState.updateOne(
      { key: 'global' },
      { $set: { lastError: 'BLOB_SAS_URL or PLANT_REPORTS_DIR must be configured' } }
    );
    return { ok: false, message: 'BLOB_SAS_URL or PLANT_REPORTS_DIR must be configured' };
  }

  try {
    const batch = useBlob
      ? await runBlobIngestion(forceAll)
      : await runLocalIngestion(reportsRoot, forceAll);

    const metricsDiscovered = await PlantMetric.countDocuments();

    let trendsSnapshot = { ok: false, skipped: true };
    let trendsBackfill = { ok: false, skipped: true };
    if (useBlob) {
      try {
        trendsSnapshot = await syncTrendsSnapshotFromBlob({ maxAgeDays: forceAll ? 3650 : MAX_AGE_DAYS });
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
      console.warn('[plant-ingest] trends cache write failed:', cacheErr.message);
      trendsCache = { ok: false, message: cacheErr.message };
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
    await PlantIngestionState.updateOne(
      { key: 'global' },
      { $set: { lastError: err.message } }
    );
    throw err;
  }
}

module.exports = { runPlantIngestion };
