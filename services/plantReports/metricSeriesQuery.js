const PlantMetricPoint = require('../../models/PlantMetricPoint');
const { expandDayColumnSeries } = require('./seriesTimeline');
const { expandMetricKeysForQuery, canonicalMetricKey } = require('./metricKeys');
const { fetchMetricSeriesFromBundle } = require('./metricSeriesFromBundle');

function normalizeDateStr(value) {
  if (!value) return '';
  return String(value).trim().slice(0, 10);
}

function buildMetricKeyClauses(keys) {
  const queryKeys = expandMetricKeysForQuery(keys);
  const keyClauses = [{ metricKey: { $in: queryKeys } }];
  for (const k of keys) {
    const escaped = String(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    keyClauses.push({ metricKey: { $regex: new RegExp(`^${escaped}_day_?\\d+$`, 'i') } });
    keyClauses.push({
      metricKey: { $regex: new RegExp(`^${escaped}$`, 'i') },
    });
  }
  return keyClauses;
}

/** @deprecated Legacy Mongo path — use fetchMetricSeriesFromBundle. */
async function fetchMetricSeriesFromMongo(keys, fromStr, toStr) {
  const keysList = [...new Set(keys.map((k) => String(k || '').trim()).filter(Boolean))];
  const from = normalizeDateStr(fromStr);
  const to = normalizeDateStr(toStr);

  if (!keysList.length) {
    return { series: [], rowCount: 0, from, to, keys: keysList };
  }

  const keyClauses = buildMetricKeyClauses(keysList);

  const rows = await PlantMetricPoint.find({
    $or: keyClauses,
    reportDate: { $gte: from, $lte: to },
  })
    .sort({ reportDate: 1 })
    .lean();

  const series = expandDayColumnSeries(rows, keysList);

  console.log(
    `[trend-preview] keys=${keysList.join(',')} from=${from} to=${to} count=${series.length}`
  );

  return {
    series,
    rowCount: rows.length,
    from,
    to,
    keys: keysList,
  };
}

/** Primary hot path — six-blob bundle on disk (no Mongo). */
function fetchMetricSeries(keys, fromStr, toStr) {
  return fetchMetricSeriesFromBundle(keys, fromStr, toStr);
}

module.exports = {
  fetchMetricSeries,
  fetchMetricSeriesFromBundle,
  fetchMetricSeriesFromMongo,
  buildMetricKeyClauses,
  normalizeDateStr,
};
