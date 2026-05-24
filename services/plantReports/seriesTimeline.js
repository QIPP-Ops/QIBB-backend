const { canonicalMetricKey, DAY_KEY_RE } = require('./metricKeys');

/** Expand metric rows (legacy _dayN keys or per-day reportDate) into a unified timeline. */
function expandDayColumnSeries(rows, metricKeys) {
  const requested = new Set(metricKeys.map((k) => canonicalMetricKey(k)));
  const hasLegacyDayCols = rows.some((r) => DAY_KEY_RE.test(r.metricKey));

  if (!hasLegacyDayCols) {
    return buildSimpleSeries(rows, metricKeys);
  }

  const byTimelineDate = {};
  for (const r of rows) {
    const m = r.metricKey.match(DAY_KEY_RE);
    const baseKey = canonicalMetricKey(r.metricKey);
    if (!requested.has(baseKey) && !metricKeys.includes(r.metricKey)) continue;

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
  const requested = new Set(keys.map((k) => canonicalMetricKey(k)));
  const byDate = {};
  for (const r of rows) {
    const baseKey = canonicalMetricKey(r.metricKey);
    if (!requested.has(baseKey) && !keys.includes(r.metricKey)) continue;
    if (!byDate[r.reportDate]) byDate[r.reportDate] = { date: r.reportDate };
    byDate[r.reportDate][baseKey] = r.value;
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { expandDayColumnSeries, buildSimpleSeries };
