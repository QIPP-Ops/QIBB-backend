const OpsShiftHighlight = require('../models/OpsShiftHighlight');
const PlantIngestionState = require('../models/PlantIngestionState');
const PlantMetricPoint = require('../models/PlantMetricPoint');
const {
  PlantMetric,
  PlantMetricVisibility,
  CustomTrend,
  ManagementTrendAccess,
} = require('../models/PlantMetric');
const { runPlantIngestion } = require('../services/plantReports/runIngestion');
const {
  blobIngestConfigured,
  CONTAINER,
  getBlobAccessInfo,
} = require('../services/plantReports/blobReports');
const { userCanAccessOpsTools } = require('../services/shiftScheduleService');
const AdminUser = require('../models/AdminUser');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

async function loadDbUser(req) {
  return AdminUser.findById(req.user.id).select('-passwordHash');
}

exports.getStatus = async (_req, res) => {
  const { parseMongoUri, classifyMongoError } = require('../utils/mongoDiagnostics');
  const { getMongoUri } = require('../config/database');
  const uriInfo = parseMongoUri(getMongoUri());
  try {
    const state = await PlantIngestionState.findOne({ key: 'global' }).lean();
    res.json({
      success: true,
      data: {
        mongo: { ok: true, ...uriInfo },
        reportsRoot: state?.reportsRoot || '',
        blobAccount: process.env.BLOB_STORAGE_ACCOUNT || 'acwaopsqipp',
        blobContainer: CONTAINER,
        blobSasConfigured: blobIngestConfigured(),
        blobAccess: getBlobAccessInfo(),
        maxAgeDays: parseInt(process.env.PLANT_INGEST_MAX_AGE_DAYS || '365', 10),
        ingestSource: state?.ingestSource || (blobIngestConfigured() ? 'blob' : 'local'),
        lastRunAt: state?.lastRunAt,
        lastSuccessAt: state?.lastSuccessAt,
        lastError: state?.lastError || '',
        filesScanned: state?.filesScanned || 0,
        filesProcessed: state?.filesProcessed || 0,
        pointsUpserted: state?.pointsUpserted || 0,
        highlightsFound: state?.highlightsFound || 0,
        metricsDiscovered: state?.metricsDiscovered || 0,
        lastByKind: state?.lastByKind || {},
        lastIngestErrors: state?.lastIngestErrors || [],
        autoIngest: blobIngestConfigured() || Boolean(process.env.PLANT_REPORTS_DIR),
      },
    });
  } catch (err) {
    const c = classifyMongoError(err);
    res.status(500).json({
      success: false,
      source: c.source,
      error: c.summary,
      data: {
        mongo: { ok: false, ...uriInfo },
        lastError: c.summary,
        lastErrorSource: 'database',
        blobSasConfigured: blobIngestConfigured(),
      },
    });
  }
};

exports.getHighlights = async (req, res) => {
  const hours = Math.min(parseInt(req.query.hours, 10) || 48, 168);
  const since = new Date(Date.now() - hours * 3600000);
  const sinceDate = since.toISOString().slice(0, 10);
  const items = await OpsShiftHighlight.find({
    $or: [
      { occurredAt: { $gte: since } },
      { reportDate: { $gte: sinceDate } },
    ],
  })
    .sort({ reportDate: -1, occurredAt: -1 })
    .limit(200)
    .lean();
  res.json({ success: true, data: items });
};

