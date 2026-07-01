const AttendanceRecord = require('../models/AttendanceRecord');

/** Penalty weights for annual attendance KPI (score starts at 100). */
const PENALTY = {
  UNEXCUSED_ABSENT: 8,
  LATE_INCIDENT: 3,
  LATE_MINUTES_PER_30: 1,
  EARLY_INCIDENT: 3,
  EARLY_MINUTES_PER_30: 1,
};

function yearToDateRange(refDate = new Date()) {
  const year = refDate.getFullYear();
  return {
    startDate: `${year}-01-01`,
    endDate: refDate.toISOString().slice(0, 10),
  };
}

/**
 * Summarize attendance records for KPI scoring.
 * Leave-derived absences (approved leave) are tracked separately and do not penalize.
 */
function summarizeAttendanceRecords(records) {
  let unexcusedAbsences = 0;
  let excusedAbsences = 0;
  let presentDays = 0;
  let partialDays = 0;
  let lateIncidents = 0;
  let totalLateMinutes = 0;
  let earlyIncidents = 0;
  let totalEarlyMinutes = 0;

  for (const r of records || []) {
    if (r.derivedFromLeave) {
      excusedAbsences += 1;
      continue;
    }
    if (r.status === 'absent') {
      unexcusedAbsences += 1;
      continue;
    }
    if (r.status === 'present' || r.status === 'partial') {
      presentDays += 1;
      if (r.status === 'partial') partialDays += 1;
    }
    if (r.isLate) {
      lateIncidents += 1;
      totalLateMinutes += Math.max(0, Number(r.lateMinutes) || 0);
    }
    if (r.isLeftEarly) {
      earlyIncidents += 1;
      totalEarlyMinutes += Math.max(0, Number(r.leftEarlyMinutes) || 0);
    }
  }

  return {
    recordCount: (records || []).length,
    unexcusedAbsences,
    excusedAbsences,
    presentDays,
    partialDays,
    lateIncidents,
    totalLateMinutes,
    earlyIncidents,
    totalEarlyMinutes,
  };
}

function calculateAttendanceScore(summary) {
  if (!summary?.recordCount) return 100;

  const penalty =
    summary.unexcusedAbsences * PENALTY.UNEXCUSED_ABSENT +
    summary.lateIncidents * PENALTY.LATE_INCIDENT +
    Math.floor(summary.totalLateMinutes / 30) * PENALTY.LATE_MINUTES_PER_30 +
    summary.earlyIncidents * PENALTY.EARLY_INCIDENT +
    Math.floor(summary.totalEarlyMinutes / 30) * PENALTY.EARLY_MINUTES_PER_30;

  return Math.max(0, Math.round(100 - penalty));
}

async function loadAttendanceRecordsForYear(empId, refDate = new Date()) {
  const { startDate, endDate } = yearToDateRange(refDate);
  return AttendanceRecord.find({
    empId: String(empId).trim(),
    date: { $gte: startDate, $lte: endDate },
  }).lean();
}

async function loadAttendanceRecordsForEmployees(empIds, refDate = new Date()) {
  const { startDate, endDate } = yearToDateRange(refDate);
  const ids = [...new Set(empIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) return new Map();

  const records = await AttendanceRecord.find({
    empId: { $in: ids },
    date: { $gte: startDate, $lte: endDate },
  }).lean();

  const byEmpId = new Map();
  for (const r of records) {
    if (!byEmpId.has(r.empId)) byEmpId.set(r.empId, []);
    byEmpId.get(r.empId).push(r);
  }
  return byEmpId;
}

async function getAttendanceKpiForEmployee(empId, refDate = new Date()) {
  const records = await loadAttendanceRecordsForYear(empId, refDate);
  const summary = summarizeAttendanceRecords(records);
  const attendanceScore = calculateAttendanceScore(summary);
  const { startDate, endDate } = yearToDateRange(refDate);

  return {
    attendanceScore,
    attendanceSummary: {
      ...summary,
      yearStart: startDate,
      yearEnd: endDate,
    },
  };
}

module.exports = {
  PENALTY,
  yearToDateRange,
  summarizeAttendanceRecords,
  calculateAttendanceScore,
  loadAttendanceRecordsForYear,
  loadAttendanceRecordsForEmployees,
  getAttendanceKpiForEmployee,
};
