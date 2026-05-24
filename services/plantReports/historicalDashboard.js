const PlantMetricPoint = require('../../models/PlantMetricPoint');
const { PlantMetric } = require('../../models/PlantMetric');
const TrendsSnapshot = require('../../models/TrendsSnapshot');

const PANEL_DEFS = [
  {
    id: 'plant_load_gauge',
    title: 'Plant load vs period avg',
    chartType: 'gauge',
    category: 'energy',
    matchers: [/total_plant_load|plant_total_load/i],
    maxKeys: 1,
  },
  {
    id: 'plant_load',
    title: 'Plant load (MW)',
    chartType: 'composed',
    category: 'energy',
    matchers: [/total_plant_load|plant_total_load/i],
    maxKeys: 4,
  },
  {
    id: 'sw_balance',
    title: 'Seawater production vs consumption',
    chartType: 'line',
    category: 'water',
    matchers: [/sw.*prod|total_sw_prod/i, /sw.*cons|total_sw_cons/i],
    maxKeys: 2,
  },
  {
    id: 'dm_balance',
    title: 'Demin water production vs consumption',
    chartType: 'line',
    category: 'water',
    matchers: [/dm.*prod|total_dm_prod/i, /dm.*cons|total_dm_cons/i],
    maxKeys: 2,
  },
  {
    id: 'tank_levels',
    title: 'Tank levels',
    chartType: 'area',
    category: 'water',
    matchers: [/tank|st-?\d|dt-?\d|level/i],
    maxKeys: 4,
  },
  {
    id: 'fuel_gas',
    title: 'Fuel gas (tons)',
    chartType: 'bar',
    category: 'energy',
    matchers: [/fuel_gas/i],
    maxKeys: 2,
  },
  {
    id: 'chemistry',
    title: 'Chemistry & RO',
    chartType: 'line',
    category: 'chemistry',
    matchers: [/chlor|ph|conduct|silica|ro|permeate|recovery/i],
    maxKeys: 4,
  },
  {
    id: 'environment',
    title: 'Environmental',
    chartType: 'area',
    category: 'environment',
    matchers: [/emission|stack|nox|so2|co2|ambient|environment/i],
    maxKeys: 4,
  },
  {
    id: 'power_gen',
    title: 'Power generation',
    chartType: 'line',
    category: 'energy',
    matchers: [/generation|gross.*power|net.*power|mw/i],
    maxKeys: 3,
  },
  {
    id: 'power_kpi',
    title: 'GT power vs period avg',
    chartType: 'kpi',
    category: 'shift',
    matchers: [/power_mw|shift.*power/i],
    maxKeys: 1,
  },
  {
    id: 'shift_power',
    title: 'Shift report — GT power',
    chartType: 'line',
    category: 'shift',
    matchers: [/power_mw|shift.*power/i],
    maxKeys: 6,
  },
];

function matchMetrics(allMetrics, panel) {
  const hits = [];
  for (const m of allMetrics) {
    if (panel.category && m.category !== panel.category) continue;
    const label = `${m.label} ${m.metricKey}`;
    const matched = panel.matchers.some((re) => re.test(label));
    if (!matched) continue;
    if (hits.some((h) => h.metricKey === m.metricKey)) continue;
    hits.push(m);
    if (hits.length >= panel.maxKeys) break;
  }
  if (!hits.length && panel.category) {
    for (const m of allMetrics) {
      if (m.category !== panel.category) continue;
      if (hits.some((h) => h.metricKey === m.metricKey)) continue;
      hits.push(m);
      if (hits.length >= panel.maxKeys) break;
    }
  }
  return hits.slice(0, panel.maxKeys);
}

const { expandDayColumnSeries } = require('./seriesTimeline');

function buildSeriesFromRows(rows, keys) {
  return expandDayColumnSeries(rows, keys);
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
  return {
    latest,
    target: avg,
    changePct,
    min: Math.min(...vals),
    max: Math.max(...vals),
  };
}

async function getDateBounds() {
  const agg = await PlantMetricPoint.aggregate([
    {
      $group: {
        _id: null,
        minDate: { $min: '$reportDate' },
        maxDate: { $max: '$reportDate' },
        points: { $sum: 1 },
      },
    },
  ]);
  const row = agg[0] || {};
  const snapCount = await TrendsSnapshot.countDocuments();
  const oldestSnap = await TrendsSnapshot.findOne().sort({ createdAt: 1 }).select('createdAt').lean();
  const newestSnap = await TrendsSnapshot.findOne().sort({ createdAt: -1 }).select('createdAt').lean();
  return {
    minDate: row.minDate || null,
    maxDate: row.maxDate || null,
    pointCount: row.points || 0,
    snapshotCount: snapCount,
    oldestSnapshot: oldestSnap?.createdAt || null,
    newestSnapshot: newestSnap?.createdAt || null,
  };
}

function yearStartIso() {
  return `${new Date().getFullYear()}-01-01`;
}

function clampRange(from, to, bounds) {
  const defaultFrom = yearStartIso();
  let f = from || bounds.minDate || defaultFrom;
  let t = to || bounds.maxDate;
  if (!f && bounds.minDate) f = bounds.minDate;
  if (f && f < defaultFrom) f = defaultFrom;
  if (!t && bounds.maxDate) t = bounds.maxDate;
  if (!f || !t) {
    const end = new Date();
    t = end.toISOString().slice(0, 10);
    f = defaultFrom;
  }
  if (f > t) [f, t] = [t, f];
  return { from: f, to: t };
}

async function buildHistoricalDashboard(query = {}) {
  const bounds = await getDateBounds();
  const { from, to } = clampRange(query.from, query.to, bounds);

  const allMetrics = await PlantMetric.find({ enabledGlobally: { $ne: false } })
    .sort({ category: 1, label: 1 })
    .lean();

  const panels = [];
  const usedKeys = new Set();

  for (const def of PANEL_DEFS) {
    const matched = matchMetrics(allMetrics, def).filter((m) => !usedKeys.has(m.metricKey));
    if (!matched.length) continue;
    matched.forEach((m) => usedKeys.add(m.metricKey));
    const keys = matched.map((m) => m.metricKey);

    const rows = await PlantMetricPoint.find({
      metricKey: { $in: keys },
      reportDate: { $gte: from, $lte: to },
    })
      .sort({ reportDate: 1 })
      .lean();

    const series = buildSeriesFromRows(rows, keys);
    if (!series.length) continue;

    const labels = Object.fromEntries(matched.map((m) => [m.metricKey, m.label]));
    panels.push({
      id: def.id,
      title: def.title,
      chartType: def.chartType,
      category: def.category,
      unit: matched[0]?.unit || '',
      metricKeys: keys,
      labels,
      series,
      summary: panelSummary(series, keys[0]),
    });
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

  return {
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
}

module.exports = { buildHistoricalDashboard, getDateBounds, PANEL_DEFS };
