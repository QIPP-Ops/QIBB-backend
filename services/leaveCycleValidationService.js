/**
 * Cycle leave must include the 4 off days that follow the D-D-N-N work block.
 * Single-calendar-day leave is exempt.
 */

const { calendarDatesInclusive } = require('./leaveConflictService');
const {
  crewCycleKeysForDates,
  getShiftForDate,
} = require('./shiftCycleConflict');
const { normCrew } = require('../utils/rosterRowSort');

const SHIFTING_CREWS = new Set(['A', 'B', 'C', 'D']);

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateOnly(str) {
  const d = new Date(str);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toIsoDateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = parseDateOnly(dateStr);
  d.setDate(d.getDate() + days);
  return fmtDate(d);
}

/**
 * Last calendar day of the 4 off days after a D-D-N-N block starting at cycleStartDate.
 */
function getCycleRequiredEndDate(crew, cycleStartDate, baseDate = '2026-01-01') {
  let progress = 0;
  let offCount = 0;
  let lastOffDate = null;

  for (let i = 0; i < 16; i += 1) {
    const date = addDays(cycleStartDate, i);
    const shift = getShiftForDate(crew, date, baseDate);

    if (progress < 4) {
      const token = shift === 'D' ? 'D' : shift === 'N' ? 'N' : 'BREAK';
      if (token === 'BREAK') return null;
      if (token === 'D') {
        if (progress === 0 || progress === 1) {
          progress = progress === 0 ? 1 : 2;
        } else {
          progress = 1;
        }
      } else if (progress === 2) {
        progress = 3;
      } else if (progress === 3) {
        progress = 4;
      } else {
        progress = 0;
      }
      continue;
    }

    if (shift === 'O') {
      offCount += 1;
      lastOffDate = date;
      if (offCount === 4) return lastOffDate;
    } else {
      break;
    }
  }

  return lastOffDate;
}

/**
 * @returns {{ ok: true } | { ok: false, message: string, requiredEndDate: string }}
 */
function validateCycleLeaveOffDays({ crew, startDate, endDate, baseDate = '2026-01-01' }) {
  const start = toIsoDateOnly(startDate);
  const end = toIsoDateOnly(endDate);
  const dates = calendarDatesInclusive(start, end);

  if (dates.length <= 1) {
    return { ok: true };
  }

  const crewNorm = normCrew(crew);
  if (!SHIFTING_CREWS.has(crewNorm)) {
    return { ok: true };
  }

  const extendedEnd = addDays(end, 16);
  const extendedDates = calendarDatesInclusive(start, extendedEnd);
  const cycleKeys = crewCycleKeysForDates(crewNorm, extendedDates, baseDate);

  let requiredEnd = null;
  for (const date of dates) {
    const shift = getShiftForDate(crewNorm, date, baseDate);
    if (shift !== 'D' && shift !== 'N') continue;

    const cycleKey = cycleKeys.get(date);
    if (!cycleKey) continue;

    const cycleEnd = getCycleRequiredEndDate(crewNorm, cycleKey, baseDate);
    if (cycleEnd && (!requiredEnd || cycleEnd > requiredEnd)) {
      requiredEnd = cycleEnd;
    }
  }

  if (!requiredEnd) {
    return { ok: true };
  }

  if (end < requiredEnd) {
    return {
      ok: false,
      message: `Cycle leave must include the 4 off days (date range must end on ${requiredEnd}).`,
      requiredEndDate: requiredEnd,
    };
  }

  return { ok: true };
}

module.exports = {
  getCycleRequiredEndDate,
  validateCycleLeaveOffDays,
};
