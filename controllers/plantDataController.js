const OpsShiftHighlight = require('../models/OpsShiftHighlight');
const PlantIngestionState = require('../models/PlantIngestionState');
const PlantMetricPoint = require('../models/PlantMetricPoint');
const {
  PlantMetric,
  PlantMetricVisibility,
  CustomTrend,
  ManagementTrendAccess,
} = require('../models/PlantMetric');
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
        blobAccount: process.env.BLOB_STORAGE_ACCOUNT || '',
        blobContainer: process.env.BLOB_CONTAINER_NAME || CONTAINER,
        blobSasConfigured: blobIngestConfigured(),
        blobAccess: getBlobAccessInfo(),
        allowLocalFolderIngest: process.env.ALLOW_LOCAL_FOLDER_INGEST === '1',
        maxAgeDays: parseInt(process.env.PLANT_INGEST_MAX_AGE_DAYS || '365', 10),
        ingestSource: state?.ingestSource || (blobIngestConfigured() ? 'blob' : ''),
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
        autoIngest: blobIngestConfigured(),
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

exports.runIngestNow = async (_req, res) => {
  res.status(410).json({
    success: false,
    message:
      'Legacy Cosmos plant ingest removed. Trends load from the six-blob bundle — run npm run sync:trends-blobs on the API host.',
  });
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
    const { buildHistoricalDashboard } = require('../services/trends/trendEngine');
    const data = await buildHistoricalDashboard({
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getTrendPanels = async (req, res) => {
  try {
    const { queryPanelsForRoute } = require('../services/trends/trendEngine');
    const route = String(req.query.route || '/reports/trends');
    const data = await queryPanelsForRoute(route, {
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getTrendPanelById = async (req, res) => {
  try {
    const { queryPanelById } = require('../services/trends/trendEngine');
    const data = await queryPanelById(req.params.panelId, {
      from: req.query.from,
      to: req.query.to,
    });
    if (!data) return res.status(404).json({ message: 'Panel not found' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getInsightStrip = async (_req, res) => {
  try {
    const { buildInsightStrip } = require('../services/trends/trendEngine');
    const data = await buildInsightStrip();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getManagementTrends = async (req, res) => {
  try {
    const { buildManagementDashboard } = require('../services/trends/trendEngine');
    const data = await buildManagementDashboard({
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
    const { buildHomeTrendsPayload } = require('../services/trends/trendEngine');
    const data = await buildHomeTrendsPayload({
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ success: true, data });
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

/** Public read-only — chemistry/water overview derived from six-blob bundle (hrsg + water). */
exports.getChemistryWaterOverview = async (_req, res) => {
  try {
    const {
      buildTrendsBundleFromSixBlobs,
      hasUsableTrendsBundle,
    } = require('../services/plantReports/buildTrendsBundleFromSixBlobs');
    const { payload } = buildTrendsBundleFromSixBlobs();
    if (!hasUsableTrendsBundle(payload)) {
      return res.json({
        success: true,
        data: {
          latest: null,
          snapshots: [],
          message: 'No chemistry/water data in six-blob bundle. Run npm run sync:trends-blobs.',
        },
      });
    }
    res.json({
      success: true,
      data: {
        latest: null,
        snapshots: [],
        blobSource: true,
        message: 'Chemistry/water time series are in GET /plant-data/trends-bundle (hrsg + water kinds).',
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMetricSeries = async (req, res) => {
  try {
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

    const { fetchMetricSeriesFromMongo } = require('../services/plantReports/metricSeriesQuery');
    const { series, from, to } = await fetchMetricSeriesFromMongo(keys, fromStr, toStr);

    res.json({
      success: true,
      data: {
        series,
        metrics: keys,
        from,
        to,
        minDate: series[0]?.date ?? from,
        maxDate: series.length ? series[series.length - 1]?.date : to,
      },
    });
  } catch (err) {
    console.error('[trend-preview] error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

/** Alias for Trend Studio preview — same handler as GET /metrics/series */
exports.getTrendPreview = exports.getMetricSeries;

exports.getMetricPreview = async (req, res) => {
  try {
    const key = String(req.params.key || '').trim();
    if (!key) return res.status(400).json({ message: 'metric key required' });

    const { fetchMetricPreview } = require('../services/plantReports/metricPreview');
    const data = await fetchMetricPreview(key);
    if (!data) return res.status(404).json({ message: 'Metric not found' });
    res.json({ success: true, data });
  } catch (err) {
    console.error('[metric-preview] error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

function adminFromBearer(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    const jwt = require('jsonwebtoken');
    const { normalizeDecodedUser } = require('../utils/jwtAuth');
    return normalizeDecodedUser(jwt.verify(token, process.env.JWT_SECRET));
  } catch {
    return null;
  }
}

const TRENDS_BLOB_CACHE_MAX_AGE = 300;

function filterBundledRecordsByDate(records, from, to) {
  if (!Array.isArray(records) || (!from && !to)) return records;
  const fromDay = from?.trim().slice(0, 10);
  const toDay = to?.trim().slice(0, 10);
  return records.filter((record) => {
    if (!record || typeof record !== 'object') return false;
    const day = String(record.date || record.Date || '').slice(0, 10);
    if (!day) return false;
    if (fromDay && day < fromDay) return false;
    if (toDay && day > toDay) return false;
    return true;
  });
}

function findLatestDateInRecords(records) {
  if (!Array.isArray(records) || !records.length) return null;
  let max = '';
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const day = String(record.date || record.Date || '').slice(0, 10);
    if (day > max) max = day;
  }
  return max || null;
}

/** Serve bundled qipp-data JSON from data/trends-blobs/ (fast local disk read). */
exports.getTrendsBlobBundle = async (req, res) => {
  try {
    const {
      readBundledRaw,
      listBundledKinds,
      KIND_TO_FILE,
    } = require('../services/plantReports/trendsBlobBundle');
    const kind = String(req.params.kind || '').trim();
    if (!kind || !KIND_TO_FILE[kind]) {
      return res.status(404).json({ success: false, message: `Unknown trends blob kind: ${kind}` });
    }

    const raw = readBundledRaw(kind);
    if (raw == null) {
      return res.status(404).json({
        success: false,
        message: `Bundled trends blob missing for ${kind}. Run npm run sync:trends-blobs.`,
      });
    }

    const { from, to, latestDate } = req.query;
    if (latestDate === '1') {
      const records = Array.isArray(raw) ? raw : raw?.data;
      return res.json({ latestDate: findLatestDateInRecords(records) });
    }

    let payload = raw;
    if (from || to) {
      const records = Array.isArray(raw) ? raw : raw?.data;
      if (Array.isArray(records)) {
        const filtered = filterBundledRecordsByDate(records, from, to);
        payload = Array.isArray(raw) ? filtered : { ...raw, data: filtered };
      }
    }

    res.set('Cache-Control', `public, max-age=${TRENDS_BLOB_CACHE_MAX_AGE}`);
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getTrendsBlobBundleStatus = async (_req, res) => {
  try {
    const {
      listBundledKinds,
      BUNDLED_DIR,
      hasBundledTrends,
    } = require('../services/plantReports/trendsBlobBundle');
    res.json({
      success: true,
      bundledDir: BUNDLED_DIR,
      kinds: listBundledKinds(),
      ready: hasBundledTrends(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

function sendTrendsBundleResponse(req, res) {
  const {
    buildTrendsBundleFromSixBlobs,
    hasUsableTrendsBundle,
  } = require('../services/plantReports/buildTrendsBundleFromSixBlobs');
  const { BUNDLED_DIR } = require('../services/plantReports/trendsBlobBundle');

  const force = req.query.rebuild === '1';
  const { payload, etag } = buildTrendsBundleFromSixBlobs({ force });

  if (!hasUsableTrendsBundle(payload)) {
    return res.status(503).json({
      success: false,
      message: `Six-blob trends bundle is missing or empty under ${BUNDLED_DIR}. Run npm run sync:trends-blobs.`,
      bundledDir: BUNDLED_DIR,
      data: payload || null,
    });
  }

  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  res.set('Cache-Control', `public, max-age=${TRENDS_BLOB_CACHE_MAX_AGE}`);
  res.set('ETag', etag);
  res.json({ success: true, data: payload });
}

/** Primary hot path — merged six qipp-data blobs (seriesByKey + metrics + dateRange). */
exports.getTrendsBundle = async (req, res) => {
  try {
    if (req.query.rebuild === '1') {
      const { hasPortalAdminAccess } = require('../middleware/superAdmin');
      const user = adminFromBearer(req);
      if (!user || !hasPortalAdminAccess({ user })) {
        return res.status(403).json({
          success: false,
          message: 'Admin Bearer token required for ?rebuild=1',
        });
      }
      const { resetTrendsBundleCache } = require('../services/plantReports/buildTrendsBundleFromSixBlobs');
      resetTrendsBundleCache();
    }
    sendTrendsBundleResponse(req, res);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** Backward-compatible alias — same payload as GET /trends-bundle. */
exports.getTrendsCache = exports.getTrendsBundle;

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

/** Trend Studio metric catalog — six-blob bundle only (no Mongo PlantMetric). */
exports.getTrendStudioMetrics = async (_req, res) => {
  try {
    const {
      buildTrendsBundleFromSixBlobs,
      hasUsableTrendsBundle,
    } = require('../services/plantReports/buildTrendsBundleFromSixBlobs');
    const { BUNDLED_DIR } = require('../services/plantReports/trendsBlobBundle');
    const { payload } = buildTrendsBundleFromSixBlobs();

    if (!hasUsableTrendsBundle(payload)) {
      return res.status(503).json({
        success: false,
        message: `Six-blob trends bundle is missing or empty under ${BUNDLED_DIR}. Run npm run sync:trends-blobs.`,
        bundledDir: BUNDLED_DIR,
      });
    }

    res.json({
      success: true,
      data: {
        metrics: payload.metrics ?? [],
        dateRange: payload.dateRange ?? null,
        bundleMeta: payload.bundleMeta ?? null,
        generatedAt: payload.generatedAt ?? null,
        blobSource: true,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
