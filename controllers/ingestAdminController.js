const { runIngestCycle, getIngestCronStatus } = require('../jobs/ingestCron');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

exports.getIngestStatus = async (_req, res) => {
  try {
    const status = await getIngestCronStatus();
    const metricsInCache = status.metricsInCache ?? status.totalMetricsInCache ?? 0;
    res.json({
      success: true,
      data: {
        lastRunAt: status.lastRunAt,
        lastRunStats: status.lastRunStats,
        filesProcessed: status.lastRunStats?.filesProcessed ?? 0,
        metricsWritten: status.lastRunStats?.metricsWritten ?? 0,
        skippedCurrent: status.lastRunStats?.skippedCurrent ?? 0,
        noParser: status.lastRunStats?.noParser ?? 0,
        totalMetricsInCache: metricsInCache,
        metricsInCache,
        cachePath: status.cachePath || '',
        unmatchedFiles: status.unmatchedFiles || [],
        errors: status.errors || [],
        nextScheduledRunAt: status.nextScheduledRunAt,
        cronExpr: status.cronExpr,
        running: status.running,
      },
    });
  } catch (err) {
    console.warn('[ingest-status] handler error:', err.message);
    const { getPlantTrendsCachePath } = require('../services/plantReports/plantTrendsCache');
    let cachePath = '';
    try {
      cachePath = getPlantTrendsCachePath();
    } catch {
      cachePath = process.env.PLANT_TRENDS_CACHE_DIR || '';
    }
    res.json({
      success: true,
      data: {
        lastRunAt: null,
        lastRunStats: null,
        filesProcessed: 0,
        metricsWritten: 0,
        skippedCurrent: 0,
        noParser: 0,
        totalMetricsInCache: 0,
        metricsInCache: 0,
        cachePath,
        unmatchedFiles: [],
        errors: [err.message],
        nextScheduledRunAt: null,
        cronExpr: '0 */2 * * *',
        running: false,
      },
    });
  }
};

exports.triggerIngest = async (req, res) => {
  try {
    const status = await getIngestCronStatus();
    if (status.running) {
      return res.status(409).json({ message: 'Ingest cycle is already running.' });
    }
    const result = await runIngestCycle();
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.MANUAL_INGEST_TRIGGERED,
      targetType: 'ingest',
      targetId: 'ingest_cron',
      targetName: 'Scheduled ingest cycle',
      after: { manual: true, ...result },
      req,
    });
    if (!result.ok) {
      return res.status(503).json({ message: result.message || 'Ingest failed', data: result });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
