const { buildHistoricalDashboard, getDateBounds } = require('./historicalDashboard');
const PlantMetricPoint = require('../../models/PlantMetricPoint');
const PlantIngestionState = require('../../models/PlantIngestionState');
const { PlantMetric } = require('../../models/PlantMetric');
const { expandDayColumnSeries } = require('./seriesTimeline');

const PLANT_CAPACITY_MW = 3883.2;

/** Match ingested metricKey + label patterns (see parsers/dailyOperation.js slugKey output). */
const KPI_MATCHERS = {
  plf: [/plf|plant.*availability|availability.*factor/i],
  grossGen: [
    /plant_generation/i,
    /gross.*gen/i,
    /total.*generation/i,
    /generation.*mwh/i,
    /daily_ops_.*_total_mwh/i,
  ],
  plantLoad: [/plant_total_load|total_plant_load/i],
  heatRate: [/plant_heat_rate|heat_rate/i],
  efficiency: [/plant_net_efficiency|net_efficiency|net.*efficien/i],
  fuelGas: [/plant_fuel_gas|fuel_gas/i],
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

function pickNumeric(row, keys) {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

async function seriesForMatchers(matchers, from, to, { sumValues = false } = {}) {
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

  if (sumValues) {
    return expanded.map((row) => ({
      date: row.date,
      value: keys.reduce((acc, k) => {
        const v = row[k];
        return typeof v === 'number' && Number.isFinite(v) ? acc + v : acc;
      }, 0),
    }));
  }

  const plantKeys = keys.filter((k) => /plant_generation/i.test(k));
  const preferred = plantKeys.length ? plantKeys : keys;
  const primary = preferred[0].replace(/_day\d+$/i, '').replace(/_c\d+$/i, '');
  return expanded.map((row) => ({
    date: row.date,
    value: pickNumeric(row, preferred) ?? pickNumeric(row, keys),
  }));
}

async function seriesForGeneration(from, to) {
  const plantSeries = await seriesForMatchers([/plant_generation/i], from, to);
  if (plantSeries.some((r) => r.value != null && r.value > 0)) return plantSeries;
  return seriesForMatchers([/daily_ops_.*_total_mwh/i], from, to, { sumValues: true });
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
      const loadMw = maps.plantLoad?.[date];
      const plfRaw = maps.plf?.[date];
      let plf =
        plfRaw != null ? (plfRaw > 1 && plfRaw <= 100 ? plfRaw : plfRaw <= 1 ? plfRaw * 100 : plfRaw) : undefined;
      if (plf == null && loadMw != null && PLANT_CAPACITY_MW > 0) {
        plf = (loadMw / PLANT_CAPACITY_MW) * 100;
      }
      return {
        date,
        generation: maps.grossGen?.[date],
        load: loadMw,
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
    if (key === 'grossGen') {
      seriesMap[key] = await seriesForGeneration(from, to);
    } else {
      seriesMap[key] = await seriesForMatchers(KPI_MATCHERS[key], from, to);
    }
  }

  const kpiSeries = mergeExtendedKpiRows(seriesMap);
  const dashboard = await buildHistoricalDashboard({ from, to });

  const ingestState = await PlantIngestionState.findOne({ key: 'global' }).lean();
  const lastDataAt = bounds.maxDate || null;
  const lastIngestAt = ingestState?.lastSuccessAt
    ? new Date(ingestState.lastSuccessAt).toISOString()
    : null;

  return {
    plantCapacityMw: PLANT_CAPACITY_MW,
    dateRange: { from, to, ...bounds },
    lastDataAt,
    lastIngestAt,
    lastSync: lastIngestAt,
    kpiSeries,
    latest: buildLatestSnapshot(kpiSeries),
    panels: dashboard.panels,
    categoryBreakdown: dashboard.categoryBreakdown,
  };
}

module.exports = { buildOperationalOverview, PLANT_CAPACITY_MW };
