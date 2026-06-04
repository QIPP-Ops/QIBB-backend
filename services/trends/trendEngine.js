const PlantMetricPoint = require('../../models/PlantMetricPoint');
const { PlantMetric, CustomTrend } = require('../../models/PlantMetric');
const TrendDefinition = require('../../models/TrendDefinition');
const TrendsSnapshot = require('../../models/TrendsSnapshot');
const { expandDayColumnSeries } = require('../plantReports/seriesTimeline');
const { isBadMetricKey, expandMetricKeysForQuery } = require('../plantReports/metricKeys');
const { getDateBounds, clampRange } = require('../plantReports/historicalDashboard');
const { buildOperationalOverview } = require('../plantReports/operationalOverview');
const { buildChemistryWaterPanel } = require('./chemistryWaterSeries');
const { TREND_DEFINITION_SEEDS } = require('./trendDefinitionSeeds');

let seedingDefinitions = null;

async function ensureTrendDefinitionsSeeded() {
  const count = await TrendDefinition.countDocuments();
  if (count > 0) return count;
  if (!seedingDefinitions) {
    seedingDefinitions = TrendDefinition.insertMany(TREND_DEFINITION_SEEDS, { ordered: false })
      .catch((err) => {
        if (err?.code !== 11000) throw err;
      })
      .finally(() => {
        seedingDefinitions = null;
      });
  }
  await seedingDefinitions;
  return TrendDefinition.countDocuments();
}

function panelMatchers(def) {
  const patterns = (def.metricSeries || [])
    .map((s) => s.keyPattern || s.key)
    .filter((p) => p && !/^\(\?!/.test(String(p)))
    .map((p) => new RegExp(p, 'i'));
  return patterns;
}

const PANEL_METRIC_DENY_RE = /_(?:day|col)_\d+|generation_col|^unit\d+$/i;

function matchMetrics(allMetrics, def) {
  const patterns = panelMatchers(def);
  const maxKeys = def.maxKeys || 4;
  const hits = [];
  for (const m of allMetrics) {
    if (isBadMetricKey(m.metricKey)) continue;
    if (PANEL_METRIC_DENY_RE.test(m.metricKey)) continue;
    if (def.category && def.category !== 'general' && m.category !== def.category) continue;
    const label = `${m.displayName || m.label} ${m.metricKey}`;
    const matched =
      patterns.length === 0
        ? true
        : patterns.some((re) => re.test(label) || re.test(m.metricKey));
    if (!matched) continue;
    if (hits.some((h) => h.metricKey === m.metricKey)) continue;
    hits.push(m);
    if (hits.length >= maxKeys) break;
  }
  if (!hits.length && def.category && def.category !== 'general') {
    for (const m of allMetrics) {
      if (m.category !== def.category) continue;
      if (hits.some((h) => h.metricKey === m.metricKey)) continue;
      hits.push(m);
      if (hits.length >= maxKeys) break;
    }
  }
  const explicit = (def.metricSeries || []).map((s) => s.key).filter(Boolean);
  for (const key of explicit) {
    const m = allMetrics.find((x) => x.metricKey === key);
    if (m && !hits.some((h) => h.metricKey === key)) hits.unshift(m);
  }
  return hits.slice(0, maxKeys);
}

function panelSummary(series, primaryKey) {
  const vals = series
    .map((row) => row[primaryKey])
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!vals.length) return null;
  const latest = vals[vals.length - 1];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const first = vals[0];
  const changePct = first ? ((latest - first) / Math.abs(first)) * 100 : 0;
  return { latest, target: avg, changePct, min: Math.min(...vals), max: Math.max(...vals) };
}

function filterSeeds(filter) {
  let defs = [...TREND_DEFINITION_SEEDS];
  if (filter.panelId) defs = defs.filter((d) => d.panelId === filter.panelId);
  if (filter.showOnHome) defs = defs.filter((d) => d.showOnHome);
  if (filter.showOnManagement) defs = defs.filter((d) => d.showOnManagement);
  if (filter.showOnTrends) defs = defs.filter((d) => d.showOnTrends);
  if (filter.showOnInsightStrip) defs = defs.filter((d) => d.showOnInsightStrip);
  if (filter.route) {
    defs = defs.filter(
      (d) =>
        !d.appliesToRoutes?.length ||
        d.appliesToRoutes.some((r) => r === filter.route || filter.route.startsWith(r))
    );
  }
  return defs.sort((a, b) => (a.order || 0) - (b.order || 0));
}

