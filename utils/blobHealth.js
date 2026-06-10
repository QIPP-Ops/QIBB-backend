/** Blob freshness thresholds (hours since last data point). */
const FRESH_HOURS = 24;
const STALE_HOURS = 72;

const ONE_HOUR_MS = 60 * 60 * 1000;

function ageHoursFromDate(lastDataPoint, now = Date.now()) {
  if (!lastDataPoint) return null;
  const iso = String(lastDataPoint).slice(0, 10);
  const ts = new Date(`${iso}T00:00:00.000Z`).getTime();
  if (Number.isNaN(ts)) return null;
  return (now - ts) / ONE_HOUR_MS;
}

function healthFromLastDataPoint(lastDataPoint, now = Date.now()) {
  const ageH = ageHoursFromDate(lastDataPoint, now);
  if (ageH == null) return 'red';
  if (ageH <= FRESH_HOURS) return 'green';
  if (ageH <= STALE_HOURS) return 'yellow';
  return 'red';
}

function healthLabel(status) {
  if (status === 'green') return 'Fresh';
  if (status === 'yellow') return 'Stale';
  return 'Missing / very stale';
}

module.exports = {
  FRESH_HOURS,
  STALE_HOURS,
  ageHoursFromDate,
  healthFromLastDataPoint,
  healthLabel,
};
