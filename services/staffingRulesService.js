const {
  actingCoverCountForRole,
  approvedAssignmentsForRange,
} = require('./actingCoverService');

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

function leaveOnDate(leave, dateStr) {
  const status = leave?.status || 'approved';
  if (status === 'rejected') return false;
  const d = parseDateOnly(dateStr);
  const s = parseDateOnly(leave.start);
  const e = parseDateOnly(leave.end);
  return d >= s && d <= e;
}

/** Minimum staffing per crew per working day (General crew excluded upstream). */
const STAFFING_RULES = [
  {
    label: 'Leader',
    min: 1,
    match: (role) =>
      /shift in charge/i.test(role || '') ||
      (/\bsupervisor\b/i.test(role || '') && !/shift in charge/i.test(role || '')),
  },
  { label: 'CCR Operator', min: 3, match: (role) => /ccr operator/i.test(role || '') },
  { label: 'Local Operator', min: 4, match: (role) => /local operator/i.test(role || '') },
  { label: 'Chemist', min: 1, match: (role) => /chemist/i.test(role || '') },
];

function approvedLeavesOnly(employee, includeLeaveId = null) {
  return (employee.leaves || []).filter((lv) => {
    const status = lv.status || 'approved';
    if (includeLeaveId && String(lv._id) === String(includeLeaveId)) return true;
    return status === 'approved';
  });
}

function employeeOnApprovedLeave(employee, dateStr) {
  return approvedLeavesOnly(employee).some((lv) => leaveOnDate(lv, dateStr));
}

function employeeOnAnyLeave(employee, dateStr) {
  return (employee.leaves || []).some((lv) => leaveOnDate(lv, dateStr));
}

function staffingCountsForDate(employees, crew, dateStr, actingAssignments = [], options = {}) {
  const { approvedLeaveOnly = false } = options;
  const onLeave = approvedLeaveOnly ? employeeOnApprovedLeave : employeeOnAnyLeave;
  const approved = approvedAssignmentsForRange(actingAssignments, dateStr, dateStr);

  const counts = STAFFING_RULES.map((rule) => {
    const roster = employees.filter((e) => e.crew === crew && rule.match(e.role));
    const available = roster.filter((e) => !onLeave(e, dateStr));
    const actingBoost = actingCoverCountForRole(
      employees,
      approved,
      crew,
      dateStr,
      null,
      rule.match
    );
    const totalAvailable = available.length + actingBoost;
    return {
      label: rule.label,
      min: rule.min,
      available: totalAvailable,
      rosterSize: roster.length,
      actingCover: actingBoost,
      shortfall: Math.max(0, rule.min - totalAvailable),
    };
  });

  return counts.filter((c) => c.rosterSize > 0);
}

function calendarDatesInclusive(start, end) {
  const dates = [];
  const cur = parseDateOnly(start);
  const last = parseDateOnly(end);
  while (cur <= last) {
    dates.push(fmtDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/**
 * Role-based understaffing conflicts for working days in a schedule range.
 */
function buildStaffingShortfallConflicts(employees, options = {}) {
  const {
    dates = [],
    baseDate = '2026-01-01',
    actingAssignments = [],
    approvedLeaveOnly = true,
    getShiftForDate,
    isGeneralCrew,
  } = options;

  if (!getShiftForDate || !isGeneralCrew) return [];

  const crewsToCheck = [
    ...new Set(employees.map((e) => e.crew).filter((c) => c && !isGeneralCrew(c))),
  ];

  const conflicts = [];
  for (const dateStr of dates) {
    for (const crew of crewsToCheck) {
      const shift = getShiftForDate(crew, dateStr, baseDate);
      if (shift === 'O') continue;

      const counts = staffingCountsForDate(employees, crew, dateStr, actingAssignments, {
        approvedLeaveOnly,
      });
      const below = counts.filter((c) => c.shortfall > 0);
      if (!below.length) continue;

      const onLeavePeople = employees
        .filter((e) => e.crew === crew)
        .filter((e) =>
          approvedLeaveOnly ? employeeOnApprovedLeave(e, dateStr) : employeeOnAnyLeave(e, dateStr)
        )
        .map((e) => ({
          empId: e.empId,
          name: e.name,
          role: e.role,
          color: e.color || e.seniority || 'crew-grey',
        }));

      conflicts.push({
        date: dateStr,
        crew,
        severity: 'high',
        conflictType: 'staffing',
        message: `Understaffed (${crew}): ${below
          .map((b) => `${b.label} ${b.available}/${b.min}`)
          .join(', ')}`,
        employees: onLeavePeople,
        below,
      });
    }
  }

  return conflicts;
}

module.exports = {
  STAFFING_RULES,
  approvedLeavesOnly,
  employeeOnApprovedLeave,
  employeeOnAnyLeave,
  staffingCountsForDate,
  calendarDatesInclusive,
  buildStaffingShortfallConflicts,
  fmtDate,
  parseDateOnly,
  leaveOnDate,
};
