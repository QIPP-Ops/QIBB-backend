const path = require('path');
const IngestLog = require('../models/IngestLog');
const { getParserForFilename } = require('../services/plantReports/parsers/parserRegistry');
const {
  listAllExcelBlobs,
  blobIngestConfigured,
} = require('../services/plantReports/blobReports');
const { ingestBlobFile } = require('../services/plantReports/runIngestion');
const { writePlantTrendsCache, readPlantTrendsCacheFromDisk } = require('../services/plantReports/plantTrendsCache');

/** Every 2 hours at minute 0 (UTC). */
const CRON_UTC = '0 */2 * * *';

let started = false;
let lastRunKey = '';
let running = false;

const lastRunState = {
  lastRunAt: null,
  lastRunStats: null,
  unmatchedFiles: [],
  errors: [],
  cronExpr: CRON_UTC,
};

function blobModifiedDate(blob) {
  if (blob.lastModified) return new Date(blob.lastModified);
  return new Date(0);
}

function isXlsxBlob(name) {
  return path.extname(String(name || '')).toLowerCase() === '.xlsx';
}

/** Next UTC run at :00 on an even hour (0, 2, 4, …). */
function getNextBiHourlyRun(from = new Date()) {
  const candidate = new Date(from);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(0);
  if (candidate.getUTCHours() % 2 !== 0) {
    candidate.setUTCHours(candidate.getUTCHours() + 1);
  }
  if (candidate.getTime() <= from.getTime()) {
    candidate.setUTCHours(candidate.getUTCHours() + 2);
  }
  return candidate;
}

function shouldRunBiHourlyCron(now = new Date()) {
  return now.getUTCMinutes() === 0 && now.getUTCHours() % 2 === 0;
}

async function isAlreadyProcessed(filename, blobLastModified) {
  const hit = await IngestLog.findOne({ filename, blobLastModified }).lean();
  return Boolean(hit);
}

async function runIngestCycle() {
  if (running) {
    return { ok: false, message: 'Ingest cycle already running' };
  }
  if (!blobIngestConfigured()) {
    const msg = 'Blob storage not configured';
    lastRunState.errors = [msg];
    return { ok: false, message: msg };
  }

  running = true;
  const errors = [];
  const unmatchedFiles = [];
  let filesProcessed = 0;
  let metricsWritten = 0;
  let skippedCurrent = 0;
  let noParser = 0;

  try {
    const allBlobs = await listAllExcelBlobs();
    const xlsxBlobs = allBlobs.filter((b) => isXlsxBlob(b.name));

    for (const blob of xlsxBlobs) {
      const filename = path.basename(blob.name);
      const blobLastModified = blobModifiedDate(blob);

      try {
        const done = await isAlreadyProcessed(filename, blobLastModified);
        if (done) {
          skippedCurrent += 1;
          continue;
        }

        const parser = getParserForFilename(filename);
        if (!parser) {
          noParser += 1;
          unmatchedFiles.push(filename);
          await IngestLog.findOneAndUpdate(
            { filename, blobLastModified },
            {
              $set: {
                filename,
                blobLastModified,
                processedAt: new Date(),
                parserUsed: '',
                noMatch: true,
                metricsWritten: 0,
                skipped: true,
                error: null,
              },
            },
            { upsert: true }
          );
          continue;
        }

        const { result, stats } = await ingestBlobFile(blob);
        const written = stats.pointsUpserted || 0;
        if (!result.skipped) {
          filesProcessed += 1;
          metricsWritten += written;
        }

        await IngestLog.findOneAndUpdate(
          { filename, blobLastModified },
          {
            $set: {
              filename,
              blobLastModified,
              processedAt: new Date(),
              parserUsed: parser.id,
              metricsWritten: written,
              skipped: Boolean(result.skipped),
              error: null,
            },
          },
          { upsert: true }
        );
      } catch (err) {
        const msg = `${filename}: ${err.message}`;
        if (errors.length < 20) errors.push(msg);
        await IngestLog.findOneAndUpdate(
          { filename, blobLastModified },
          {
            $set: {
              filename,
              blobLastModified,
              processedAt: new Date(),
              parserUsed: getParserForFilename(filename)?.id || '',
              metricsWritten: 0,
              skipped: false,
              error: err.message,
            },
          },
          { upsert: true }
        );
      }
    }

    let cacheMetrics = 0;
    try {
      const cacheResult = await writePlantTrendsCache();
      const cache = readPlantTrendsCacheFromDisk();
      cacheMetrics = cache?.metrics?.length ?? cacheResult.metricCount ?? 0;
    } catch (cacheErr) {
      const { getPlantTrendsCachePath } = require('../services/plantReports/plantTrendsCache');
      const cachePath = getPlantTrendsCachePath();
      const msg = `trends cache (${cachePath}): ${cacheErr.message}`;
      console.warn(`[ingest] ${msg}`);
      if (errors.length < 20) errors.push(msg);
    }

    const stats = {
      filesScanned: xlsxBlobs.length,
      filesProcessed,
      metricsWritten,
      skippedCurrent,
      noParser,
      totalMetricsInCache: cacheMetrics,
    };

    lastRunState.lastRunAt = new Date();
    lastRunState.lastRunStats = stats;
    lastRunState.unmatchedFiles = unmatchedFiles;
    lastRunState.errors = errors;

    console.log(
      `[ingest] completed: ${filesProcessed} files processed, ${metricsWritten} metrics written, ${skippedCurrent} files skipped (already current), ${noParser} files had no matching parser`
    );

    return { ok: true, ...stats, errors };
  } finally {
    running = false;
  }
}

