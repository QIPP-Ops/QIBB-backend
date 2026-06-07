const { buildTrendsBundleFromSixBlobs, slugMetricKey } = require('./buildTrendsBundleFromSixBlobs');
const { canonicalMetricKey } = require('./metricKeys');

function normalizeDateStr(value) {
  if (!value) return '';
  return String(value).trim().slice(0, 10);
}

function resolveBundleKey(requestedKey, seriesByKey) {
  const slug = slugMetricKey(requestedKey);
  if (seriesByKey[slug]) return slug;
  const canonical = canonicalMetricKey(requestedKey);
  const lower = canonical.toLowerCase();
  for (const key of Object.keys(seriesByKey)) {
    if (key === slug || key === canonical) return key;
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

/**
 * Load chart series for metric keys from the six-blob bundle (disk only).
 */
function fetchMetricSeriesFromBundle(keys, fromStr, toStr) {
  const keysList = [...new Set(keys.map((k) => String(k || '').trim()).filter(Boolean))];
  const from = normalizeDateStr(fromStr);
  const to = normalizeDateStr(toStr);

  if (!keysList.length) {
    return { series: [], rowCount: 0, from, to, keys: keysList };
  }

  const { payload } = buildTrendsBundleFromSixBlobs();
  const seriesByKey = payload?.seriesByKey ?? {};

  const byDate = new Map();

  for (const requested of keysList) {
    const bundleKey = resolveBundleKey(requested, seriesByKey);
    if (!bundleKey) continue;
    const rows = seriesByKey[bundleKey];
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      const date = normalizeDateStr(row.date);
      if (!date) continue;
      if (from && date < from) continue;
      if (to && date > to) continue;

      const value = row[bundleKey] ?? row.value;
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;

      if (!byDate.has(date)) byDate.set(date, { date });
      byDate.get(date)[requested] = value;
      if (bundleKey !== requested) byDate.get(date)[bundleKey] = value;
    }
  }

  const series = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const rowCount = series.length;

  console.log(
    `[trend-preview] bundle keys=${keysList.join(',')} from=${from} to=${to} count=${rowCount}`
  );

  return { series, rowCount, from, to, keys: keysList };
}

function getBundleDateBounds() {
  const { payload } = buildTrendsBundleFromSixBlobs();
  const dr = payload?.dateRange ?? {};
  return {
    minDate: dr.minDate ?? dr.from ?? null,
    maxDate: dr.maxDate ?? dr.to ?? null,
    pointCount: dr.pointCount ?? payload?.bundleMeta?.totalPoints ?? 0,
    snapshotCount: 0,
    oldestSnapshot: null,
    newestSnapshot: null,
  };
}

function metricsFromBundle() {
  const { payload } = buildTrendsBundleFromSixBlobs();
  return (payload?.metrics ?? []).map((m) => ({
    ...m,
    displayName: m.label,
    enabledGlobally: true,
  }));
}

module.exports = {
  fetchMetricSeriesFromBundle,
  getBundleDateBounds,
  metricsFromBundle,
  resolveBundleKey,
};
