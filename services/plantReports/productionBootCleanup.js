/**
 * Production startup cleanup for bad PlantMetricPoint rows + trends cache rebuild.
 * Also used by CLI scripts (cleanup:day-col-metrics, cleanup:future-metrics).
 */
const PlantMetricPoint = require('../../models/PlantMetricPoint');
const { PlantMetric } = require('../../models/PlantMetric');
const { BAD_METRIC_KEY_RE } = require('./metricKeys');
const { todayIso } = require('./reportDateGuards');
const { writePlantTrendsCache } = require('./plantTrendsCache');
const TrendDefinition = require('../../models/TrendDefinition');
const { TREND_DEFINITION_SEEDS } = require('../trends/trendDefinitionSeeds');

const CRITICAL_PANEL_IDS = ['chemistry', 'fuel_gas', 'power_gen'];

async function deleteBadDayColMetricPoints() {
  const filter = { metricKey: { $regex: BAD_METRIC_KEY_RE } };
  const badCount = await PlantMetricPoint.countDocuments(filter);
  let deletedCount = 0;
  let metricsDeleted = 0;
  if (badCount > 0) {
    const res = await PlantMetricPoint.deleteMany(filter);
    deletedCount = res.deletedCount || 0;
    const mRes = await PlantMetric.deleteMany({ metricKey: { $regex: BAD_METRIC_KEY_RE } });
    metricsDeleted = mRes.deletedCount || 0;
  }
  const remainingBadPoints = await PlantMetricPoint.countDocuments(filter);
  return { badCount, deletedCount, metricsDeleted, remainingBadPoints };
}

async function deleteFuturePlantMetricPoints() {
  const today = todayIso();
  const futureCount = await PlantMetricPoint.countDocuments({ reportDate: { $gt: today } });
  let deletedCount = 0;
  if (futureCount > 0) {
    const res = await PlantMetricPoint.deleteMany({ reportDate: { $gt: today } });
    deletedCount = res.deletedCount || 0;
  }
  const remainingFuture = await PlantMetricPoint.countDocuments({ reportDate: { $gt: today } });
  return { today, futureCount, deletedCount, remainingFuture };
}

/**
 * Run day/col + future-date cleanup, then rebuild plant-trends-cache from Cosmos.
 */
async function runProductionBootCleanup() {
  const dayCol = await deleteBadDayColMetricPoints();
  const future = await deleteFuturePlantMetricPoints();

  console.log(
    `[boot-cleanup] bad day/col keys: found=${dayCol.badCount} deleted=${dayCol.deletedCount} catalogDeleted=${dayCol.metricsDeleted} remaining=${dayCol.remainingBadPoints}`
  );
  console.log(
    `[boot-cleanup] future reportDate > ${future.today}: found=${future.futureCount} deleted=${future.deletedCount} remaining=${future.remainingFuture}`
  );

  let panelsRefreshed = 0;
  for (const seed of TREND_DEFINITION_SEEDS.filter((s) => CRITICAL_PANEL_IDS.includes(s.panelId))) {
    await TrendDefinition.findOneAndUpdate({ panelId: seed.panelId }, seed, {
      upsert: true,
      new: true,
    });
    panelsRefreshed += 1;
  }
  if (panelsRefreshed) {
    console.log(`[boot-cleanup] refreshed TrendDefinitions: ${CRITICAL_PANEL_IDS.join(', ')}`);
  }

  let trendsCache = null;
  try {
    trendsCache = await writePlantTrendsCache();
    console.log(
      `[boot-cleanup] trends cache rebuilt: metrics=${trendsCache?.metrics?.length ?? 0} seriesKeys=${Object.keys(trendsCache?.seriesByKey || {}).length}`
    );
  } catch (err) {
    console.warn('[boot-cleanup] trends cache rebuild failed:', err.message);
  }

  return {
    dayColDeleted: dayCol.deletedCount,
    dayColRemaining: dayCol.remainingBadPoints,
    futureDeleted: future.deletedCount,
    futureRemaining: future.remainingFuture,
    trendsCacheMetrics: trendsCache?.metrics?.length ?? 0,
    panelsRefreshed,
  };
}

module.exports = {
  deleteBadDayColMetricPoints,
  deleteFuturePlantMetricPoints,
  runProductionBootCleanup,
};
