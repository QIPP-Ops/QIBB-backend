const {
  buildTrendsBundleFromSixBlobs,
  hasUsableTrendsBundle,
} = require('../services/plantReports/buildTrendsBundleFromSixBlobs');
const {
  BUNDLED_DIR,
  KIND_TO_FILE,
  listBundledKinds,
  hasBundledTrends,
} = require('../services/plantReports/trendsBlobBundle');

const BLOB_KINDS = Object.keys(KIND_TO_FILE);

function buildStatusPayload() {
  const { payload } = buildTrendsBundleFromSixBlobs();
  const ready = hasUsableTrendsBundle(payload);
  const metricsInCache = ready ? (payload.metrics?.length ?? 0) : 0;
  const kindsLoaded = payload?.bundleMeta?.kindsLoaded ?? listBundledKinds();

  return {
    source: 'six-blob-bundle',
    bundledDir: BUNDLED_DIR,
    kinds: listBundledKinds(),
    kindsTotal: BLOB_KINDS.length,
    ready: hasBundledTrends(),
    lastRunAt: payload?.generatedAt ?? null,
    filesProcessed: kindsLoaded.length,
    metricsWritten: payload?.bundleMeta?.totalMetrics ?? metricsInCache,
    metricsInCache,
    totalMetricsInCache: metricsInCache,
    totalPoints: payload?.bundleMeta?.totalPoints ?? 0,
    skippedCurrent: 0,
    noParser: 0,
    cachePath: BUNDLED_DIR,
    ingestDeprecated: true,
    message: 'Trends load from bundled JSON files in data/trends-blobs/.',
    unmatchedFiles: [],
    errors: ready ? [] : ['Six-blob bundle empty or missing'],
    running: false,
    syncProgress: null,
    nextScheduledRunAt: null,
    cronExpr: 'Bundled data/trends-blobs/*.json',
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
