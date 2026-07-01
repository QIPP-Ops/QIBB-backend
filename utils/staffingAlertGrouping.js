const { parseDateOnly, fmtDate } = require('../services/staffingRulesService');

/** Collapse sorted ISO dates into contiguous from–to ranges. */
function collapseIsoDatesToRanges(dates) {
  const sorted = [...new Set((dates || []).map((d) => String(d).slice(0, 10)).filter(Boolean))].sort();
  if (!sorted.length) return [];

  const ranges = [];
  let from = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i];
    const prevDt = parseDateOnly(prev);
    const curDt = parseDateOnly(cur);
    const gap = Math.round((curDt - prevDt) / 86400000);
    if (gap === 1) {
      prev = cur;
      continue;
    }
    ranges.push({ from, to: prev });
    from = cur;
    prev = cur;
  }
  ranges.push({ from, to: prev });
  return ranges;
}

function belowSignature(below) {
  return (below || [])
    .map((b) => `${b.label}:${b.shortfall ?? Math.max(0, (b.min ?? 0) - (b.available ?? 0))}`)
    .join(';');
}

/**
 * Group per-day staffing alerts into contiguous date ranges (same crew + shortfalls).
 * Single isolated days remain as one-day ranges.
 */
function groupLabelsKey(alert) {
  return (alert.groupLabels || alert.groups?.map((g) => g.groupLabel) || [])
    .slice()
    .sort()
    .join(',');
}

function groupStaffingAlertsByDateRange(alerts) {
  const groups = new Map();
  for (const alert of alerts || []) {
    const key = `${alert.crew}|${alert.shift || ''}|${groupLabelsKey(alert)}|${belowSignature(alert.below)}`;
    const list = groups.get(key) || [];
    list.push(alert);
    groups.set(key, list);
  }

  const grouped = [];
  for (const list of groups.values()) {
    const sample = list[0];
    for (const { from, to } of collapseIsoDatesToRanges(list.map((a) => a.date))) {
      grouped.push({
        ...sample,
        date: from,
        dateEnd: to,
        dateLabel: from === to ? from : `${from} – ${to}`,
      });
    }
  }

  return grouped.sort((a, b) => a.date.localeCompare(b.date) || a.crew.localeCompare(b.crew));
}

module.exports = {
  collapseIsoDatesToRanges,
  groupLabelsKey,
  groupStaffingAlertsByDateRange,
};
