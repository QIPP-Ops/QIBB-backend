const AdminUser = require('../models/AdminUser');
const ActingAssignment = require('../models/ActingAssignment');
const { fmtDate, parseDateOnly } = require('./shiftScheduleService');
const {
  actingCoverCountForRole,
  approvedAssignmentsForRange,
  hasApprovedCoverOnDate,
} = require('./actingCoverService');
const { sendAdminBulkEmail } = require('./adminEmailService');
const { notifyLeaveConflict } = require('./notificationService');
const {
  emailCallout,
  emailDetailTable,
} = require('./emailHtmlHelpers');
const {
  STAFFING_RULES,
  approvedLeavesOnly,
  employeeOnApprovedLeave,
  staffingCountsForDate,
  calendarDatesInclusive,
  isBelowMinimum,
} = require('./staffingRulesService');
const { groupStaffingAlertsByDateRange } = require('../utils/staffingAlertGrouping');
const {
  buildGroupBreakdown,
  formatStaffingNotifyMessage,
  formatStaffingEmailHtml,
} = require('../utils/staffingConflictDetail');
const { getShiftForDate } = require('./shiftScheduleService');
const { buildCoverSuggestions } = require('./coverSuggestionsService');
const { isGeneralCrew } = require('../utils/rosterRowSort');

function leaveRangesOverlap(aStart, aEnd, bStart, bEnd) {
  const s1 = parseDateOnly(aStart);
  const e1 = parseDateOnly(aEnd);
  const s2 = parseDateOnly(bStart);
  const e2 = parseDateOnly(bEnd);
  return s1 <= e2 && s2 <= e1;
}

function datesInLeaveRange(start, end) {
  return calendarDatesInclusive(start, end);
}

/** @deprecated Crew overlap conflicts replaced by role-based staffing rules. */
function findSameCrewRoleOverlaps(employees, subjectEmployee, newLeave, actingAssignments = []) {
  return [];
}

function findStaffingShortfalls(employees, subjectEmployee, newLeave, actingAssignments = [], options = {}) {
  if (isGeneralCrew(subjectEmployee.crew)) return [];

  const crew = subjectEmployee.crew;
  const dates = calendarDatesInclusive(newLeave.start, newLeave.end);
  const { baseDate = '2026-01-01' } = options;
  const dailyAlerts = [];

  for (const dateStr of dates) {
    const counts = staffingCountsForDate(employees, crew, dateStr, actingAssignments, {
      approvedLeaveOnly: false,
    });
    const below = counts.filter(isBelowMinimum);
    if (!below.length) continue;
    const shift = getShiftForDate(crew, dateStr, baseDate);
    const groups = buildGroupBreakdown(employees, crew, dateStr, below, {
      approvedLeaveOnly: false,
    });
    dailyAlerts.push({
      crew,
      date: dateStr,
      shift,
      below,
      groups,
      groupLabels: groups.map((g) => g.groupLabel),
    });
  }
  return groupStaffingAlertsByDateRange(dailyAlerts);
}

async function emailStaffingBelowMinimum(crew, dateStart, dateEnd, alert, employees = [], actingAssignments = [], baseDate = '2026-01-01') {
  const dateLabel = dateStart === dateEnd ? dateStart : `${dateStart} – ${dateEnd}`;
  const below = alert.below || alert;
  const groups = alert.groups || [];
  const shift = alert.shift;
  const suggestedNames = [];
  const seen = new Set();

  for (const roleRow of below) {
    const { candidates } = buildCoverSuggestions(employees, {
      date: dateStart,
      crew,
      role: roleRow.label,
      shift: shift || getShiftForDate(crew, dateStart, baseDate),
      baseDate,
      actingAssignments,
    });
    for (const candidate of candidates) {
      if (seen.has(candidate.empId)) continue;
      seen.add(candidate.empId);
      if (candidate.eligibleForRequestedShift) suggestedNames.push(candidate.name);
    }
  }

  const body = `
    ${emailCallout('<p>Minimum staffing is not met after this leave request.</p>', 'warning')}
    ${formatStaffingEmailHtml(
      { crew, shift, dateLabel, below, groups },
      suggestedNames.slice(0, 6)
    )}
  `;
  const shiftPart = shift ? ` ${shift === 'D' ? 'Day' : shift === 'N' ? 'Night' : shift}` : '';
  await sendAdminBulkEmail({
    subject: `Staffing Below Minimum — Shift ${crew}${shiftPart} ${dateLabel}`,
    bodyHtml: body,
  });
}