function safeReadCacheMetricCount() {
  try {
    const { getPlantTrendsCachePath, readPlantTrendsCacheFromDisk } = require('../services/plantReports/plantTrendsCache');
    const cache = readPlantTrendsCacheFromDisk();
    return {
      cachePath: getPlantTrendsCachePath(),
      totalMetricsInCache: cache?.metrics?.length ?? 0,
    };
  } catch (err) {
    const { getPlantTrendsCachePath } = require('../services/plantReports/plantTrendsCache');
    let cachePath = '';
    try {
      cachePath = getPlantTrendsCachePath();
    } catch {
      cachePath = process.env.PLANT_TRENDS_CACHE_DIR
        ? path.join(path.resolve(process.env.PLANT_TRENDS_CACHE_DIR), 'plant-trends-cache.json')
        : '';
    }
    console.warn(`[ingest-status] cache read failed: ${err.message}`);
    return { cachePath, totalMetricsInCache: 0 };
  }
}

async function fetchUnmatchedFilesFromLastRun() {
  if (lastRunState.unmatchedFiles?.length) {
    return [...lastRunState.unmatchedFiles].sort();
  }
  if (!lastRunState.lastRunAt) {
    const latest = await IngestLog.findOne({
      $or: [{ noMatch: true }, { parserUsed: { $in: [null, ''] } }],
    })
      .sort({ processedAt: -1 })
      .lean();
    if (!latest) return [];
    const anchor = new Date(latest.processedAt);
    const windowStart = new Date(anchor.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(anchor.getTime() + 60 * 1000);
    const rows = await IngestLog.find({
      processedAt: { $gte: windowStart, $lte: windowEnd },
      $or: [{ noMatch: true }, { parserUsed: { $in: [null, ''] } }],
    })
      .select('filename')
      .lean();
    return rows.map((r) => r.filename).filter(Boolean).sort();
  }
  const anchor = new Date(lastRunState.lastRunAt);
  const windowStart = new Date(anchor.getTime() - 30 * 60 * 1000);
  const rows = await IngestLog.find({
    processedAt: { $gte: windowStart, $lte: anchor },
    $or: [{ noMatch: true }, { parserUsed: { $in: [null, ''] } }],
  })
    .select('filename')
    .lean();
  return rows.map((r) => r.filename).filter(Boolean).sort();
}

async function getIngestCronStatus() {
  const { cachePath, totalMetricsInCache } = safeReadCacheMetricCount();
  const unmatchedFiles = await fetchUnmatchedFilesFromLastRun();
  return {
    cronExpr: CRON_UTC,
    running,
    lastRunAt: lastRunState.lastRunAt,
    lastRunStats: lastRunState.lastRunStats,
    errors: lastRunState.errors,
    nextScheduledRunAt: getNextBiHourlyRun(),
    cachePath,
    totalMetricsInCache,
    metricsInCache: totalMetricsInCache,
    unmatchedFiles,
  };
}

function startIngestCron(cronExpr = CRON_UTC) {
  if (started) return;
  started = true;

  const tick = async () => {
    const now = new Date();
    if (!shouldRunBiHourlyCron(now)) return;
    const runKey = now.toISOString().slice(0, 16);
    if (lastRunKey === runKey) return;
    lastRunKey = runKey;

    try {
      await runIngestCycle();
    } catch (err) {
      console.error('[ingest] cron failed:', err.message);
      lastRunState.errors = [err.message];
    }
  };

  setInterval(tick, 60 * 1000);
  console.log('[ingest] scheduler registered (0 */2 * * * — every 2 hours)');
}

module.exports = {
  CRON_UTC,
  startIngestCron,
  runIngestCycle,
  getIngestCronStatus,
  getNextBiHourlyRun,
  shouldRunBiHourlyCron,
};
