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
const { blobIngestConfigured, CONTAINER } = require('../services/plantReports/blobReports');
const { userCanAccessOpsTools } = require('../services/shiftScheduleService');
const AdminUser = require('../models/AdminUser');

async function loadDbUser(req) {
  return AdminUser.findById(req.user.id).select('-passwordHash');
}

exports.getStatus = async (_req, res) => {
  const state = await PlantIngestionState.findOne({ key: 'global' }).lean();
  res.json({
    success: true,
    data: {
      reportsRoot: state?.reportsRoot || '',
      blobAccount: process.env.BLOB_STORAGE_ACCOUNT || 'acwaopsqipp',
      blobContainer: CONTAINER,
      blobSasConfigured: blobIngestConfigured(),
      maxAgeDays: parseInt(process.env.PLANT_INGEST_MAX_AGE_DAYS || '60', 10),
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
      autoIngest: blobIngestConfigured() || Boolean(process.env.PLANT_REPORTS_DIR),
    },
  });
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
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMetricSeries = async (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 30, 365);
  const keys = String(req.query.keys || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (!keys.length) {
    return res.status(400).json({ message: 'keys query required (comma-separated metricKey)' });
  }

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const rows = await PlantMetricPoint.find({
    metricKey: { $in: keys },
    reportDate: { $gte: sinceStr },
  })
    .sort({ reportDate: 1 })
    .lean();

  const byDate = {};
  for (const r of rows) {
    if (!byDate[r.reportDate]) byDate[r.reportDate] = { date: r.reportDate };
    byDate[r.reportDate][r.metricKey] = r.value;
  }

  res.json({
    success: true,
    data: {
      series: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
      metrics: keys,
    },
  });
};

exports.listMetrics = async (req, res) => {
  const dbUser = await loadDbUser(req);
  const isAdmin = req.user?.role === 'admin';
  const metrics = await PlantMetric.find().sort({ category: 1, label: 1 }).lean();
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

  const { id, name, description, chartType, metricKeys, sharedWithManagement, allowedUserIds } = req.body;
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
    createdBy: dbUser._id,
  };

  let doc;
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
  res.json({ success: true, data: doc });
};

exports.deleteCustomTrend = async (req, res) => {
  const dbUser = await loadDbUser(req);
  const isAdmin = req.user?.role === 'admin';
  const trend = await CustomTrend.findById(req.params.id);
  if (!trend) return res.status(404).json({ message: 'Not found' });
  if (!isAdmin && String(trend.createdBy) !== String(dbUser._id)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  await CustomTrend.deleteOne({ _id: trend._id });
  res.json({ success: true });
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
