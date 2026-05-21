/** Expand metric rows where keys use _day1.._dayN suffix on one reportDate into a timeline. */
function expandDayColumnSeries(rows, metricKeys) {
  const dayKeyRe = /_day(\d+)$/i;
  const hasDayCols = metricKeys.some((k) => dayKeyRe.test(k));
  if (!hasDayCols) {
    return buildSimpleSeries(rows, metricKeys);
  }

  const byTimelineDate = {};
  for (const r of rows) {
    const m = r.metricKey.match(dayKeyRe);
    if (!m) continue;
    const dayNum = parseInt(m[1], 10);
    if (!dayNum || dayNum < 1) continue;
    const base = new Date(`${r.reportDate}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() - (dayNum - 1));
    const date = base.toISOString().slice(0, 10);
    const baseKey = r.metricKey.replace(dayKeyRe, '');
    if (!byTimelineDate[date]) byTimelineDate[date] = { date };
    byTimelineDate[date][baseKey] = r.value;
  }

  return Object.values(byTimelineDate).sort((a, b) => a.date.localeCompare(b.date));
}

function buildSimpleSeries(rows, keys) {
  const byDate = {};
  for (const r of rows) {
    if (!keys.includes(r.metricKey)) continue;
    if (!byDate[r.reportDate]) byDate[r.reportDate] = { date: r.reportDate };
    byDate[r.reportDate][r.metricKey] = r.value;
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { expandDayColumnSeries, buildSimpleSeries };
