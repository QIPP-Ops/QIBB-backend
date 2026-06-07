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
router.get('/chemistry-water-overview', c.getChemistryWaterOverview);
router.get('/trends-bundle', c.getTrendsBundle);
router.get('/trends-cache', c.getTrendsCache);
router.get('/trends-blobs/status', c.getTrendsBlobBundleStatus);
router.get('/trends-blobs/:kind', c.getTrendsBlobBundle);
router.get('/trend-panels', c.getTrendPanels);
router.get('/trend-panels/:panelId', c.getTrendPanelById);
router.get('/insight-strip', c.getInsightStrip);

router.get('/metrics/series', protect, c.getMetricSeries);
router.get('/metrics/:key/preview', protect, c.getMetricPreview);
router.get('/trend-preview', protect, c.getTrendPreview);
router.get('/historical-dashboard', protect, c.getHistoricalDashboard);
router.get('/management-trends', protect, c.getManagementTrends);
router.get('/home-trends', protect, c.getHomeTrends);
router.get('/metrics', protect, opsLead, c.listMetrics);
router.post('/metrics', protect, c.upsertMetric);
router.delete('/metrics/:metricKey', protect, c.deleteMetric);
router.patch('/metrics/visibility', protect, c.setMetricVisibility);

router.get('/metric-display-names', c.getMetricDisplayNames);
router.get('/custom-trends', protect, opsLead, c.listCustomTrends);
router.post('/custom-trends', protect, opsLead, c.saveCustomTrend);
router.patch('/custom-trends/:id', protect, opsLead, c.patchCustomTrend);
router.delete('/custom-trends/:id', protect, opsLead, c.deleteCustomTrend);

router.get('/management-access', protect, c.listManagementTrendAccess);
router.patch('/management-access', protect, c.setManagementTrendAccess);

module.exports = router;
