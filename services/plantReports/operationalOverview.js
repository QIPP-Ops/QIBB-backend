const { buildHistoricalDashboard, getDateBounds } = require('./historicalDashboard');
const PlantMetricPoint = require('../../models/PlantMetricPoint');
const { PlantMetric } = require('../../models/PlantMetric');

const KPI_MATCHERS = {
  plf: [/plf|plant.*availability|availability.*factor/i],
  netGen: [/net.*gen|network.*export|total.*export|plant.*load|power.*export/i],
  heatRate: [/heat.*rate|thermal.*efficiency/i],
  waterProd: [/ro.*prod|dm.*prod|water.*prod|desal|migd/i],
};

async function findMetricKeys(matchers) {
  const metrics = await PlantMetric.find({ enabledGlobally: { $ne: false } }).lean();
  for (const re of matchers) {
    const hit = metrics.find((m) => re.test(`${m.label} ${m.metricKey}`));
    if (hit) return hit.metricKey;
  }
  return null;
}

async function seriesForKey(metricKey, from, to) {
  if (!metricKey) return [];
  const rows = await PlantMetricPoint.find({
    metricKey,
    reportDate: { $gte: from, $lte: to },
  })
    .sort({ reportDate: 1 })
    .lean();
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

  const [plfKey, netKey, heatKey, waterKey] = await Promise.all([
    findMetricKeys(KPI_MATCHERS.plf),
    findMetricKeys(KPI_MATCHERS.netGen),
    findMetricKeys(KPI_MATCHERS.heatRate),
    findMetricKeys(KPI_MATCHERS.waterProd),
  ]);

  const [plfS, netS, heatS, waterS] = await Promise.all([
    seriesForKey(plfKey, from, to),
    seriesForKey(netKey, from, to),
    seriesForKey(heatKey, from, to),
    seriesForKey(waterKey, from, to),
  ]);

  const kpiSeries = mergeKpiRows(plfS, netS, heatS, waterS);
  const dashboard = await buildHistoricalDashboard({ from, to });

  return {
    dateRange: { from, to, ...bounds },
    kpiSeries,
    panels: dashboard.panels,
    categoryBreakdown: dashboard.categoryBreakdown,
    metricKeys: { plf: plfKey, netGen: netKey, heatRate: heatKey, water: waterKey },
  };
}

module.exports = { buildOperationalOverview };