exports.runIngestNow = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  try {
    const forceAll = req.query.forceAll === '1' || req.body?.forceAll === true;
    const result = await runPlantIngestion({ forceAll });
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.MANUAL_INGEST_TRIGGERED,
      targetType: 'ingest',
      targetId: 'plant_ingest',
      targetName: 'Plant ingestion',
      after: { forceAll },
      req,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMetricDateRange = async (_req, res) => {
  try {
    const { getDateBounds } = require('../services/plantReports/historicalDashboard');
    const data = await getDateBounds();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getHistoricalDashboard = async (req, res) => {
  try {
    const { buildHistoricalDashboard } = require('../services/plantReports/historicalDashboard');
    const data = await buildHistoricalDashboard({
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getHomeTrends = async (req, res) => {
  try {
    const { expandDayColumnSeries } = require('../services/plantReports/seriesTimeline');
    const trends = await CustomTrend.find({ showOnHomePage: true })
      .sort({ updatedAt: -1 })
      .limit(12)
      .lean();
    const from = req.query.from;
    const to = req.query.to;
    let dateFilter = {};
    if (from && to) dateFilter = { reportDate: { $gte: from, $lte: to } };

    const enriched = [];
    for (const t of trends) {
      const rows = await PlantMetricPoint.find({
        metricKey: { $in: t.metricKeys },
        ...dateFilter,
      })
        .sort({ reportDate: 1 })
        .lean();
      enriched.push({
        ...t,
        series: expandDayColumnSeries(rows, t.metricKeys),
      });
    }
    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getOperationalOverview = async (req, res) => {
  try {
    const { buildOperationalOverview } = require('../services/plantReports/operationalOverview');
    const data = await buildOperationalOverview({
      from: req.query.startDate || req.query.from,
      to: req.query.endDate || req.query.to,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Public read-only — latest chemistry/water + snapshot history for home dashboard */
exports.getChemistryWaterOverview = async (req, res) => {
  try {
    const { fetchChemistryWaterSection, yearStartIso } = require('../services/plantReports/plantTrendsCache');
    const fromStr = String(req.query.from || '').trim().slice(0, 10) || yearStartIso();
    const toStr =
      String(req.query.to || '').trim().slice(0, 10) || new Date().toISOString().slice(0, 10);
    const data = await fetchChemistryWaterSection(fromStr, toStr);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMetricSeries = async (req, res) => {
  const keys = String(req.query.keys || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (!keys.length) {
    return res.status(400).json({ message: 'keys query required (comma-separated metricKey)' });
  }

  let fromStr = req.query.from;
  let toStr = req.query.to;

  if (!fromStr || !toStr) {
    const y = new Date().getFullYear();
    fromStr = fromStr || `${y}-01-01`;
    toStr = toStr || new Date().toISOString().slice(0, 10);
  }

  const { expandMetricKeysForQuery } = require('../services/plantReports/metricKeys');
  const queryKeys = expandMetricKeysForQuery(keys);
  const keyClauses = [{ metricKey: { $in: queryKeys } }];
  for (const k of keys) {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    keyClauses.push({ metricKey: { $regex: new RegExp(`^${escaped}_day\\d+$`, 'i') } });
  }

  const rows = await PlantMetricPoint.find({
    $or: keyClauses,
    reportDate: { $gte: fromStr, $lte: toStr },
  })
    .sort({ reportDate: 1 })
    .lean();

  const { expandDayColumnSeries } = require('../services/plantReports/seriesTimeline');
  const series = expandDayColumnSeries(rows, keys);

  res.json({
    success: true,
    data: {
      series,
      metrics: keys,
      from: fromStr,
      to: toStr,
      minDate: series[0]?.date ?? fromStr,
      maxDate: series.length ? series[series.length - 1]?.date : toStr,
    },
  });
};

exports.getTrendsCache = async (_req, res) => {
  try {
    const {
      readPlantTrendsCacheFromDisk,
      buildPlantTrendsCachePayload,
      hasUsablePlantTrendsCache,
      ensureChemistryWaterOnCache,
    } = require('../services/plantReports/plantTrendsCache');
    let data = readPlantTrendsCacheFromDisk();
    if (!hasUsablePlantTrendsCache(data)) {
      data = await buildPlantTrendsCachePayload();
    } else {
      data = await ensureChemistryWaterOnCache(data);
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.listMetrics = async (req, res) => {
  const dbUser = await loadDbUser(req);
  const isAdmin = req.user?.role === 'admin';
  const { dedupeMetricsForListing } = require('../services/plantReports/metricKeys');
  const metrics = dedupeMetricsForListing(await PlantMetric.find().lean());
  let visibility = [];
  if (!isAdmin && dbUser) {
    visibility = await PlantMetricVisibility.find({ userId: dbUser._id }).lean();
  }
  const visMap = Object.fromEntries(visibility.map((v) => [v.metricKey, v.visible]));
  const data = metrics.map((m) => ({
    ...m,
    visible: isAdmin
      ? m.enabledGlobally
      : m.enabledGlobally && visMap[m.metricKey] !== false,
  }));
  res.json({ success: true, data });
};

exports.upsertMetric = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  const { metricKey, label, category, unit, showOnMainTrend, enabledGlobally } = req.body;
  if (!metricKey || !label) {
    return res.status(400).json({ message: 'metricKey and label required' });
  }
  const doc = await PlantMetric.findOneAndUpdate(
    { metricKey },
    {
      $set: {
        label,
        category: category || 'general',
        unit: unit || '',
        showOnMainTrend: Boolean(showOnMainTrend),
        enabledGlobally: enabledGlobally !== false,
        createdBy: req.user.id,
      },
    },
    { upsert: true, new: true }
  );
  res.json({ success: true, data: doc });
};

exports.deleteMetric = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  await PlantMetric.deleteOne({ metricKey: req.params.metricKey });
  await PlantMetricVisibility.deleteMany({ metricKey: req.params.metricKey });
  res.json({ success: true });
};

exports.setMetricVisibility = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  const { metricKey, userId, visible, allUsers } = req.body;
  if (!metricKey) return res.status(400).json({ message: 'metricKey required' });

  if (allUsers === true) {
    await PlantMetric.updateOne({ metricKey }, { $set: { enabledGlobally: Boolean(visible) } });
    return res.json({ success: true, scope: 'global' });
  }

  if (!userId) return res.status(400).json({ message: 'userId or allUsers required' });
  const doc = await PlantMetricVisibility.findOneAndUpdate(
    { metricKey, userId },
    { $set: { visible: Boolean(visible) } },
    { upsert: true, new: true }
  );
  res.json({ success: true, data: doc });
};

exports.listCustomTrends = async (req, res) => {
  const dbUser = await loadDbUser(req);
  const isAdmin = req.user?.role === 'admin';
  const canBuild = isAdmin || (await ManagementTrendAccess.findOne({ userId: dbUser?._id, canBuildTrends: true }));

  let filter = {};
  if (!isAdmin) {
    filter = {
      $or: [
        { sharedWithManagement: true },
        { allowedUserIds: dbUser?._id },
        { createdBy: dbUser?._id },
      ],
    };
  }

  const trends = await CustomTrend.find(filter).sort({ updatedAt: -1 }).lean();
  res.json({ success: true, data: trends, canBuildTrends: Boolean(canBuild) });
};

exports.saveCustomTrend = async (req, res) => {
  const dbUser = await loadDbUser(req);
  const isAdmin = req.user?.role === 'admin';
  const access = await ManagementTrendAccess.findOne({ userId: dbUser?._id });
  if (!isAdmin && !access?.canBuildTrends) {
    return res.status(403).json({ message: 'Trend builder access required' });
  }

  const {
    id,
    name,
    description,
    chartType,
    metricKeys,
    sharedWithManagement,
    allowedUserIds,
    showOnHomePage,
    chartTheme,
  } = req.body;
  if (!name || !metricKeys?.length) {
    return res.status(400).json({ message: 'name and metricKeys required' });
  }

  const payload = {
    name,
    description: description || '',
    chartType: chartType || 'line',
    metricKeys,
    sharedWithManagement: Boolean(sharedWithManagement),
    allowedUserIds: allowedUserIds || [],
    showOnHomePage: Boolean(showOnHomePage),
    chartTheme: chartTheme || 'light',
    createdBy: dbUser._id,
  };

  let doc;
  const isUpdate = Boolean(id);
  const beforeDoc = isUpdate ? await CustomTrend.findById(id).lean() : null;
  if (id) {
    if (!isAdmin) {
      const existing = await CustomTrend.findById(id);
      if (!existing || String(existing.createdBy) !== String(dbUser._id)) {
        return res.status(403).json({ message: 'Can only edit your own trends' });
      }
    }
    doc = await CustomTrend.findByIdAndUpdate(id, { $set: payload }, { new: true });
  } else {
    doc = await CustomTrend.create(payload);
  }
  await logAction({
    actor: req.user,
    action: isUpdate ? AUDIT_ACTIONS.TREND_RENAMED : AUDIT_ACTIONS.TREND_CREATED,
    targetType: 'custom_trend',
    targetId: doc._id?.toString(),
    targetName: doc.name,
    before: beforeDoc,
    after: doc.toObject ? doc.toObject() : doc,
    req,
  });
  res.json({ success: true, data: doc });
};

async function assertCanEditCustomTrend(req, trend) {
  const dbUser = await loadDbUser(req);
  const isAdmin = req.user?.role === 'admin';
  if (!trend) return { ok: false, status: 404, message: 'Not found' };
  if (!isAdmin && String(trend.createdBy) !== String(dbUser._id)) {
    return { ok: false, status: 403, message: 'Forbidden' };
  }
  return { ok: true, dbUser, isAdmin };
}

exports.patchCustomTrend = async (req, res) => {
  const trend = await CustomTrend.findById(req.params.id);
  const auth = await assertCanEditCustomTrend(req, trend);
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });

  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'name is required' });
  }

  const doc = await CustomTrend.findByIdAndUpdate(
    req.params.id,
    { $set: { name: String(name).trim() } },
    { new: true }
  );
  await logAction({
    actor: req.user,
    action: AUDIT_ACTIONS.TREND_RENAMED,
    targetType: 'custom_trend',
    targetId: doc._id?.toString(),
    targetName: doc.name,
    before: trend.toObject ? trend.toObject() : trend,
    after: doc.toObject ? doc.toObject() : doc,
    req,
  });
  res.json({ success: true, data: doc });
};

exports.deleteCustomTrend = async (req, res) => {
  const trend = await CustomTrend.findById(req.params.id);
  const auth = await assertCanEditCustomTrend(req, trend);
  if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
  await CustomTrend.deleteOne({ _id: trend._id });
  await logAction({
    actor: req.user,
    action: AUDIT_ACTIONS.TREND_DELETED,
    targetType: 'custom_trend',
    targetId: trend._id?.toString(),
    targetName: trend.name,
    before: trend.toObject ? trend.toObject() : trend,
    req,
  });
  res.json({ success: true });
};

exports.getMetricDisplayNames = async (_req, res) => {
  try {
    const { buildMetricDisplayNameMap } = require('../services/plantReports/metricDisplayNames');
    const map = await buildMetricDisplayNameMap();
    res.json({ success: true, data: map });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.setManagementTrendAccess = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  const { userId, canBuildTrends } = req.body;
  if (!userId) return res.status(400).json({ message: 'userId required' });
  const target = await AdminUser.findById(userId);
  if (!target) return res.status(404).json({ message: 'User not found' });
  if (!userCanAccessOpsTools(target) && target.accessRole !== 'admin') {
    return res.status(400).json({ message: 'User is not management' });
  }
  const doc = await ManagementTrendAccess.findOneAndUpdate(
    { userId },
    { $set: { canBuildTrends: Boolean(canBuildTrends) } },
    { upsert: true, new: true }
  );
  res.json({ success: true, data: doc });
};

exports.listManagementTrendAccess = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  const rows = await ManagementTrendAccess.find().lean();
  res.json({ success: true, data: rows });
};
