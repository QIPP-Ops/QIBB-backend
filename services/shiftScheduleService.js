/**
 * Crew shift cycles (8-day rotation). Same logic as roster ICS export.
 */
const SHIFT_CYCLES = {
  A:       ['O', 'O', 'O', 'O', 'D', 'D', 'N', 'N'],
  B:       ['D', 'D', 'N', 'N', 'O', 'O', 'O', 'O'],
  C:       ['N', 'N', 'O', 'O', 'O', 'O', 'D', 'D'],
  D:       ['O', 'O', 'D', 'D', 'N', 'N', 'O', 'O'],
  General: ['O', 'O', 'O', 'O', 'O', 'O', 'O', 'O'],
  S:       ['O', 'O', 'O', 'O', 'O', 'O', 'O', 'O'],
};

const MANAGEMENT_JOB_ROLES = new Set([
  'Management',
  'Shift in Charge Engineer',
  'Shift in Charge',
  'Supervisor',
  'Operations Support',
]);

const SENIORITY_RANK = {
  'crew-red': 1,
  'crew-yellow': 2,
  'crew-green': 3,
  'crew-lightblue': 4,
  'crew-lightviolet': 5,
  'crew-lightorange': 6,
  'crew-grey': 7,
};

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

function getShiftForDate(crew, date, baseDate) {
  const cycle = SHIFT_CYCLES[crew] || SHIFT_CYCLES.General;
  const base = parseDateOnly(baseDate);
  const day = parseDateOnly(date);
  const diff = Math.floor((day - base) / 86400000);
  const idx = ((diff % 8) + 8) % 8;
  return cycle[idx];
}