async function loadDefinitions(filter = {}) {
  const q = {};
  if (filter.route) {
    q.appliesToRoutes = filter.route;
  }
  if (filter.showOnHome) q.showOnHome = true;
  if (filter.showOnManagement) q.showOnManagement = true;
  if (filter.showOnTrends) q.showOnTrends = true;
  if (filter.showOnInsightStrip) q.showOnInsightStrip = true;
  if (filter.panelId) q.panelId = filter.panelId;

  const total = await ensureTrendDefinitionsSeeded();
  let defs =
    total > 0
      ? await TrendDefinition.find(q).sort({ order: 1, panelId: 1 }).lean()
      : [];
  if (!defs.length) {
    defs = filterSeeds(filter);
  }
  if (filter.route) {
    defs = defs.filter(
      (d) =>
        !d.appliesToRoutes?.length ||
        d.appliesToRoutes.some((r) => r === filter.route || filter.route.startsWith(r))
    );
  }
  return defs;
}

async function buildPanelPayload(def, from, to, allMetrics, usedKeys) {
  if (def.dataSource === 'chemistry_water') {
    return buildChemistryWaterPanel(def, from, to);
  }

  const matched = matchMetrics(allMetrics, def).filter((m) => !usedKeys.has(m.metricKey));
  if (!matched.length) {
    return {
      id: def.panelId,
      title: def.title,
      description: def.description || '',
      chartType: def.chartType,
      category: def.category,
      unit: def.unit || '',
      theme: def.theme || 'default',
      metricKeys: [],
      labels: {},
      series: [],
      summary: null,
      dataSource: def.dataSource || 'plant_metric_point',
    };
  }
  matched.forEach((m) => usedKeys.add(m.metricKey));
  const keys = matched.map((m) => m.metricKey);
  const queryKeys = expandMetricKeysForQuery(keys);
  const rows = await PlantMetricPoint.find({
    metricKey: { $in: queryKeys },
    reportDate: { $gte: from, $lte: to },
  })
    .sort({ reportDate: 1 })
    .lean();
  const series = expandDayColumnSeries(rows, keys);
  if (!series.length) {
    return {
      id: def.panelId,
      title: def.title,
      description: def.description || '',
      chartType: def.chartType,
      category: def.category,
      unit: def.unit || matched[0]?.unit || '',
      theme: def.theme || 'default',
      metricKeys: keys,
      labels: Object.fromEntries(
        matched.map((m) => [m.metricKey, m.displayName || m.label])
      ),
      series: [],
      summary: null,
      dataSource: def.dataSource || 'plant_metric_point',
    };
  }
  const labels = Object.fromEntries(
    matched.map((m, i) => {
      const cfg = def.metricSeries?.[i];
      return [m.metricKey, cfg?.label || m.label];
    })
  );
  return {
    id: def.panelId,
    title: def.title,
    description: def.description || '',
    chartType: def.chartType,
    category: def.category,
    unit: def.unit || matched[0]?.unit || '',
    theme: def.theme || 'default',
    metricKeys: keys,
    labels,
    series,
    summary: panelSummary(series, keys[0]),
    dataSource: def.dataSource || 'plant_metric_point',
  };
}

async function queryPanelById(panelId, dateRange = {}) {
  const bounds = await getDateBounds();
  const { from, to } = clampRange(dateRange.from, dateRange.to, bounds);
  const defs = await loadDefinitions({ panelId });
  const def = defs[0];
  if (!def) return null;
  const allMetrics = await PlantMetric.find({ enabledGlobally: { $ne: false } }).lean();
  const usedKeys = new Set();
  return buildPanelPayload(def, from, to, allMetrics, usedKeys);
}

async function queryPanelsForRoute(route, dateRange = {}) {
  const bounds = await getDateBounds();
  const { from, to } = clampRange(dateRange.from, dateRange.to, bounds);
  const defs = await loadDefinitions({ route, showOnTrends: route === '/reports/trends' ? true : undefined });
  const allMetrics = await PlantMetric.find({ enabledGlobally: { $ne: false } }).lean();
  const usedKeys = new Set();
  const panels = [];
  for (const def of defs) {
    const panel = await buildPanelPayload(def, from, to, allMetrics, usedKeys);
    if (panel) panels.push(panel);
  }
  const result = { dateRange: { from, to, ...bounds }, panels };
  return mergeCachePanelsIfEmpty(result);
}

async function mergeCachePanelsIfEmpty(result) {
  const hasData = (result.panels || []).some((p) => Array.isArray(p.series) && p.series.length > 0);
  if (hasData) return result;
  try {
    const {
      readPlantTrendsCacheFromDisk,
      hasUsablePlantTrendsCache,
    } = require('../plantReports/plantTrendsCache');
    const { buildHistoricalDashboard: legacyDashboard } = require('../plantReports/historicalDashboard');
    const cache = readPlantTrendsCacheFromDisk();
    if (hasUsablePlantTrendsCache(cache)) {
      const legacy = await legacyDashboard({
        from: result.dateRange.from,
        to: result.dateRange.to,
      });
      if (legacy.panels?.length) {
        return { ...result, panels: legacy.panels, _fallback: 'plant-trends-cache' };
      }
    }
  } catch {
    /* disk cache optional */
  }
  return result;
}

