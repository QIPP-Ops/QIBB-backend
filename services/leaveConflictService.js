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
  emailInfoList,
} = require('./emailHtmlHelpers');
const {
  STAFFING_RULES,
  approvedLeavesOnly,
  employeeOnApprovedLeave,
  staffingCountsForDate,
  calendarDatesInclusive,
  isBelowMinimum,
} = require('./staffingRulesService');
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

function findStaffingShortfalls(employees, subjectEmployee, newLeave, actingAssignments = []) {
  if (isGeneralCrew(subjectEmployee.crew)) return [];

  const crew = subjectEmployee.crew;
  const dates = calendarDatesInclusive(newLeave.start, newLeave.end);
  const alerts = [];

  for (const dateStr of dates) {
    const counts = staffingCountsForDate(employees, crew, dateStr, actingAssignments, {
      approvedLeaveOnly: false,
    });
    const below = counts.filter(isBelowMinimum);
    if (!below.length) continue;
    alerts.push({ crew, date: dateStr, below });
  }
  return alerts;
}

async function emailStaffingBelowMinimum(crew, date, below) {
  const lines = below.map((b) => `${b.label}: ${b.available} available (minimum ${b.min})`);
  const body = `
    ${emailCallout('<p>Minimum staffing is not met after this leave request.</p>', 'warning')}
    ${emailDetailTable([
      { label: 'Crew', value: crew },
      { label: 'Date', value: date },
    ])}
    ${emailInfoList(lines)}
    <p>Review roster coverage and consider backup assignments.</p>
  `;
  await sendAdminBulkEmail({
    subject: `Staffing Below Minimum — ${crew} ${date}`,
    bodyHtml: body,
  });
}

function findStaffingShortfallsApprovedOnly(employees, subjectEmployee, newLeave, actingAssignments = []) {
  if (isGeneralCrew(subjectEmployee.crew)) return [];

  const crew = subjectEmployee.crew;
  const dates = calendarDatesInclusive(newLeave.start, newLeave.end);
  const alerts = [];

  for (const dateStr of dates) {
    const counts = staffingCountsForDate(employees, crew, dateStr, actingAssignments, {
      approvedLeaveOnly: true,
    });
    const below = counts.filter(isBelowMinimum);
    if (!below.length) continue;
    alerts.push({ crew, date: dateStr, below });
  }
  return alerts;
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
  const alerts = findStaffingShortfallsApprovedOnly(
    allEmployees,
    subjectSim,
    simulatedLeave,
    actingAssignments
  );

  return { breached: alerts.length > 0, alerts };
}

/**
 * Run staffing checks after a leave record is saved (role-based understaffing only).
 */
async function processLeaveSaved(subjectEmployee, newLeave, allEmployees, actingAssignments = []) {
  const approved = approvedAssignmentsForRange(
    actingAssignments,
    fmtDate(parseDateOnly(newLeave.start)),
    fmtDate(parseDateOnly(newLeave.end))
  );

  const staffingAlerts = findStaffingShortfalls(allEmployees, subjectEmployee, newLeave, approved);
  for (const alert of staffingAlerts) {
    try {
      await notifyLeaveConflict(
        `Staffing below minimum for crew ${alert.crew} on ${alert.date}: ${alert.below.map((b) => b.label).join(', ')}`
      );
    } catch (err) {
      console.warn('[leave-conflict] staffing in-app notify failed:', err.message);
    }
    await emailStaffingBelowMinimum(alert.crew, alert.date, alert.below);
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
