const { buildHistoricalDashboard, getDateBounds } = require('./historicalDashboard');
const PlantMetricPoint = require('../../models/PlantMetricPoint');
const { PlantMetric } = require('../../models/PlantMetric');
const { expandDayColumnSeries } = require('./seriesTimeline');

const PLANT_CAPACITY_MW = 3883.2;

const KPI_MATCHERS = {
  plf: [/plf|plant.*availability|availability.*factor/i],
  grossGen: [/gross.*gen|total.*generation|generation.*mwh|net.*generation/i],
  plantLoad: [/plant.*load|total.*plant.*load|network.*export|net.*gen|power.*export|dispatch/i],
  heatRate: [/heat.*rate|thermal.*efficiency/i],
  efficiency: [/net.*efficien|thermal.*efficien|efficiency/i],
  fuelGas: [/fuel.*gas|fg.*consum/i],
  mfeqh: [/mfeqh|equivalent.*operating.*hours/i],
  nox: [/nox|no_x/i],
  sox: [/sox|so2|sulphur/i],
  co: [/\bco\b|carbon monoxide/i],
  waterProd: [/ro.*prod|dm.*prod|water.*prod|desal|migd/i],
};

async function findMetricKeys(matchers, multi = false) {
  const metrics = await PlantMetric.find({ enabledGlobally: { $ne: false } }).lean();
  const hits = [];
  for (const m of metrics) {
    const label = `${m.label} ${m.metricKey}`;
    if (matchers.some((re) => re.test(label))) hits.push(m.metricKey);
  }
  if (!hits.length) return multi ? [] : null;
  return multi ? [...new Set(hits)] : hits[0];
}

async function seriesForMatchers(matchers, from, to) {
  const keys = await findMetricKeys(matchers, true);
  if (!keys.length) return [];
  const rows = await PlantMetricPoint.find({
    metricKey: { $in: keys },
    reportDate: { $gte: from, $lte: to },
  })
    .sort({ reportDate: 1 })
    .lean();
  const expanded = expandDayColumnSeries(rows, keys);
  if (!expanded.length) return [];
  const primary = keys[0].replace(/_day\d+$/i, '');
  return expanded.map((row) => ({
    date: row.date,
    value:
      row[primary] ??
      keys.map((k) => row[k]).find((v) => typeof v === 'number' && Number.isFinite(v)),
  }));
}

async function seriesForKey(metricKey, from, to) {
  if (!metricKey) return [];
  const rows = await PlantMetricPoint.find({
    metricKey,
    reportDate: { $gte: from, $lte: to },
  })
    .sort({ reportDate: 1 })
    .lean();
  const expanded = expandDayColumnSeries(rows, [metricKey]);
  if (expanded.length > 1) {
    return expanded.map((row) => ({
      date: row.date,
      value: row[metricKey] ?? Object.values(row).find((v) => typeof v === 'number'),
    }));
  }
  return rows.map((r) => ({ date: r.reportDate, value: r.value }));
}

function mergeExtendedKpiRows(seriesMap) {
  const dates = new Set();
  Object.values(seriesMap).forEach((s) => s.forEach((r) => dates.add(r.date)));
  const maps = {};
  for (const [key, series] of Object.entries(seriesMap)) {
    maps[key] = Object.fromEntries(series.map((r) => [r.date, r.value]));
  }

  return [...dates]
    .sort()
    .map((date) => {
      const plfRaw = maps.plf?.[date];
      const plf =
        plfRaw != null ? (plfRaw > 1 && plfRaw <= 100 ? plfRaw : plfRaw <= 1 ? plfRaw * 100 : plfRaw) : undefined;
      return {
        date,
        generation: maps.grossGen?.[date],
        load: maps.plantLoad?.[date],
        plf,
        efficiency: maps.efficiency?.[date],
        heatRate: maps.heatRate?.[date],
        fuel: maps.fuelGas?.[date],
        mfeqh: maps.mfeqh?.[date],
        emissions: {
          nox: maps.nox?.[date],
          sox: maps.sox?.[date],
          co: maps.co?.[date],
        },
        netGen: maps.plantLoad?.[date],
        water: maps.waterProd?.[date] != null ? { roProduction: maps.waterProd[date] } : undefined,
      };
    });
}

function buildLatestSnapshot(kpiSeries) {
  if (!kpiSeries?.length) return null;
  const r = kpiSeries[kpiSeries.length - 1];
  const em = r.emissions || {};
  return {
    date: r.date,
    generation: r.generation,
    load: r.load,
    plf: r.plf,
    efficiency: r.efficiency,
    heatRate: r.heatRate,
    fuel: r.fuel,
    mfeqh: r.mfeqh,
    nox: em.nox,
    sox: em.sox,
    co: em.co,
  };
}

async function buildOperationalOverview(query = {}) {
  const bounds = await getDateBounds();
  let from = query.from || bounds.minDate;
  let to = query.to || bounds.maxDate;
  if (!from || !to) {
    const end = new Date();
    to = end.toISOString().slice(0, 10);
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    from = start.toISOString().slice(0, 10);
  }
  if (from > to) [from, to] = [to, from];

  const seriesMap = {};
  for (const key of Object.keys(KPI_MATCHERS)) {
    seriesMap[key] = await seriesForMatchers(KPI_MATCHERS[key], from, to);
  }

  const kpiSeries = mergeExtendedKpiRows(seriesMap);
  const dashboard = await buildHistoricalDashboard({ from, to });

  return {
    plantCapacityMw: PLANT_CAPACITY_MW,
    dateRange: { from, to, ...bounds },
    kpiSeries,
    latest: buildLatestSnapshot(kpiSeries),
    panels: dashboard.panels,
    categoryBreakdown: dashboard.categoryBreakdown,
  };
}

module.exports = { buildOperationalOverview, PLANT_CAPACITY_MW };
