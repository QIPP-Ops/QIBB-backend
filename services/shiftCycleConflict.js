/**
 * Assign D-D-N-N cycle keys and group schedule conflicts per cycle (not per day).
 * One cycle = 2 day shifts + 2 night shifts in sequence; off days break the sequence.
 */

const SHIFT_CYCLES = {
  A: ['O', 'O', 'O', 'O', 'D', 'D', 'N', 'N'],
  B: ['D', 'D', 'N', 'N', 'O', 'O', 'O', 'O'],
  C: ['N', 'N', 'O', 'O', 'O', 'O', 'D', 'D'],
  D: ['O', 'O', 'D', 'D', 'N', 'N', 'O', 'O'],
  General: ['O', 'O', 'O', 'O', 'O', 'O', 'O', 'O'],
  S: ['O', 'O', 'O', 'O', 'O', 'O', 'O', 'O'],
};

function parseDateOnly(str) {
  const d = new Date(str);
  d.setHours(0, 0, 0, 0);
  return d;
}

const { normCrew } = require('../utils/rosterRowSort');

function getShiftForDate(crew, date, baseDate) {
  const crewKey = normCrew(crew);
  const cycle = SHIFT_CYCLES[crewKey] || SHIFT_CYCLES.General;
  const base = parseDateOnly(baseDate);
  const day = parseDateOnly(date);
  const diff = Math.floor((day - base) / 86400000);
  const idx = ((diff % 8) + 8) % 8;
  return cycle[idx];
}

function tokenForShift(shift) {
  if (shift === 'D') return 'D';
  if (shift === 'N') return 'N';
  return 'BREAK';
}

/** Map each working day to the start date of its D-D-N-N window. */
function assignShiftCycleKeys(cells) {
  const sorted = [...cells].sort((a, b) => a.date.localeCompare(b.date));
  const result = new Map();
  let progress = 0;
  let cycleStart = null;

  for (const cell of sorted) {
    const token = tokenForShift(cell.shift);
    if (token === 'BREAK') {
      progress = 0;
      cycleStart = null;
      continue;
    }
    if (token === 'D') {
      if (progress === 0 || progress === 1) {
        if (progress === 0) cycleStart = cell.date;
        progress = progress === 0 ? 1 : 2;
      } else {
        cycleStart = cell.date;
        progress = 1;
      }
    } else if (progress === 2) {
      progress = 3;
    } else if (progress === 3) {
      if (cycleStart) result.set(cell.date, cycleStart);
      progress = 0;
      cycleStart = null;
      continue;
    } else {
      progress = 0;
      cycleStart = null;
      continue;
    }
    if (cycleStart) result.set(cell.date, cycleStart);
  }
  return result;
}

function crewCycleKeysForDates(crew, dates, baseDate = '2026-01-01') {
  const cells = (dates || []).map((date) => ({
    date,
    shift: getShiftForDate(crew, date, baseDate),
  }));
  return assignShiftCycleKeys(cells);
}

function primaryCrewForConflict(conflict) {
  if (!conflict.crew?.includes('/')) return conflict.crew;
  const fromEmp = conflict.employees?.[0]?.crew;
  return fromEmp || conflict.crew.split('/')[0];
}

function conflictGroupKey(conflict, cycleKey) {
  const empIds = (conflict.employees || []).map((e) => e.empId).sort().join(',');
  return `${conflict.severity}|${conflict.crew}|${empIds}|${cycleKey}`;
}

function mergeEmployees(existing, incoming) {
  const byId = new Map((existing || []).map((e) => [e.empId, { ...e }]));
  (incoming || []).forEach((e) => {
    const prev = byId.get(e.empId);
    byId.set(e.empId, prev ? { ...prev, ...e } : { ...e });
  });
  return [...byId.values()];
}

function mergeBelow(existing, incoming) {
  const byLabel = new Map((existing || []).map((row) => [row.label, { ...row }]));
  (incoming || []).forEach((row) => {
    const prev = byLabel.get(row.label);
    if (!prev || (row.shortfall ?? 0) > (prev.shortfall ?? 0)) {
      byLabel.set(row.label, { ...row });
    }
  });
  return [...byLabel.values()];
}

function formatCycleLabel(dates) {
  if (!dates?.length) return '';
  const sorted = [...dates].sort();
  if (sorted.length === 1) return sorted[0];
  return `${sorted[0]} – ${sorted[sorted.length - 1]}`;
}

/**
 * Collapse per-day conflicts that share the same crew/employees within one D-D-N-N cycle.
 */
function groupConflictsByCycle(conflicts, dates, baseDate = '2026-01-01') {
  const cycleCache = new Map();
  const groups = new Map();

  for (const c of conflicts || []) {
    const crew = primaryCrewForConflict(c);
    if (!cycleCache.has(crew)) {
      cycleCache.set(crew, crewCycleKeysForDates(crew, dates, baseDate));
    }
    const cycleMap = cycleCache.get(crew);
    const cycleKey = cycleMap.get(c.date) || c.date;
    const key = conflictGroupKey(c, cycleKey);

    if (!groups.has(key)) {
      groups.set(key, {
        ...c,
        dates: [c.date],
        cycleKey,
        cycleStart: cycleKey,
      });
    } else {
      const g = groups.get(key);
      if (!g.dates.includes(c.date)) g.dates.push(c.date);
      g.employees = mergeEmployees(g.employees, c.employees);
      g.below = mergeBelow(g.below, c.below);
    }
  }

  return [...groups.values()].map((g) => {
    g.dates.sort();
    g.date = g.dates[0];
    g.dateEnd = g.dates[g.dates.length - 1];
    g.cycleLabel = formatCycleLabel(g.dates);
    return g;
  });
}

module.exports = {
  SHIFT_CYCLES,
  assignShiftCycleKeys,
  crewCycleKeysForDates,
  groupConflictsByCycle,
  getShiftForDate,
};
