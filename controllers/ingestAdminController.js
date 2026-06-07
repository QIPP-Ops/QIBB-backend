const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const {
  syncTrendsBlobsFromAzure,
  getSyncState,
  BLOB_KINDS,
} = require('../services/plantReports/syncTrendsBlobsService');

function buildStatusPayload() {
  const {
    buildTrendsBundleFromSixBlobs,
    hasUsableTrendsBundle,
  } = require('../services/plantReports/buildTrendsBundleFromSixBlobs');
  const {
    BUNDLED_DIR,
    listBundledKinds,
    hasBundledTrends,
  } = require('../services/plantReports/trendsBlobBundle');

  const sync = getSyncState();
  const { payload } = buildTrendsBundleFromSixBlobs();
  const ready = hasUsableTrendsBundle(payload);
  const metricsInCache = ready ? (payload.metrics?.length ?? 0) : 0;
  const kindsLoaded = payload?.bundleMeta?.kindsLoaded ?? listBundledKinds();
  const lastResult = sync.lastResult;

  return {
    source: 'six-blob-bundle',
    bundledDir: BUNDLED_DIR,
    kinds: listBundledKinds(),
    kindsTotal: BLOB_KINDS.length,
    ready: hasBundledTrends(),
    lastRunAt: lastResult?.lastRunAt ?? payload?.generatedAt ?? null,
    filesProcessed: lastResult?.filesProcessed ?? kindsLoaded.length,
    metricsWritten: lastResult?.metricsWritten ?? payload?.bundleMeta?.totalMetrics ?? metricsInCache,
    metricsInCache,
    totalMetricsInCache: metricsInCache,
    totalPoints: payload?.bundleMeta?.totalPoints ?? 0,
    skippedCurrent: 0,
    noParser: 0,
    cachePath: BUNDLED_DIR,
    ingestDeprecated: true,
    message: 'Trends load from six-blob bundle. Use Sync Now to pull from Azure qipp-data.',
    unmatchedFiles: [],
    errors: [
      ...(lastResult?.errors ?? []),
      ...(ready ? [] : ['Six-blob bundle empty or missing']),
    ].filter(Boolean),
    running: sync.running,
    syncProgress: sync.running || sync.percent === 100
      ? {
          current: sync.current,
          total: sync.total,
          percent: sync.percent,
          label: sync.label,
        }
      : null,
    nextScheduledRunAt: null,
    cronExpr: 'Manual — POST /api/plant-data/sync-trends-blobs',
  };
}

exports.getIngestStatus = async (_req, res) => {
  try {
    res.json({ success: true, data: buildStatusPayload() });
  } catch (err) {
    console.warn('[ingest-status] handler error:', err.message);
    res.json({
      success: true,
      data: {
        ...buildStatusPayload(),
        lastRunAt: null,
        metricsInCache: 0,
        totalMetricsInCache: 0,
        errors: [err.message],
        running: false,
      },
    });
  }
};

exports.triggerIngest = async (req, res) => {
  try {
    const result = await syncTrendsBlobsFromAzure();
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.MANUAL_INGEST_TRIGGERED,
      targetType: 'ingest',
      targetId: 'sync-trends-blobs',
      targetName: 'Azure trends blob sync',
      after: {
        filesProcessed: result.filesProcessed,
        metricsWritten: result.metricsWritten,
        errors: result.errors,
      },
      req,
    });
    res.json({ success: result.success, data: result });
  } catch (err) {
    if (err.code === 'SYNC_IN_PROGRESS') {
      return res.status(409).json({ success: false, message: err.message, data: getSyncState() });
    }
    if (err.code === 'MISSING_AZURE_CONFIG') {
      return res.status(503).json({ success: false, message: err.message });
    }
    console.error('[sync-trends-blobs]', err.message);
    res.status(500).json({ success: false, message: err.message || 'Blob sync failed' });
  }
};

exports.getSyncProgress = async (_req, res) => {
  res.json({ success: true, data: getSyncState() });
};
