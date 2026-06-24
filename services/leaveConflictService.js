const AdminUser = require('../models/AdminUser');
const ActingAssignment = require('../models/ActingAssignment');
const { leaveOnDate, fmtDate, parseDateOnly } = require('./shiftScheduleService');
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

const STAFFING_RULES = [
  { label: 'Shift in Charge', min: 1, match: (role) => /shift in charge/i.test(role || '') },
  {
    label: 'Supervisor',
    min: 1,
    match: (role) => /\bsupervisor\b/i.test(role || '') && !/shift in charge/i.test(role || ''),
  },
  { label: 'CCR Operator', min: 3, match: (role) => /ccr operator/i.test(role || '') },
  { label: 'Local Operator', min: 4, match: (role) => /local operator/i.test(role || '') },
  { label: 'Chemist', min: 1, match: (role) => /chemist/i.test(role || '') },
];

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

function leaveRangesOverlap(aStart, aEnd, bStart, bEnd) {
  const s1 = parseDateOnly(aStart);
  const e1 = parseDateOnly(aEnd);
  const s2 = parseDateOnly(bStart);
  const e2 = parseDateOnly(bEnd);
  return s1 <= e2 && s2 <= e1;
}

function employeeOnLeave(employee, dateStr) {
  return (employee.leaves || []).some((lv) => leaveOnDate(lv, dateStr));
}

function datesInLeaveRange(start, end) {
  return calendarDatesInclusive(start, end);
}

function findSameCrewRoleOverlaps(employees, subjectEmployee, newLeave, actingAssignments = []) {
  const overlaps = [];
  const crew = subjectEmployee.crew;
  const role = subjectEmployee.role;
  const leaveDates = datesInLeaveRange(newLeave.start, newLeave.end);
  const subjectUncovered = leaveDates.some(
    (dateStr) => !hasApprovedCoverOnDate(actingAssignments, subjectEmployee.empId, dateStr)
  );
  if (!subjectUncovered) return overlaps;

  for (const other of employees) {
    if (other.empId === subjectEmployee.empId) continue;
    if (other.crew !== crew || other.role !== role) continue;

    for (const lv of other.leaves || []) {
      if (!leaveRangesOverlap(newLeave.start, newLeave.end, lv.start, lv.end)) continue;
      const overlapDates = datesInLeaveRange(
        new Date(Math.max(parseDateOnly(newLeave.start), parseDateOnly(lv.start))),
        new Date(Math.min(parseDateOnly(newLeave.end), parseDateOnly(lv.end)))
      );
      const otherUncovered = overlapDates.some(
        (dateStr) => !hasApprovedCoverOnDate(actingAssignments, other.empId, dateStr)
      );
      if (!otherUncovered) continue;
      overlaps.push({
        crew,
        role,
        otherName: other.name,
        otherEmpId: other.empId,
        leaveStart: fmtDate(parseDateOnly(lv.start)),
        leaveEnd: fmtDate(parseDateOnly(lv.end)),
      });
    }
  }
  return overlaps;
}

function staffingCountsForDate(employees, crew, dateStr, actingAssignments = []) {
  const roleKeyByLabel = {
    'Shift in Charge': 'shift_in_charge',
    Supervisor: 'supervisor',
  };
  const approved = approvedAssignmentsForRange(actingAssignments, dateStr, dateStr);
  const counts = STAFFING_RULES.map((rule) => {
    const roster = employees.filter((e) => e.crew === crew && rule.match(e.role));
    const available = roster.filter((e) => !employeeOnLeave(e, dateStr));
    const roleKey = roleKeyByLabel[rule.label];
    const actingBoost = actingCoverCountForRole(
      employees,
      approved,
      crew,
      dateStr,
      roleKey,
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

function findStaffingShortfalls(employees, subjectEmployee, newLeave, actingAssignments = []) {
  const crew = subjectEmployee.crew;
  const dates = calendarDatesInclusive(newLeave.start, newLeave.end);
  const alerts = [];

  for (const dateStr of dates) {
    const counts = staffingCountsForDate(employees, crew, dateStr, actingAssignments);
    const below = counts.filter((c) => c.shortfall > 0);
    if (!below.length) continue;
    alerts.push({ crew, date: dateStr, below });
  }
  return alerts;
}

async function emailLeaveConflict(crew, role, subjectEmployee, overlaps) {
  const names = [...new Set(overlaps.map((o) => o.otherName))].join(', ');
  const body = `
    ${emailCallout('<p>A new leave request may conflict with existing leave for the same crew and role.</p>', 'warning')}
    ${emailDetailTable([
      { label: 'Crew', value: crew },
      { label: 'Role', value: role },
      { label: 'Employee', value: `${subjectEmployee.name} (${subjectEmployee.empId})` },
      { label: 'Overlapping leave', value: names },
    ])}
    <p>Review the leave planner to approve, adjust, or reassign coverage.</p>
  `;
  await sendAdminBulkEmail({
    subject: `Leave Conflict — ${crew} ${role}`,
    bodyHtml: body,
  });
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

function staffingCountsForDateApprovedOnly(employees, crew, dateStr, actingAssignments = []) {
  const roleKeyByLabel = {
    'Shift in Charge': 'shift_in_charge',
    Supervisor: 'supervisor',
  };
  const approved = approvedAssignmentsForRange(actingAssignments, dateStr, dateStr);
  const counts = STAFFING_RULES.map((rule) => {
    const roster = employees.filter((e) => e.crew === crew && rule.match(e.role));
    const available = roster.filter((e) => !employeeOnApprovedLeave(e, dateStr));
    const roleKey = roleKeyByLabel[rule.label];
    const actingBoost = actingCoverCountForRole(
      employees,
      approved,
      crew,
      dateStr,
      roleKey,
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

function findStaffingShortfallsApprovedOnly(employees, subjectEmployee, newLeave, actingAssignments = []) {
  const crew = subjectEmployee.crew;
  const dates = calendarDatesInclusive(newLeave.start, newLeave.end);
  const alerts = [];

  for (const dateStr of dates) {
    const counts = staffingCountsForDateApprovedOnly(employees, crew, dateStr, actingAssignments);
    const below = counts.filter((c) => c.shortfall > 0);
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

  const employees = await AdminUser.find({ isApproved: true }).lean();
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
 * Run conflict + staffing checks after a leave record is saved.
 */
async function processLeaveSaved(subjectEmployee, newLeave, allEmployees, actingAssignments = []) {
  const approved = approvedAssignmentsForRange(
    actingAssignments,
    fmtDate(parseDateOnly(newLeave.start)),
    fmtDate(parseDateOnly(newLeave.end))
  );
  const overlaps = findSameCrewRoleOverlaps(allEmployees, subjectEmployee, newLeave, approved);
  if (overlaps.length) {
    const msg = `${subjectEmployee.name} (${subjectEmployee.crew}, ${subjectEmployee.role}) overlaps with ${overlaps[0].otherName} on leave`;
    try {
      await notifyLeaveConflict(msg);
    } catch (err) {
      console.warn('[leave-conflict] in-app notify failed:', err.message);
    }
    await emailLeaveConflict(subjectEmployee.crew, subjectEmployee.role, subjectEmployee, overlaps);
  }

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

  return { overlapCount: overlaps.length, staffingAlertCount: staffingAlerts.length };
}

module.exports = {
  STAFFING_RULES,
  calendarDatesInclusive,
  findSameCrewRoleOverlaps,
  findStaffingShortfalls,
  willBreachStaffingRules,
  processLeaveSaved,
};
