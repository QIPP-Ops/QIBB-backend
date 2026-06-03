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
  const d = parseDateOnly(dateStr);
  const s = parseDateOnly(leave.start);
  const e = parseDateOnly(leave.end);
  return d >= s && d <= e;
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
  return {
    date: dateStr,
    shift,
    rotationShift,
    isOverride,
    onLeave: !!leave,
    leaveType: leave?.type || null,
    display: leave ? 'L' : shift,
    onDuty: !leave && (shift === 'D' || shift === 'N'),
  };
}

function isEmployeeOnDuty(employee, dateStr, options = {}) {
  return resolveEmployeeShift(employee, dateStr, options).onDuty;
}

const { normalizeLeaveType, isAnnualLeaveType } = require('../constants/leaveTypes');
const { sortRosterEmployees } = require('../utils/rosterRowSort');

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
      return {
        date: dateStr,
        shift,
        rotationShift,
        isOverride,
        onLeave: !!leave,
        leaveType: leave ? style.leaveType || leave.type : null,
        isAnnualLeave: !!leave && style.isAnnualLeave,
        isBankLeave: !!leave && style.isBankLeave,
        isPlannedLeave: !!leave && style.isPlannedLeave,
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
      cells,
    };
  });

  const conflicts = [];
  const byCrewDate = {};

  rows.forEach((row) => {
    row.cells.forEach((cell) => {
      if (!cell.onLeave || cell.shift === 'O') return;
      const key = `${row.crew}|${cell.date}`;
      if (!byCrewDate[key]) byCrewDate[key] = [];
      byCrewDate[key].push({ empId: row.empId, name: row.name, role: row.role, color: row.color });
    });
  });

  Object.entries(byCrewDate).forEach(([key, people]) => {
    if (people.length < 2) return;
    const [crew, date] = key.split('|');
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        conflicts.push({
          date,
          crew,
          severity: 'high',
          message: `${people[i].name} and ${people[j].name} both on leave while crew ${crew} is scheduled to work`,
          employees: [people[i], people[j]],
        });
      }
    }
  });

  // Cross-crew: same role coverage on a day (e.g. two CCR on leave same day)
  const byRoleDate = {};
  rows.forEach((row) => {
    row.cells.forEach((cell) => {
      if (!cell.onLeave) return;
      const key = `${row.role}|${cell.date}`;
      if (!byRoleDate[key]) byRoleDate[key] = [];
      byRoleDate[key].push({ empId: row.empId, name: row.name, crew: row.crew, color: row.color });
    });
  });
  Object.entries(byRoleDate).forEach(([key, people]) => {
    if (people.length < 2) return;
    const [role, date] = key.split('|');
    conflicts.push({
      date,
      crew: people.map((p) => p.crew).join('/'),
      severity: 'medium',
      message: `${people.length} ${role} staff on leave on ${date}: ${people.map((p) => p.name).join(', ')}`,
      employees: people,
    });
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

  return {
    startDate: fmtDate(start),
    endDate: fmtDate(end),
    baseDate,
    dates,
    rows,
    conflicts,
    conflictCount: conflicts.length,
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

module.exports = {
  SHIFT_CYCLES,
  getShiftForDate,
  overrideMapFromDocs,
  buildRosterSchedule,
  resolveEmployeeShift,
  isEmployeeOnDuty,
  leaveOnDate,
  fmtDate,
  parseDateOnly,
  userCanAccessOpsTools,
  MANAGEMENT_JOB_ROLES,
};
