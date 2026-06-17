const { leaveOnDate, fmtDate, parseDateOnly } = require('./shiftScheduleService');
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

function findSameCrewRoleOverlaps(employees, subjectEmployee, newLeave) {
  const overlaps = [];
  const crew = subjectEmployee.crew;
  const role = subjectEmployee.role;

  for (const other of employees) {
    if (other.empId === subjectEmployee.empId) continue;
    if (other.crew !== crew || other.role !== role) continue;

    for (const lv of other.leaves || []) {
      if (leaveRangesOverlap(newLeave.start, newLeave.end, lv.start, lv.end)) {
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
  }
  return overlaps;
}

function staffingCountsForDate(employees, crew, dateStr) {
  const counts = STAFFING_RULES.map((rule) => {
    const roster = employees.filter((e) => e.crew === crew && rule.match(e.role));
    const available = roster.filter((e) => !employeeOnLeave(e, dateStr));
    return {
      label: rule.label,
      min: rule.min,
      available: available.length,
      rosterSize: roster.length,
      shortfall: Math.max(0, rule.min - available.length),
    };
  });
  return counts.filter((c) => c.rosterSize > 0);
}

function findStaffingShortfalls(employees, subjectEmployee, newLeave) {
  const crew = subjectEmployee.crew;
  const dates = calendarDatesInclusive(newLeave.start, newLeave.end);
  const alerts = [];

  for (const dateStr of dates) {
    const counts = staffingCountsForDate(employees, crew, dateStr);
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

/**
 * Run conflict + staffing checks after a leave record is saved.
 */
async function processLeaveSaved(subjectEmployee, newLeave, allEmployees) {
  const overlaps = findSameCrewRoleOverlaps(allEmployees, subjectEmployee, newLeave);
  if (overlaps.length) {
    const msg = `${subjectEmployee.name} (${subjectEmployee.crew}, ${subjectEmployee.role}) overlaps with ${overlaps[0].otherName} on leave`;
    try {
      await notifyLeaveConflict(msg);
    } catch (err) {
      console.warn('[leave-conflict] in-app notify failed:', err.message);
    }
    await emailLeaveConflict(subjectEmployee.crew, subjectEmployee.role, subjectEmployee, overlaps);
  }

  const staffingAlerts = findStaffingShortfalls(allEmployees, subjectEmployee, newLeave);
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
  processLeaveSaved,
};
