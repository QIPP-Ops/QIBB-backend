const { runIngestCycle, getIngestCronStatus } = require('../jobs/ingestCron');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

exports.getIngestStatus = async (_req, res) => {
  try {
    const status = getIngestCronStatus();
    res.json({
      success: true,
      data: {
        lastRunAt: status.lastRunAt,
        lastRunStats: status.lastRunStats,
        filesProcessed: status.lastRunStats?.filesProcessed ?? 0,
        metricsWritten: status.lastRunStats?.metricsWritten ?? 0,
        skippedCurrent: status.lastRunStats?.skippedCurrent ?? 0,
        noParser: status.lastRunStats?.noParser ?? 0,
        totalMetricsInCache: status.totalMetricsInCache,
        errors: status.errors || [],
        nextScheduledRunAt: status.nextScheduledRunAt,
        cronExpr: status.cronExpr,
        running: status.running,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.triggerIngest = async (req, res) => {
  try {
    const status = getIngestCronStatus();
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
