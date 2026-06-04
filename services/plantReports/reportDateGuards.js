/**
 * Shared guards: never persist PlantMetricPoint rows with reportDate after local end-of-today.
 */

function endOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

function parseIsoDateParts(isoDate) {
  const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

function isFutureReportDate(isoDate, now = new Date()) {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) return false;
  const d = new Date(parts.year, parts.month - 1, parts.day);
  return d > endOfToday(now);
}

function isFutureCalendarDay(year, month, day, now = new Date()) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return true;
  const d = new Date(year, month - 1, day);
  return d > endOfToday(now);
}

function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Drop points with reportDate after end-of-today; log each rejection.
 * @returns {{ kept: object[], rejected: number }}
 */
function filterFutureMetricPoints(points, options = {}) {
  const now = options.now || new Date();
  const log = options.log !== false;
  const kept = [];
  let rejected = 0;

  for (const p of points || []) {
    if (!p || !p.reportDate) {
      kept.push(p);
      continue;
    }
    if (isFutureReportDate(p.reportDate, now)) {
      rejected += 1;
      if (log) {
        console.warn(
          `[plant-ingest] skip future reportDate metricKey=${p.metricKey} reportDate=${p.reportDate} sourceFile=${p.sourceFile || ''}`
        );
      }
      continue;
    }
    kept.push(p);
  }

  return { kept, rejected };
}

module.exports = {
  endOfToday,
  parseIsoDateParts,
  isFutureReportDate,
  isFutureCalendarDay,
  todayIso,
  filterFutureMetricPoints,
};
