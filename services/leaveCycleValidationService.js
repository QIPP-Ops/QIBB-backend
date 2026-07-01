/**
 * Cycle leave validation helpers.
 * Multi-day leave is allowed for any contiguous period; whole D-D-N-N + 4 off days
 * is no longer required. Single-day leave remains supported.
 */

const { getShiftForDate } = require('./shiftCycleConflict');

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
 * Leave periods are validated as contiguous ranges; no whole-cycle extension is enforced.
 * @returns {{ ok: true }}
 */
function validateCycleLeaveOffDays() {
  return { ok: true };
}

module.exports = {
  getCycleRequiredEndDate,
  validateCycleLeaveOffDays,
};
