const { buildHistoricalDashboard } = require('./historicalDashboard');
const {
  fetchMetricSeriesFromBundle,
  getBundleDateBounds,
  metricsFromBundle,
} = require('./metricSeriesFromBundle');
const { getSyncState } = require('./syncTrendsBlobsService');

const PLANT_CAPACITY_MW = 3883.2;

const { kpiMatchers } = require('../metricKeyRegistry');

/** Registry kpi id → internal series-map key */
const KPI_KEY_ALIAS = {
  gn: 'grossGen',
  ld: 'plantLoad',
  pf: 'plf',
  ef: 'efficiency',
  hr: 'heatRate',
  fu: 'fuelGas',
  mf: 'mfeqh',
};

/** Match ingested metricKey + label patterns (central registry). */
const KPI_MATCHERS = kpiMatchers();

function sanitizeEmissionValue(value) {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > 10_000) return undefined;
  return value;
}

function findEmissionMetricKey(metrics, emission) {
  const patterns = {
    nox: /nox|no_x/i,
    sox: /sox|so2|sulphur/i,
    co: /\bco\b|carbon monoxide/i,
  };
  const exclude = {
    nox: /conduct|carbon|diox|co2/i,
    sox: /conduct|carbon|diox/i,
    co: /conduct|carbon diox|co2|cc_us|sc_us/i,
  };
  const hits = [];
  for (const m of metrics) {
    const text = `${m.label} ${m.metricKey}`;
    const cat = (m.category || '').toLowerCase();
    if (cat && cat !== 'environment' && !/emission|stack/i.test(cat)) continue;
    if (!patterns[emission].test(text)) continue;
    if (exclude[emission].test(text)) continue;
    hits.push(m.metricKey);
  }
  if (!hits.length) return null;
  const avg = hits.find((k) => /average/i.test(k));
  return avg ?? hits[0];
}

function findMetricKeysFromBundle(matchers, multi = false) {
  const metrics = metricsFromBundle();
  const hits = [];
  for (const m of metrics) {
    const label = `${m.label} ${m.metricKey}`;
    if (matchers.some((re) => re.test(label))) hits.push(m.metricKey);
  }
  if (!hits.length) return multi ? [] : null;
  const preferred = hits.find((k) => /^daily_op_/i.test(k)) ?? hits.find((k) => /average/i.test(k));
  return multi ? [...new Set(hits)] : preferred ?? hits[0];
}

function seriesForMatchersFromBundle(matchers, from, to, { sumValues = false } = {}) {
  const keys = findMetricKeysFromBundle(matchers, true);
  if (!keys.length) return [];
  const { series } = fetchMetricSeriesFromBundle(keys, from, to);
  if (!series.length) return [];

  if (sumValues) {
    return series.map((row) => ({
      date: row.date,
      value: keys.reduce((acc, k) => {
        const v = row[k];
        return typeof v === 'number' && Number.isFinite(v) ? acc + v : acc;
      }, 0),
    }));
  }

  const plantKeys = keys.filter((k) => /plant_generation|daily_op_plant_gross/i.test(k));
  const preferred = plantKeys.length ? plantKeys : keys;
  const primary = preferred[0];
  return series.map((row) => ({
    date: row.date,
    value:
      row[primary] ??
      preferred.map((k) => row[k]).find((v) => typeof v === 'number' && Number.isFinite(v)),
  }));
}

function seriesForGeneration(from, to) {
  const plantSeries = seriesForMatchersFromBundle([/plant_generation|daily_op_plant_gross_gen/i], from, to);
  if (plantSeries.some((r) => r.value != null && r.value > 0)) return plantSeries;
  return seriesForMatchersFromBundle([/daily_ops_.*_total_mwh/i], from, to, { sumValues: true });
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
          nox: sanitizeEmissionValue(maps.nox?.[date]),
          sox: sanitizeEmissionValue(maps.sox?.[date]),
          co: sanitizeEmissionValue(maps.co?.[date]),
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
    gn: r.generation,
    ld: r.load,
    pf: r.plf,
    ef: r.efficiency,
    hr: r.heatRate,
    fu: r.fuel,
    mf: r.mfeqh,
    nox: em.nox,
    sox: em.sox,
    co: em.co,
  };
}

async function buildOperationalOverview(query = {}) {
  const bounds = getBundleDateBounds();
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
  const metrics = metricsFromBundle();
  for (const registryId of Object.keys(KPI_MATCHERS)) {
    const key = KPI_KEY_ALIAS[registryId] ?? registryId;
    const matchers = KPI_MATCHERS[registryId];
    if (key === 'grossGen') {
      seriesMap[key] = seriesForGeneration(from, to);
    } else if (key === 'nox' || key === 'sox' || key === 'co') {
      const emissionKey = findEmissionMetricKey(metrics, key);
      if (emissionKey) {
        const { series } = fetchMetricSeriesFromBundle([emissionKey], from, to);
        seriesMap[key] = series.map((row) => ({
          date: row.date,
          value: sanitizeEmissionValue(row[emissionKey]),
        }));
      } else {
        seriesMap[key] = seriesForMatchersFromBundle(matchers, from, to);
      }
    } else {
      seriesMap[key] = seriesForMatchersFromBundle(matchers, from, to);
    }
  }

  const kpiSeries = mergeExtendedKpiRows(seriesMap);
  const dashboard = await buildHistoricalDashboard({ from, to });

  const sync = getSyncState();
  const lastDataAt = bounds.maxDate || null;
  const lastIngestAt = sync?.lastResult?.lastRunAt
    ? new Date(sync.lastResult.lastRunAt).toISOString()
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

module.exports = {
  buildOperationalOverview,
  PLANT_CAPACITY_MW,
  seriesForGeneration,
  KPI_MATCHERS,
};