function eachDateInRange(start, end, fn) {
  const s = parseDateOnly(start);
  const e = parseDateOnly(end);
  const cur = new Date(s);
  while (cur <= e) {
    fn(fmtDate(cur), new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
}

function leaveOnDate(leave, dateStr) {
  const status = leave?.status || 'approved';
  if (status === 'rejected') return false;
  const d = parseDateOnly(dateStr);
  const s = parseDateOnly(leave.start);
  const e = parseDateOnly(leave.end);
  return d >= s && d <= e;
}

function approvedLeaveOnDate(employee, dateStr) {
  return (employee.leaves || []).find((lv) => {
    const status = lv.status || 'approved';
    if (status !== 'approved') return false;
    const d = parseDateOnly(dateStr);
    const s = parseDateOnly(lv.start);
    const e = parseDateOnly(lv.end);
    return d >= s && d <= e;
  });
}

/**
 * Resolve effective shift for one employee on a calendar day (rotation + override + leave).
 */
function resolveEmployeeShift(employee, dateStr, options = {}) {
  const { baseDate = '2026-01-01', overrideMap = null } = options;
  const overrides = overrideMap instanceof Map ? overrideMap : overrideMapFromDocs(overrideMap);
  const rotationShift = getShiftForDate(employee.crew, dateStr, baseDate);
  const oKey = `${employee.empId}|${dateStr}`;
  const isOverride = overrides.has(oKey);
  const shift = isOverride ? overrides.get(oKey) : rotationShift;
  const leave = (employee.leaves || []).find((lv) => leaveOnDate(lv, dateStr));
  const leaveStatus = leave ? (leave.status || 'approved') : null;
  return {
    date: dateStr,
    shift,
    rotationShift,
    isOverride,
    onLeave: !!leave,
    leaveStatus,
    leaveType: leave?.type || null,
    display: leave ? 'L' : shift,
    onDuty: !leave && (shift === 'D' || shift === 'N'),
  };
}

function isEmployeeOnDuty(employee, dateStr, options = {}) {
  return resolveEmployeeShift(employee, dateStr, options).onDuty;
}

const { normalizeLeaveType, isAnnualLeaveType } = require('../constants/leaveTypes');
const { sortRosterEmployees, isGeneralCrew } = require('../utils/rosterRowSort');
const { buildStaffingShortfallConflicts } = require('./staffingRulesService');

function leaveStyleFlags(type) {
  const t = normalizeLeaveType(type);
  return {
    leaveType: t,
    isAnnualLeave: isAnnualLeaveType(t),
    isBankLeave: t === 'Bank Leave',
    isPlannedLeave: t === 'Planned' || /^applied on sap$/i.test(String(type || '')),
  };
}

/**
 * Build schedule grid + conflicts + coverage hints for a date range.
 */
function overrideMapFromDocs(docs) {
  const map = new Map();
  (docs || []).forEach((o) => map.set(`${o.empId}|${o.date}`, o.shift));
  return map;
}

function buildRosterSchedule(employees, options = {}) {
  const {
    startDate,
    endDate,
    baseDate = '2026-01-01',
    overrideMap = null,
  } = options;

  const overrides = overrideMap instanceof Map ? overrideMap : overrideMapFromDocs(overrideMap);

  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(fmtDate(cur));
    cur.setDate(cur.getDate() + 1);
  }

  const sortedEmployees = sortRosterEmployees(employees);

  const rows = sortedEmployees.map((emp) => {
    const cells = dates.map((dateStr) => {
      const rotationShift = getShiftForDate(emp.crew, dateStr, baseDate);
      const oKey = `${emp.empId}|${dateStr}`;
      const isOverride = overrides.has(oKey);
      const shift = isOverride ? overrides.get(oKey) : rotationShift;
      const leave = (emp.leaves || []).find((lv) => leaveOnDate(lv, dateStr));
      const style = leave ? leaveStyleFlags(leave.type) : {};
      const leaveStatus = leave ? (leave.status || 'approved') : null;
      return {
        date: dateStr,
        shift,
        rotationShift,
        isOverride,
        onLeave: !!leave,
        leaveId: leave?._id?.toString() || null,
        leaveStatus,
        leaveType: leave ? style.leaveType || leave.type : null,
        isAnnualLeave: !!leave && style.isAnnualLeave,
        isBankLeave: !!leave && style.isBankLeave,
        isPlannedLeave: !!leave && style.isPlannedLeave,
        appliedOnSap: leave ? leave.appliedOnSap === true : false,
        display: leave ? 'L' : shift,
      };
    });
    return {
      _id: emp._id,
      empId: emp.empId,
      name: emp.name,
      email: emp.email,
      crew: emp.crew,
      role: emp.role,
      jobRole: emp.role,
      group: emp.opsGroupLabel || '',
      color: emp.color || emp.seniority || 'crew-grey',
      seniority: emp.seniority || emp.color || 'crew-grey',
      compensateDayBalance: emp.compensateDayBalance ?? 0,
      annualLeaveBalance: emp.annualLeaveBalance ?? 0,
      bankLeaveBalance: emp.bankLeaveBalance ?? 0,
      isERT: Boolean(emp.isERT),
      employeeExternalId: emp.employeeExternalId || '',
      cells,
    };
  });

  const { actingAssignments = [] } = options;

  const conflicts = buildStaffingShortfallConflicts(sortedEmployees, {
    dates,
    baseDate,
    actingAssignments,
    approvedLeaveOnly: true,
    getShiftForDate,
    isGeneralCrew,
  });

  const crewsToCheck = [
    ...new Set([
      ...Object.keys(SHIFT_CYCLES),
      ...rows.map((r) => r.crew).filter(Boolean),
    ]),
  ];

  const coverage = dates.flatMap((dateStr) => {
    const suggestions = [];
    crewsToCheck.forEach((crew) => {
      const shift = getShiftForDate(crew, dateStr, baseDate);
      if (shift === 'O') return;

      const crewRows = rows.filter((r) => r.crew === crew);
      const onLeave = crewRows.filter((r) => {
        const c = r.cells.find((x) => x.date === dateStr);
        return c?.onLeave;
      });
      if (!onLeave.length) return;

      const working = crewRows.filter((r) => {
        const c = r.cells.find((x) => x.date === dateStr);
        return c && !c.onLeave && c.shift !== 'O';
      });

      const needed = onLeave.length;
      const shortfall = Math.max(0, needed - working.length);

      if (shortfall > 0) {
        const backups = rows
          .filter((r) => r.crew !== crew)
          .filter((r) => {
            const c = r.cells.find((x) => x.date === dateStr);
            return c && !c.onLeave && c.shift === 'O';
          })
          .sort((a, b) => {
            const ra = SENIORITY_RANK[a.seniority] ?? 99;
            const rb = SENIORITY_RANK[b.seniority] ?? 99;
            if (ra !== rb) return ra - rb;
            return a.name.localeCompare(b.name);
          })
          .slice(0, shortfall + 2);

        suggestions.push({
          date: dateStr,
          crew,
          scheduledShift: shift,
          onLeaveCount: onLeave.length,
          workingCount: working.length,
          shortfall,
          onLeave: onLeave.map((r) => ({ empId: r.empId, name: r.name, role: r.role })),
          suggestedBackups: backups.map((r) => ({
            empId: r.empId,
            name: r.name,
            crew: r.crew,
            role: r.role,
            color: r.color,
            reason: MANAGEMENT_JOB_ROLES.has(r.role)
              ? 'Management / supervisor available (off rotation)'
              : 'Off shift — available by seniority',
          })),
        });
      }
    });
    return suggestions;
  });

  const actionableConflicts = filterGeneralCrewConflicts(conflicts);

  return {
    startDate: fmtDate(start),
    endDate: fmtDate(end),
    baseDate,
    dates,
    rows,
    conflicts: actionableConflicts,
    conflictCount: actionableConflicts.length,
    coverage,
    legend: {
      D: 'Day shift',
      N: 'Night shift',
      O: 'Off',
      L: 'Leave',
    },
  };
}

function userCanAccessOpsTools(dbUser) {
  if (!dbUser) return false;
  if (dbUser.accessRole === 'admin') return true;
  return MANAGEMENT_JOB_ROLES.has(dbUser.role);
}

/** True when a conflict involves General crew (General / general / G). */
function conflictInvolvesGeneralCrew(conflict) {
  const crewField = String(conflict.crew || '');
  if (crewField.includes('/')) {
    if (crewField.split('/').some((c) => isGeneralCrew(c))) return true;
  } else if (isGeneralCrew(crewField)) {
    return true;
  }
  return (conflict.employees || []).some((e) => e.crew && isGeneralCrew(e.crew));
}

/** Drop conflicts that involve General crew — they are not subject to conflict rules. */
function filterGeneralCrewConflicts(conflicts) {
  return (conflicts || []).filter((c) => !conflictInvolvesGeneralCrew(c));
}

/** Keep conflicts on today or future dates only (past dates are no longer actionable). */
function filterActiveConflicts(conflicts, refDate = new Date()) {
  const today = fmtDate(refDate);
  return filterGeneralCrewConflicts(
    (conflicts || []).filter((c) => String(c.date || '').slice(0, 10) >= today)
  );
}

module.exports = {
  SHIFT_CYCLES,
  getShiftForDate,
  overrideMapFromDocs,
  buildRosterSchedule,
  resolveEmployeeShift,
  isEmployeeOnDuty,
  approvedLeaveOnDate,
  leaveOnDate,
  fmtDate,
  parseDateOnly,
  userCanAccessOpsTools,
  filterActiveConflicts,
  filterGeneralCrewConflicts,
  conflictInvolvesGeneralCrew,
  isGeneralCrew,
  MANAGEMENT_JOB_ROLES,
};
