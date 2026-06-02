const { canonicalMetricKey, DAY_KEY_RE } = require('./metricKeys');

function requestedKeySet(metricKeys) {
  const canonical = new Set(metricKeys.map((k) => canonicalMetricKey(k)));
  const lower = new Set(metricKeys.map((k) => canonicalMetricKey(k).toLowerCase()));
  return { canonical, lower, raw: metricKeys };
}

function rowMatchesRequested(rowKey, requested) {
  const baseKey = canonicalMetricKey(rowKey);
  if (requested.canonical.has(baseKey)) return true;
  if (requested.lower.has(baseKey.toLowerCase())) return true;
  return requested.raw.some((k) => String(k).toLowerCase() === String(rowKey).toLowerCase());
}

/** Expand metric rows (legacy _dayN keys or per-day reportDate) into a unified timeline. */
function expandDayColumnSeries(rows, metricKeys) {
  const requested = requestedKeySet(metricKeys);
  const hasLegacyDayCols = rows.some((r) => DAY_KEY_RE.test(r.metricKey));

  if (!hasLegacyDayCols) {
    return buildSimpleSeries(rows, metricKeys);
  }

  const byTimelineDate = {};
  for (const r of rows) {
    const m = r.metricKey.match(DAY_KEY_RE);
    const baseKey = canonicalMetricKey(r.metricKey);
    if (!rowMatchesRequested(r.metricKey, requested)) continue;

    let date = r.reportDate;
    if (m) {
      const dayNum = parseInt(m[1], 10);
      if (dayNum >= 1) {
        const base = new Date(`${r.reportDate}T12:00:00Z`);
        base.setUTCDate(base.getUTCDate() - (dayNum - 1));
        date = base.toISOString().slice(0, 10);
      }
    }

    if (!byTimelineDate[date]) byTimelineDate[date] = { date };
    byTimelineDate[date][baseKey] = r.value;
  }

  return Object.values(byTimelineDate).sort((a, b) => a.date.localeCompare(b.date));
}

function buildSimpleSeries(rows, keys) {
  const requested = requestedKeySet(keys);
  const outputKeyByCanonical = new Map();
  for (const k of keys) {
    outputKeyByCanonical.set(canonicalMetricKey(k).toLowerCase(), canonicalMetricKey(k));
  }
  const byDate = {};
  for (const r of rows) {
    const baseKey = canonicalMetricKey(r.metricKey);
    if (!rowMatchesRequested(r.metricKey, requested)) continue;
    const outKey = outputKeyByCanonical.get(baseKey.toLowerCase()) || baseKey;
    if (!byDate[r.reportDate]) byDate[r.reportDate] = { date: r.reportDate };
    byDate[r.reportDate][outKey] = r.value;
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { expandDayColumnSeries, buildSimpleSeries };