function findStaffingShortfallsApprovedOnly(
  employees,
  subjectEmployee,
  newLeave,
  actingAssignments = [],
  options = {}
) {
  if (isGeneralCrew(subjectEmployee.crew)) return [];

  const crew = subjectEmployee.crew;
  const dates = calendarDatesInclusive(newLeave.start, newLeave.end);
  const { baseDate = '2026-01-01' } = options;
  const dailyAlerts = [];

  for (const dateStr of dates) {
    const counts = staffingCountsForDate(employees, crew, dateStr, actingAssignments, {
      approvedLeaveOnly: true,
    });
    const below = counts.filter(isBelowMinimum);
    if (!below.length) continue;
    const shift = getShiftForDate(crew, dateStr, baseDate);
    const groups = buildGroupBreakdown(employees, crew, dateStr, below, {
      approvedLeaveOnly: true,
    });
    dailyAlerts.push({
      crew,
      date: dateStr,
      shift,
      below,
      groups,
      groupLabels: groups.map((g) => g.groupLabel),
    });
  }
  return groupStaffingAlertsByDateRange(dailyAlerts);
}

/**
 * Simulate approving leave and check whether STAFFING_RULES would be breached.
 */
async function willBreachStaffingRules(empId, startDate, endDate, leaveId = null) {
  const subject = await AdminUser.findOne({ empId: String(empId).trim() }).lean();
  if (!subject) return { breached: false, alerts: [] };
  if (isGeneralCrew(subject.crew)) return { breached: false, alerts: [] };

  const { loadStaffingRosterEmployees } = require('../utils/rosterEmployeeLoad');
  const employees = await loadStaffingRosterEmployees();
  const simulatedLeave = {
    start: startDate,
    end: endDate,
    status: 'approved',
    _id: leaveId || 'simulated',
  };

  const subjectSim = {
    ...subject,
    leaves: [
      ...approvedLeavesOnly(subject).filter((lv) => !leaveId || String(lv._id) !== String(leaveId)),
      simulatedLeave,
    ],
  };

  const allEmployees = employees.map((e) => {
    if (e.empId !== subject.empId) {
      return { ...e, leaves: approvedLeavesOnly(e) };
    }
    return subjectSim;
  });

  const actingAssignments = await ActingAssignment.find({ status: 'approved' }).lean();
  const config = await require('../models/AdminConfig').findOne().lean();
  const baseDate = config?.shiftCycleBaseDate || '2026-01-01';
  const alerts = findStaffingShortfallsApprovedOnly(
    allEmployees,
    subjectSim,
    simulatedLeave,
    actingAssignments,
    { baseDate }
  );

  return { breached: alerts.length > 0, alerts };
}

/**
 * Run staffing checks after a leave record is saved (role-based understaffing only).
 */
async function processLeaveSaved(subjectEmployee, newLeave, allEmployees, actingAssignments = [], options = {}) {
  const { baseDate = '2026-01-01' } = options;
  const approved = approvedAssignmentsForRange(
    actingAssignments,
    fmtDate(parseDateOnly(newLeave.start)),
    fmtDate(parseDateOnly(newLeave.end))
  );

  const staffingAlerts = findStaffingShortfalls(
    allEmployees,
    subjectEmployee,
    newLeave,
    approved,
    { baseDate }
  );
  for (const alert of staffingAlerts) {
    const dateEnd = alert.dateEnd || alert.date;
    try {
      await notifyLeaveConflict(formatStaffingNotifyMessage(alert));
    } catch (err) {
      console.warn('[leave-conflict] staffing in-app notify failed:', err.message);
    }
    await emailStaffingBelowMinimum(
      alert.crew,
      alert.date,
      dateEnd,
      alert,
      allEmployees,
      approved,
      baseDate
    );
  }

  return { overlapCount: 0, staffingAlertCount: staffingAlerts.length };
}

module.exports = {
  STAFFING_RULES,
  calendarDatesInclusive,
  findSameCrewRoleOverlaps,
  findStaffingShortfalls,
  willBreachStaffingRules,
  processLeaveSaved,
  employeeOnApprovedLeave,
  staffingCountsForDate,
};
