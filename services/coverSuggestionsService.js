const {
  getShiftForDate,
  resolveEmployeeShift,
  fmtDate,
  parseDateOnly,
} = require('./shiftScheduleService');
const {
  STAFFING_RULES,
  employeeOnApprovedLeave,
  staffingCountsForDate,
} = require('./staffingRulesService');
const { rolesMatchForCover, staffingRuleLabelForRole } = require('../utils/roleCoverMatch');
const { isGeneralCrew } = require('../utils/rosterRowSort');

const SENIORITY_RANK = {
  'crew-red': 1,
  'crew-yellow': 2,
  'crew-green': 3,
  'crew-lightblue': 4,
  'crew-lightviolet': 5,
  'crew-lightorange': 6,
  'crew-grey': 7,
};

function resolveStaffingRule(roleParam) {
  const param = String(roleParam || '').trim();
  if (!param) return null;
  const byLabel = STAFFING_RULES.find((r) => r.label.toLowerCase() === param.toLowerCase());
  if (byLabel) return byLabel;
  return STAFFING_RULES.find((r) => r.match(param)) || null;
}

function shiftOnDateBefore(dateStr, daysBack, baseDate) {
  const d = parseDateOnly(dateStr);
  d.setDate(d.getDate() - daysBack);
  return fmtDate(d);
}

/**
 * Position within consecutive off block (1–4) and first-off-after-nights flag.
 */
function getOffBlockInfo(crew, dateStr, baseDate) {
  const rotationShift = getShiftForDate(crew, dateStr, baseDate);
  if (rotationShift !== 'O') {
    return { onOff: false, onOffDay: 0, isFirstOffAfterNights: false, canCoverDay: false, canCoverNight: false };
  }

  let onOffDay = 1;
  let cursor = parseDateOnly(dateStr);
  cursor.setDate(cursor.getDate() - 1);
  while (getShiftForDate(crew, fmtDate(cursor), baseDate) === 'O') {
    onOffDay += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const lastWorkDate = fmtDate(cursor);
  const lastWork = getShiftForDate(crew, lastWorkDate, baseDate);
  const prevWorkDate = shiftOnDateBefore(lastWorkDate, 1, baseDate);
  const prevWork = getShiftForDate(crew, prevWorkDate, baseDate);
  const isFirstOffAfterNights = onOffDay === 1 && lastWork === 'N' && prevWork === 'N';
  const canCoverDay = !isFirstOffAfterNights;
  const canCoverNight = true;

  return {
    onOff: true,
    onOffDay: Math.min(onOffDay, 4),
    isFirstOffAfterNights,
    canCoverDay,
    canCoverNight,
  };
}

function eligibilityReason(offInfo, requestedShift, eligible) {
  if (!offInfo.onOff) return 'Not on off rotation (O) this day';
  if (eligible) return 'Available to cover';
  if (offInfo.isFirstOffAfterNights && requestedShift === 'D') {
    return 'First off day after nights — cannot cover day shift (D)';
  }
  if (!offInfo.canCoverDay && requestedShift === 'D') return 'Cannot cover day shift (D)';
  if (!offInfo.canCoverNight && requestedShift === 'N') return 'Cannot cover night shift (N)';
  return 'Not eligible for requested shift';
}

function compareCandidates(a, b) {
  const ra = SENIORITY_RANK[a.seniority] ?? 99;
  const rb = SENIORITY_RANK[b.seniority] ?? 99;
  if (ra !== rb) return ra - rb;
  if (a.eligibleForRequestedShift !== b.eligibleForRequestedShift) {
    return a.eligibleForRequestedShift ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

function employeeMatchesRoleParam(employee, roleParam, staffingRule) {
  if (!staffingRule) {
    return rolesMatchForCover(roleParam, employee.role);
  }
  if (!staffingRule.match(employee.role)) return false;
  return rolesMatchForCover(roleParam, employee.role);
}

function isWorkingOwnShift(employee, dateStr, baseDate) {
  const resolved = resolveEmployeeShift(employee, dateStr, { baseDate });
  if (resolved.onLeave) return false;
  return resolved.shift === 'D' || resolved.shift === 'N';
}

/**
 * Build ranked cover candidates for a crew/date/role/shift (super-admin tool).
 */
function buildCoverSuggestions(employees, options = {}) {
  const {
    date: dateStr,
    crew,
    role: roleParam,
    shift: requestedShift,
    baseDate = '2026-01-01',
    actingAssignments = [],
  } = options;

  if (!dateStr || !crew || !roleParam) {
    return { candidates: [], meta: { error: 'date, crew, and role are required' } };
  }

  const shift = String(requestedShift || getShiftForDate(crew, dateStr, baseDate)).toUpperCase();
  if (shift !== 'D' && shift !== 'N') {
    return { candidates: [], meta: { error: 'shift must be D or N' } };
  }

  const staffingRule = resolveStaffingRule(roleParam);
  const targetCrew = String(crew).trim();

  const pool = (employees || []).filter((e) => {
    if (!e?.empId || isGeneralCrew(e.crew)) return false;
    if (!employeeMatchesRoleParam(e, roleParam, staffingRule)) return false;
    if (employeeOnApprovedLeave(e, dateStr)) return false;
    if (isWorkingOwnShift(e, dateStr, baseDate)) return false;
    const offInfo = getOffBlockInfo(e.crew, dateStr, baseDate);
    if (!offInfo.onOff) return false;
    return true;
  });

  const candidates = pool.map((e) => {
    const offInfo = getOffBlockInfo(e.crew, dateStr, baseDate);
    const eligibleForRequestedShift =
      shift === 'D' ? offInfo.canCoverDay : offInfo.canCoverNight;
    const seniority = e.seniority || e.color || 'crew-grey';

    return {
      empId: e.empId,
      name: e.name,
      role: e.role,
      crew: e.crew,
      seniority,
      onOffDay: offInfo.onOffDay,
      canCoverDay: offInfo.canCoverDay,
      canCoverNight: offInfo.canCoverNight,
      eligibleForRequestedShift,
      reason: eligibilityReason(offInfo, shift, eligibleForRequestedShift),
    };
  });

  candidates.sort(compareCandidates);

  const counts = staffingCountsForDate(employees, targetCrew, dateStr, actingAssignments, {
    approvedLeaveOnly: true,
  });
  const ruleLabel = staffingRule?.label || staffingRuleLabelForRole(roleParam) || roleParam;
  const roleCount = counts.find((c) => c.label === ruleLabel);
  const shortfallBefore = roleCount?.shortfall ?? 0;
  const eligibleCount = candidates.filter((c) => c.eligibleForRequestedShift).length;

  const meta = {
    date: dateStr,
    crew: targetCrew,
    role: ruleLabel,
    shift,
    shortfallBefore,
    stillUnderstaffedAfterBestCover: Math.max(0, shortfallBefore - 1),
    eligibleCandidateCount: eligibleCount,
  };

  return {
    candidates: candidates.map((c) => ({
      ...c,
      stillUnderstaffed: meta.stillUnderstaffedAfterBestCover > 0 && c.eligibleForRequestedShift,
    })),
    meta,
  };
}

module.exports = {
  buildCoverSuggestions,
  getOffBlockInfo,
  resolveStaffingRule,
  SENIORITY_RANK,
};
