const fs = require('fs');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');
const { getTrendsBlobsWritableDir, KIND_TO_FILE } = require('./trendsBlobBundle');
const { resetTrendsBundleCache } = require('./buildTrendsBundleFromSixBlobs');

const CONTAINER = 'qipp-data';
const BLOB_KINDS = Object.keys(KIND_TO_FILE);

/** @type {{ running: boolean, current: number, total: number, percent: number, label: string, errors: string[], startedAt: string | null, finishedAt: string | null, lastResult: object | null }} */
const syncState = {
  running: false,
  current: 0,
  total: BLOB_KINDS.length,
  percent: 0,
  label: '',
  errors: [],
  startedAt: null,
  finishedAt: null,
  lastResult: null,
};

function getSyncState() {
  return { ...syncState };
}

function setProgress(current, label, errors = syncState.errors) {
  syncState.current = current;
  syncState.total = BLOB_KINDS.length;
  syncState.percent = Math.round((current / BLOB_KINDS.length) * 100);
  syncState.label = label;
  syncState.errors = errors;
}

/**
 * Download six qipp-data JSON blobs from Azure into data/trends-blobs/.
 * @param {{ onProgress?: (state: ReturnType<typeof getSyncState>) => void }} [options]
 */
async function syncTrendsBlobsFromAzure(options = {}) {
  if (syncState.running) {
    const err = new Error('Trends blob sync already in progress');
    err.code = 'SYNC_IN_PROGRESS';
    throw err;
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  if (!connectionString) {
    const err = new Error('AZURE_STORAGE_CONNECTION_STRING is required for blob sync');
    err.code = 'MISSING_AZURE_CONFIG';
    throw err;
  }

  syncState.running = true;
  syncState.startedAt = new Date().toISOString();
  syncState.finishedAt = null;
  syncState.lastResult = null;
  syncState.errors = [];
  setProgress(0, 'Starting Azure blob sync…');
  options.onProgress?.(getSyncState());

  const trendsDir = getTrendsBlobsWritableDir();
  fs.mkdirSync(trendsDir, { recursive: true });
  const client = BlobServiceClient.fromConnectionString(connectionString);
  const container = client.getContainerClient(CONTAINER);

  let ok = 0;
  const written = [];

  try {
    for (let i = 0; i < BLOB_KINDS.length; i++) {
      const kind = BLOB_KINDS[i];
      const fileName = KIND_TO_FILE[kind];
      const target = path.join(trendsDir, fileName);
      const step = i + 1;
      setProgress(step, `Syncing blob ${step}/${BLOB_KINDS.length} — ${fileName}…`);
      options.onProgress?.(getSyncState());

      try {
        const blob = container.getBlockBlobClient(fileName);
        const buffer = await blob.downloadToBuffer();
        fs.writeFileSync(target, buffer);
        ok += 1;
        written.push({ kind, fileName, bytes: buffer.length });
        console.log(`[sync:trends-blobs] ${kind} → ${target} (${buffer.length} bytes)`);
      } catch (err) {
        const msg = `${fileName}: ${err.message}`;
        syncState.errors.push(msg);
        console.warn(`[sync:trends-blobs] ${kind} failed: ${err.message}`);
      }
    }

    resetTrendsBundleCache();

    const {
      buildTrendsBundleFromSixBlobs,
      hasUsableTrendsBundle,
    } = require('./buildTrendsBundleFromSixBlobs');
    const { payload } = buildTrendsBundleFromSixBlobs({ force: true });
    const ready = hasUsableTrendsBundle(payload);

    const result = {
      success: ok > 0,
      filesProcessed: ok,
      filesTotal: BLOB_KINDS.length,
      metricsWritten: payload?.bundleMeta?.totalMetrics ?? payload?.metrics?.length ?? 0,
      totalPoints: payload?.bundleMeta?.totalPoints ?? 0,
      totalMetricsInCache: payload?.metrics?.length ?? 0,
      lastRunAt: payload?.generatedAt ?? new Date().toISOString(),
      ready,
      written,
      errors: [...syncState.errors],
    };

    syncState.lastResult = result;
    syncState.finishedAt = new Date().toISOString();
    setProgress(
      BLOB_KINDS.length,
      ready
        ? `Sync complete — ${result.metricsWritten} metrics loaded`
        : `Sync finished with errors (${ok}/${BLOB_KINDS.length} files)`,
      syncState.errors
    );
    options.onProgress?.(getSyncState());

    return result;
  } finally {
    syncState.running = false;
  }
}

module.exports = {
  syncTrendsBlobsFromAzure,
  getSyncState,
  BLOB_KINDS,
};
