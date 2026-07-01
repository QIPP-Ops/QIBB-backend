const { normCrew } = require('./rosterRowSort');

function pad(n) {
  return String(n).padStart(2, '0');
}

function crewsMatch(a, b) {
  return normCrew(a) === normCrew(b);
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

module.exports = {
  STAFFING_RULES,
  pad,
  crewsMatch,
  fmtDate,
  parseDateOnly,
  leaveOnDate,
  approvedLeavesOnly,
  employeeOnApprovedLeave,
  employeeOnAnyLeave,
};
