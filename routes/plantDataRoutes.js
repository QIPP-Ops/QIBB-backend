const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { opsLead } = require('../middleware/opsLead');
const c = require('../controllers/plantDataController');

router.get('/status', protect, c.getStatus);
router.get('/highlights', protect, c.getHighlights);
router.post('/ingest', protect, c.runIngestNow);

/** Public read-only — powers the unauthenticated home dashboard */
router.get('/metrics/date-range', c.getMetricDateRange);
router.get('/operational-overview', c.getOperationalOverview);

router.get('/metrics/series', protect, c.getMetricSeries);
router.get('/historical-dashboard', protect, c.getHistoricalDashboard);
router.get('/home-trends', protect, c.getHomeTrends);
router.get('/metrics', protect, opsLead, c.listMetrics);
router.post('/metrics', protect, c.upsertMetric);
router.delete('/metrics/:metricKey', protect, c.deleteMetric);
router.patch('/metrics/visibility', protect, c.setMetricVisibility);

router.get('/custom-trends', protect, opsLead, c.listCustomTrends);
router.post('/custom-trends', protect, opsLead, c.saveCustomTrend);
router.delete('/custom-trends/:id', protect, opsLead, c.deleteCustomTrend);

router.get('/management-access', protect, c.listManagementTrendAccess);
router.patch('/management-access', protect, c.setManagementTrendAccess);

module.exports = router;
