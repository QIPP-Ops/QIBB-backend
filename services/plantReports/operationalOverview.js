const { buildHistoricalDashboard, getDateBounds } = require('./historicalDashboard');
const PlantMetricPoint = require('../../models/PlantMetricPoint');
const { PlantMetric } = require('../../models/PlantMetric');

const KPI_MATCHERS = {
  plf: [/plf|plant.*availability|availability.*factor/i],
  netGen: [/plant.*load|total.*plant|network.*export|net.*gen|power.*export/i],
  heatRate: [/heat.*rate|thermal.*efficiency/i],
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

const { expandDayColumnSeries } = require('./seriesTimeline');

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

function mergeKpiRows(plfS, netS, heatS, waterS) {
  const dates = new Set([
    ...plfS.map((r) => r.date),
    ...netS.map((r) => r.date),
    ...heatS.map((r) => r.date),
    ...waterS.map((r) => r.date),
  ]);
  const plfMap = Object.fromEntries(plfS.map((r) => [r.date, r.value]));
  const netMap = Object.fromEntries(netS.map((r) => [r.date, r.value]));
  const heatMap = Object.fromEntries(heatS.map((r) => [r.date, r.value]));
  const waterMap = Object.fromEntries(waterS.map((r) => [r.date, r.value]));
  return [...dates]
    .sort()
    .map((date) => ({
      date,
      plf: plfMap[date],
      netGen: netMap[date],
      heatRate: heatMap[date],
      water: waterMap[date] != null ? { roProduction: waterMap[date] } : undefined,
    }));
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

  const [plfS, netS, heatS, waterS] = await Promise.all([
    seriesForMatchers(KPI_MATCHERS.plf, from, to),
    seriesForMatchers(KPI_MATCHERS.netGen, from, to),
    seriesForMatchers(KPI_MATCHERS.heatRate, from, to),
    seriesForMatchers(KPI_MATCHERS.waterProd, from, to),
  ]);

  const kpiSeries = mergeKpiRows(plfS, netS, heatS, waterS);
  const dashboard = await buildHistoricalDashboard({ from, to });

  return {
    dateRange: { from, to, ...bounds },
    kpiSeries,
    panels: dashboard.panels,
    categoryBreakdown: dashboard.categoryBreakdown,
  };
}

module.exports = { buildOperationalOverview };
