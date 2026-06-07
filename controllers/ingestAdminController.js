const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

exports.getIngestStatus = async (_req, res) => {
  try {
    const {
      buildTrendsBundleFromSixBlobs,
      hasUsableTrendsBundle,
    } = require('../services/plantReports/buildTrendsBundleFromSixBlobs');
    const {
      BUNDLED_DIR,
      listBundledKinds,
      hasBundledTrends,
    } = require('../services/plantReports/trendsBlobBundle');

    const { payload } = buildTrendsBundleFromSixBlobs();
    const ready = hasUsableTrendsBundle(payload);
    const metricsInCache = ready ? (payload.metrics?.length ?? 0) : 0;

    res.json({
      success: true,
      data: {
        source: 'six-blob-bundle',
        bundledDir: BUNDLED_DIR,
        kinds: listBundledKinds(),
        ready: hasBundledTrends(),
        lastRunAt: payload?.generatedAt ?? null,
        metricsInCache,
        totalMetricsInCache: metricsInCache,
        totalPoints: payload?.bundleMeta?.totalPoints ?? 0,
        ingestDeprecated: true,
        message: 'Legacy Cosmos ingest removed. Use npm run sync:trends-blobs.',
        unmatchedFiles: [],
        errors: ready ? [] : ['Six-blob bundle empty or missing'],
        running: false,
      },
    });
  } catch (err) {
    console.warn('[ingest-status] handler error:', err.message);
    res.json({
      success: true,
      data: {
        source: 'six-blob-bundle',
        lastRunAt: null,
        metricsInCache: 0,
        totalMetricsInCache: 0,
        totalPoints: 0,
        ingestDeprecated: true,
        message: 'Legacy Cosmos ingest removed. Use npm run sync:trends-blobs.',
        unmatchedFiles: [],
        errors: [err.message],
        running: false,
      },
    });
  }
};

exports.triggerIngest = async (req, res) => {
  await logAction({
    actor: req.user,
    action: AUDIT_ACTIONS.MANUAL_INGEST_TRIGGERED,
    targetType: 'ingest',
    targetId: 'ingest_deprecated',
    targetName: 'Legacy ingest (removed)',
    after: { deprecated: true },
    req,
  });
  res.status(410).json({
    success: false,
    message:
      'Legacy plant ingest removed. Sync trends from Azure with npm run sync:trends-blobs on the API host.',
  });
};
