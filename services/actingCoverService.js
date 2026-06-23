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

function roleSlugFromLabel(roleLabel) {
  const key = resolveAbsentRole(roleLabel);
  if (key) return key;
  return String(roleLabel || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'role';
}

function isCoverEligibleRole(role) {
  const r = String(role || '');
  if (MANAGEMENT_JOB_ROLES.has(r)) return true;
  if (/shift in charge/i.test(r) || /\bsic\b/i.test(r)) return true;
  if (/\bsupervisor\b/i.test(r) && !/shift in charge/i.test(r)) return true;
  return false;
}

function delegationStatus(assignment) {
  return assignment?.status || 'approved';
}

function isApprovedDelegation(assignment) {
  return delegationStatus(assignment) === 'approved';
}

function isPendingDelegation(assignment) {
  return delegationStatus(assignment) === 'pending';
}

function assignmentActiveOnDate(assignment, dateStr) {
  return assignment.startDate <= dateStr && assignment.endDate >= dateStr;
}

function assignmentsForRange(assignments, startStr, endStr) {
  return (assignments || []).filter(
    (a) => a.startDate <= endStr && a.endDate >= startStr
  );
}

function approvedAssignmentsForRange(assignments, startStr, endStr) {
  return assignmentsForRange(assignments, startStr, endStr).filter(isApprovedDelegation);
}

function assignmentRoleLabel(assignment) {
  return assignment.roleAtTime || ROLE_LABELS[assignment.role] || assignment.role;
}

function roleMatchesStaffingRule(roleLabel, ruleMatchFn) {
  if (!ruleMatchFn) return true;
  return ruleMatchFn(roleLabel);
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

function hasApprovedCoverOnDate(assignments, absentEmpId, dateStr) {
  return (assignments || []).some(
    (a) =>
      a.absentEmpId === absentEmpId &&
      isApprovedDelegation(a) &&
      assignmentActiveOnDate(a, dateStr)
  );
}

function findDelegationForEmpDate(assignments, absentEmpId, dateStr) {
  return (assignments || []).find(
    (a) => a.absentEmpId === absentEmpId && assignmentActiveOnDate(a, dateStr)
  );
}

/**
 * Count approved cover employees acting in a staffing role on a given date.
 */
function actingCoverCountForRole(employees, assignments, crew, dateStr, roleKey, ruleMatchFn) {
  const empById = new Map((employees || []).map((e) => [e.empId, e]));
  const matchFn = ruleMatchFn || staffingRuleForActingRole(roleKey);
  let count = 0;
  for (const a of assignments || []) {
    if (!isApprovedDelegation(a)) continue;
    if (!crewsMatch(a.crew, crew)) continue;
    const cover = empById.get(a.coverEmpId);
    if (!cover) continue;
    if (employeeOnLeave(cover, dateStr)) continue;
    const absent = empById.get(a.absentEmpId);
    if (!absent || !employeeOnLeave(absent, dateStr)) continue;
    const roleLabel = assignmentRoleLabel(a);
    if (roleKey && !ruleMatchFn && a.role !== roleKey) continue;
    if (ruleMatchFn && !roleMatchesStaffingRule(roleLabel, matchFn)) continue;
    if (!roleKey && !ruleMatchFn) continue;
    // Same-role cover: delegate is already in headcount — no staffing boost.
    if (ruleMatchFn && ruleMatchFn(cover.role || '')) continue;
    if (!assignmentActiveOnDate(a, dateStr)) continue;
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

function filterConflictsByDelegations(conflicts, assignments) {
  return (conflicts || [])
    .map((c) => {
      const employees = (c.employees || []).map((emp) => {
        const delegation = findDelegationForEmpDate(assignments, emp.empId, c.date);
        return {
          ...emp,
          delegation: delegation
            ? {
                id: String(delegation._id || ''),
                status: delegationStatus(delegation),
                coverEmpId: delegation.coverEmpId,
              }
            : null,
        };
      });
      const uncovered = employees.filter(
        (emp) => !hasApprovedCoverOnDate(assignments, emp.empId, c.date)
      );
      return { ...c, employees, uncoveredCount: uncovered.length };
    })
    .filter((c) => c.uncoveredCount >= 2);
}

function enrichScheduleRows(rows, assignments, employeeById) {
  if (!rows?.length) return rows;

  const actingByCover = new Map();
  const coverByAbsent = new Map();
  const temporaryCoverByCover = new Map();

  (assignments || []).forEach((a) => {
    if (!isApprovedDelegation(a)) return;
    const absent = employeeById.get(a.absentEmpId);
    const cover = employeeById.get(a.coverEmpId);
    if (!cover) return;

    const entry = {
      id: String(a._id || ''),
      role: a.role,
      roleLabel: assignmentRoleLabel(a),
      absentEmpId: a.absentEmpId,
      absentName: absent?.name || a.absentEmpId,
      coverEmpId: a.coverEmpId,
      coverName: cover.name,
      crew: a.crew,
      coverFromCrew: a.coverFromCrew || cover.crew || '',
      startDate: a.startDate,
      endDate: a.endDate,
      notes: a.notes || '',
      status: delegationStatus(a),
      source: a.source || 'leave_request',
      conflictKey: a.conflictKey || '',
      isCrossCrew: Boolean(
        a.coverFromCrew && !crewsMatch(a.coverFromCrew, a.crew)
      ),
    };

    if (!actingByCover.has(a.coverEmpId)) actingByCover.set(a.coverEmpId, []);
    actingByCover.get(a.coverEmpId).push(entry);

    if (!coverByAbsent.has(a.absentEmpId)) coverByAbsent.set(a.absentEmpId, []);
    coverByAbsent.get(a.absentEmpId).push(entry);

    if (!temporaryCoverByCover.has(a.coverEmpId)) temporaryCoverByCover.set(a.coverEmpId, []);
    temporaryCoverByCover.get(a.coverEmpId).push(entry);
  });

  return rows.map((row) => {
    const tempCovers = temporaryCoverByCover.get(row.empId) || [];
    const cells = (row.cells || []).map((cell) => {
      const activeTemp = tempCovers.filter((t) => assignmentActiveOnDate(t, cell.date));
      if (!activeTemp.length) return cell;
      return {
        ...cell,
        temporaryCover: activeTemp.map((t) => ({
          crew: t.crew,
          absentName: t.absentName,
          roleLabel: t.roleLabel,
          isCrossCrew: t.isCrossCrew,
        })),
      };
    });

    return {
      ...row,
      cells,
      actingAssignments: actingByCover.get(row.empId) || [],
      actingCoverFor: coverByAbsent.get(row.empId) || [],
      temporaryCoverAssignments: tempCovers,
      pendingDelegations: (assignments || [])
        .filter(
          (a) =>
            isPendingDelegation(a) &&
            (a.coverEmpId === row.empId || a.absentEmpId === row.empId)
        )
        .map((a) => ({
          id: String(a._id || ''),
          status: delegationStatus(a),
          roleLabel: assignmentRoleLabel(a),
          absentEmpId: a.absentEmpId,
          absentName: employeeById.get(a.absentEmpId)?.name || a.absentEmpId,
          coverEmpId: a.coverEmpId,
          coverName: employeeById.get(a.coverEmpId)?.name || a.coverEmpId,
          startDate: a.startDate,
          endDate: a.endDate,
          notes: a.notes || '',
        })),
    };
  });
}

module.exports = {
  ROLE_LABELS,
  normCrew,
  crewsMatch,
  resolveAbsentRole,
  roleSlugFromLabel,
  isCoverEligibleRole,
  delegationStatus,
  isApprovedDelegation,
  isPendingDelegation,
  assignmentActiveOnDate,
  assignmentsForRange,
  approvedAssignmentsForRange,
  assignmentRoleLabel,
  staffingRuleForActingRole,
  actingCoverCountForRole,
  employeeOnLeave,
  hasApprovedCoverOnDate,
  findDelegationForEmpDate,
  filterConflictsByDelegations,
  enrichScheduleRows,
};