async function buildHistoricalDashboard(query = {}) {
  const bounds = await getDateBounds();
  const { from, to } = clampRange(query.from, query.to, bounds);
  const defs = await loadDefinitions({ route: '/reports/trends', showOnTrends: true });
  const allMetrics = await PlantMetric.find({ enabledGlobally: { $ne: false } })
    .sort({ category: 1, label: 1 })
    .lean();
  const usedKeys = new Set();
  const panels = [];
  for (const def of defs) {
    const panel = await buildPanelPayload(def, from, to, allMetrics, usedKeys);
    if (panel) panels.push(panel);
  }

  const latestDate = to;
  const latestRows = await PlantMetricPoint.find({ reportDate: latestDate }).lean();
  const catTotals = {};
  for (const r of latestRows) {
    catTotals[r.category] = (catTotals[r.category] || 0) + Math.abs(r.value);
  }
  const categoryBreakdown = Object.entries(catTotals)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const snapshots = await TrendsSnapshot.find({
    createdAt: {
      $gte: new Date(`${from}T00:00:00Z`),
      $lte: new Date(`${to}T23:59:59Z`),
    },
  })
    .sort({ createdAt: 1 })
    .select('createdAt water energy dailyOps')
    .lean();

  const payload = {
    dateRange: { from, to, ...bounds },
    panels,
    categoryBreakdown,
    snapshots: snapshots.map((s) => ({
      date: s.createdAt,
      water: s.water,
      energy: s.energy,
      dailyOps: s.dailyOps,
    })),
    metricCount: allMetrics.length,
  };
  const merged = await mergeCachePanelsIfEmpty(payload);
  return { ...payload, panels: merged.panels, _fallback: merged._fallback };
}

async function buildHomeTrendsPayload(dateRange = {}) {
  const bounds = await getDateBounds();
  const { from, to } = clampRange(dateRange.from, dateRange.to, bounds);
  const defs = await loadDefinitions({ showOnHome: true });
  const chartDefs = defs.filter(
    (d) =>
      d.panelId.startsWith('home_chart_') ||
      d.panelId.startsWith('home_kpi_') ||
      d.panelId.startsWith('home_chem_')
  );
  const allMetrics = await PlantMetric.find({ enabledGlobally: { $ne: false } }).lean();
  const usedKeys = new Set();
  const panels = [];
  for (const def of chartDefs) {
    const panel = await buildPanelPayload(def, from, to, allMetrics, usedKeys);
    if (panel) panels.push(panel);
  }

  const customTrends = await CustomTrend.find({ showOnHomePage: true })
    .sort({ updatedAt: -1 })
    .limit(12)
    .lean();
  const custom = [];
  for (const t of customTrends) {
    const rows = await PlantMetricPoint.find({
      metricKey: { $in: t.metricKeys },
      reportDate: { $gte: from, $lte: to },
    })
      .sort({ reportDate: 1 })
      .lean();
    custom.push({
      ...t,
      series: expandDayColumnSeries(rows, t.metricKeys),
    });
  }

  const payload = { dateRange: { from, to }, panels, customTrends: custom };
  const merged = await mergeCachePanelsIfEmpty(payload);
  return { ...payload, panels: merged.panels, _fallback: merged._fallback };
}

async function buildManagementDashboard(dateRange = {}) {
  const bounds = await getDateBounds();
  const { from, to } = clampRange(dateRange.from, dateRange.to, bounds);
  const defs = await loadDefinitions({ showOnManagement: true });
  const allMetrics = await PlantMetric.find({ enabledGlobally: { $ne: false } }).lean();
  const usedKeys = new Set();
  const panels = [];
  for (const def of defs) {
    const panel = await buildPanelPayload(def, from, to, allMetrics, usedKeys);
    if (panel) panels.push(panel);
  }
  const overview = await buildOperationalOverview({ from, to });
  const payload = {
    dateRange: { from, to, ...bounds },
    panels,
    kpiSeries: overview.kpiSeries,
    latest: overview.latest,
    plantCapacityMw: overview.plantCapacityMw,
  };
  const merged = await mergeCachePanelsIfEmpty(payload);
  return { ...payload, panels: merged.panels, _fallback: merged._fallback };
}

async function buildInsightStrip() {
  const overview = await buildOperationalOverview({});
  const defs = await loadDefinitions({ showOnInsightStrip: true });
  const latest = overview.latest || {};
  const items = defs.map((def) => {
    const suffix = def.panelId.replace(/^home_insight_/, '');
    const value =
      latest[suffix] ??
      latest[def.panelId] ??
      (suffix === 'gn' ? latest.generation : undefined);
    return {
      panelId: def.panelId,
      title: def.title,
      value: value ?? null,
      unit: def.unit || '',
    };
  });
  return { items, latest, dateRange: overview.dateRange };
}

module.exports = {
  queryPanelById,
  queryPanelsForRoute,
  buildHistoricalDashboard,
  buildHomeTrendsPayload,
  buildManagementDashboard,
  buildInsightStrip,
  matchMetrics,
};
