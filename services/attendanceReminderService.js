const AdminConfig = require('../models/AdminConfig');
const AttendanceRecord = require('../models/AttendanceRecord');
const ShiftOverride = require('../models/ShiftOverride');
const {
  loadStaffingRosterEmployees,
  visibleRosterEmployees,
} = require('../utils/rosterEmployeeLoad');
const { crewsMatch } = require('./actingCoverService');
const { normCrew } = require('../utils/rosterRowSort');
const {
  overrideMapFromDocs,
  resolveEmployeeShift,
  isGeneralCrew,
  fmtDate,
} = require('./shiftScheduleService');

function todayStr() {
  return fmtDate(new Date());
}

/** General crew works Mon–Thu only (Fri/Sat/Sun are non-working). Ops crews run 24/7. */
function isWorkingDayForCrew(crew, dateStr) {
  const key = normCrew(crew);
  if (!key) return false;
  if (isGeneralCrew(key)) {
    const day = new Date(`${dateStr}T12:00:00`).getDay();
    return day >= 1 && day <= 4;
  }
  return true;
}

function crewHasActiveShiftToday(crew, dateStr, { baseDate, overrideMap }) {
  const key = normCrew(crew);
  if (!key) return false;
  if (isGeneralCrew(key)) {
    return isWorkingDayForCrew(key, dateStr);
  }
  const shift = resolveEmployeeShift({ crew: key, empId: '', leaves: [] }, dateStr, {
    baseDate,
    overrideMap,
  }).shift;
  return shift === 'D' || shift === 'N';
}

async function loadScheduleContext() {
  const config = await AdminConfig.findOne().lean();
  const baseDate = config?.shiftCycleBaseDate || '2026-01-01';
  const overrides = overrideMapFromDocs(await ShiftOverride.find({}).lean());
  return { baseDate, overrideMap: overrides };
}

function employeesForCrew(allEmployees, crew) {
  return visibleRosterEmployees(allEmployees).filter((emp) => crewsMatch(emp.crew, crew));
}

function employeesNeedingAttendance(crewMembers, dateStr, scheduleCtx) {
  return crewMembers.filter((emp) => {
    const slot = resolveEmployeeShift(emp, dateStr, scheduleCtx);
    if (slot.onLeave && slot.leaveStatus === 'approved') return false;
    if (isGeneralCrew(emp.crew)) {
      return isWorkingDayForCrew(emp.crew, dateStr);
    }
    return slot.onDuty;
  });
}

/**
 * Returns reminder status for a crew on a given date.
 * Incomplete = on-duty / expected roster members without a saved attendance record.
 */
async function getAttendanceReminderStatus({ crew, date = todayStr() }) {
  const dateStr = String(date).trim().slice(0, 10);
  const crewKey = normCrew(crew);

  if (!crewKey) {
    return {
      show: false,
      date: dateStr,
      crew: '',
      isWorkingDay: false,
      expectedCount: 0,
      savedCount: 0,
      missingCount: 0,
    };
  }

  const scheduleCtx = await loadScheduleContext();
  const isWorkingDay =
    isWorkingDayForCrew(crewKey, dateStr) && crewHasActiveShiftToday(crewKey, dateStr, scheduleCtx);

  if (!isWorkingDay) {
    return {
      show: false,
      date: dateStr,
      crew: crewKey,
      isWorkingDay: false,
      expectedCount: 0,
      savedCount: 0,
      missingCount: 0,
    };
  }

  const allEmployees = await loadStaffingRosterEmployees();
  const crewMembers = employeesForCrew(allEmployees, crewKey);
  const expected = employeesNeedingAttendance(crewMembers, dateStr, scheduleCtx);

  if (!expected.length) {
    return {
      show: false,
      date: dateStr,
      crew: crewKey,
      isWorkingDay: true,
      expectedCount: 0,
      savedCount: 0,
      missingCount: 0,
    };
  }

  const records = await AttendanceRecord.find({ crew: crewKey, date: dateStr })
    .select('empId')
    .lean();
  const savedEmpIds = new Set(records.map((r) => r.empId));
  const missing = expected.filter((emp) => emp.empId && !savedEmpIds.has(emp.empId));

  return {
    show: missing.length > 0,
    date: dateStr,
    crew: crewKey,
    isWorkingDay: true,
    expectedCount: expected.length,
    savedCount: expected.length - missing.length,
    missingCount: missing.length,
  };
}

module.exports = {
  todayStr,
  isWorkingDayForCrew,
  getAttendanceReminderStatus,
};
