const { MANAGEMENT_JOB_ROLES } = require('./shiftScheduleService');

const ROLE_LABELS = {
  shift_in_charge: 'Shift in Charge',
  supervisor: 'Supervisor',
};

function normCrew(crew) {
  const c = String(crew || '').trim().toUpperCase();
  if (!c) return '';
  if (c === 'GENERAL' || c === 'G') return 'GENERAL';
  if (/^[A-F]$/.test(c)) return c;
  const letter = c.replace(/^CREW\s*/i, '').trim();
  if (/^[A-F]$/.test(letter)) return letter;
  return c;
}

function crewsMatch(a, b) {
  return normCrew(a) === normCrew(b);
}

function resolveAbsentRole(role) {
  const r = String(role || '');
  if (/shift in charge/i.test(r) || /\bsic\b/i.test(r)) return 'shift_in_charge';
  if (/\bsupervisor\b/i.test(r) && !/shift in charge/i.test(r) && !/\bsic\b/i.test(r)) {
    return 'supervisor';
  }
  return null;
}

function isCoverEligibleRole(role) {
  const r = String(role || '');
  if (MANAGEMENT_JOB_ROLES.has(r)) return true;
  if (/shift in charge/i.test(r) || /\bsic\b/i.test(r)) return true;
  if (/\bsupervisor\b/i.test(r) && !/shift in charge/i.test(r)) return true;
  return false;
}

function assignmentActiveOnDate(assignment, dateStr) {
  return assignment.startDate <= dateStr && assignment.endDate >= dateStr;
}

function assignmentsForRange(assignments, startStr, endStr) {
  return (assignments || []).filter(
    (a) => a.startDate <= endStr && a.endDate >= startStr
  );
}

function staffingRuleForActingRole(roleKey) {
  if (roleKey === 'shift_in_charge') {
    return (r) => /shift in charge/i.test(r || '');
  }
  if (roleKey === 'supervisor') {
    return (r) => /\bsupervisor\b/i.test(r || '') && !/shift in charge/i.test(r || '');
  }
  return () => false;
}

/**
 * Count cover employees acting in a staffing role on a given date.
 */
function actingCoverCountForRole(employees, assignments, crew, dateStr, roleKey) {
  const empById = new Map((employees || []).map((e) => [e.empId, e]));
  let count = 0;
  for (const a of assignments || []) {
    if (!crewsMatch(a.crew, crew)) continue;
    if (a.role !== roleKey) continue;
    if (!assignmentActiveOnDate(a, dateStr)) continue;
    const cover = empById.get(a.coverEmpId);
    if (!cover) continue;
    if (employeeOnLeave(cover, dateStr)) continue;
    count += 1;
  }
  return count;
}

function employeeOnLeave(employee, dateStr) {
  return (employee.leaves || []).some((lv) => {
    const start = String(lv.start || '').slice(0, 10);
    const end = String(lv.end || lv.start || '').slice(0, 10);
    return dateStr >= start && dateStr <= end;
  });
}

function enrichScheduleRows(rows, assignments, employeeById) {
  if (!rows?.length || !assignments?.length) return rows;

  const actingByCover = new Map();
  const coverByAbsent = new Map();

  assignments.forEach((a) => {
    const absent = employeeById.get(a.absentEmpId);
    const cover = employeeById.get(a.coverEmpId);
    if (!cover) return;

    const entry = {
      id: String(a._id || ''),
      role: a.role,
      roleLabel: ROLE_LABELS[a.role] || a.role,
      absentEmpId: a.absentEmpId,
      absentName: absent?.name || a.absentEmpId,
      coverEmpId: a.coverEmpId,
      coverName: cover.name,
      startDate: a.startDate,
      endDate: a.endDate,
      notes: a.notes || '',
    };

    if (!actingByCover.has(a.coverEmpId)) actingByCover.set(a.coverEmpId, []);
    actingByCover.get(a.coverEmpId).push(entry);

    if (!coverByAbsent.has(a.absentEmpId)) coverByAbsent.set(a.absentEmpId, []);
    coverByAbsent.get(a.absentEmpId).push(entry);
  });

  return rows.map((row) => ({
    ...row,
    actingAssignments: actingByCover.get(row.empId) || [],
    actingCoverFor: coverByAbsent.get(row.empId) || [],
  }));
}

module.exports = {
  ROLE_LABELS,
  normCrew,
  crewsMatch,
  resolveAbsentRole,
  isCoverEligibleRole,
  assignmentActiveOnDate,
  assignmentsForRange,
  staffingRuleForActingRole,
  actingCoverCountForRole,
  employeeOnLeave,
  enrichScheduleRows,
};
