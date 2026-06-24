const { MANAGEMENT_JOB_ROLES } = require('./shiftScheduleService');
const { normCrew } = require('../utils/rosterRowSort');

const ROLE_LABELS = {
  shift_in_charge: 'Shift in Charge',
  supervisor: 'Supervisor',
};

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
    // Same-role cover from the covered crew is already in roster headcount.
    if (crewsMatch(cover.crew, crew) && ruleMatchFn && ruleMatchFn(cover.role || '')) continue;
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

function enrichConflictEmployees(conflict, assignments) {
  const employees = (conflict.employees || []).map((emp) => {
    const delegation = findDelegationForEmpDate(assignments, emp.empId, conflict.date);
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
    (emp) => !hasApprovedCoverOnDate(assignments, emp.empId, conflict.date)
  );
  return { ...conflict, employees, uncoveredCount: uncovered.length };
}

function primaryCrewFromConflict(conflict) {
  const raw = String(conflict?.crew || '').split('/')[0] || conflict?.crew;
  return normCrew(raw);
}

function datesForStaffingCheck(conflict) {
  if (Array.isArray(conflict?.dates) && conflict.dates.length) {
    return [...conflict.dates].sort();
  }
  return conflict?.date ? [conflict.date] : [];
}

function refreshStaffingBelow(conflict, assignments, employees) {
  const { staffingCountsForDate, isBelowMinimum } = require('./staffingRulesService');
  const crew = primaryCrewFromConflict(conflict);
  const byLabel = new Map();

  for (const dateStr of datesForStaffingCheck(conflict)) {
    const approved = approvedAssignmentsForRange(assignments, dateStr, dateStr);
    const counts = staffingCountsForDate(employees, crew, dateStr, approved, {
      approvedLeaveOnly: true,
    });
    for (const row of counts.filter(isBelowMinimum)) {
      const prev = byLabel.get(row.label);
      if (!prev || (row.shortfall ?? 0) > (prev.shortfall ?? 0)) {
        byLabel.set(row.label, { ...row });
      }
    }
  }

  return { ...conflict, below: [...byLabel.values()] };
}

function staffingConflictStillActive(conflict, assignments, employees) {
  if (!employees?.length) {
    return false;
  }
  const dates = datesForStaffingCheck(conflict);
  if (!dates.length) return false;

  const { staffingCountsForDate, hasStaffingShortfall } = require('./staffingRulesService');
  const crew = primaryCrewFromConflict(conflict);

  return dates.some((dateStr) => {
    const approved = approvedAssignmentsForRange(assignments, dateStr, dateStr);
    const counts = staffingCountsForDate(employees, crew, dateStr, approved, {
      approvedLeaveOnly: true,
    });
    return hasStaffingShortfall(counts);
  });
}

function filterConflictsByDelegations(conflicts, assignments, employees = null) {
  return (conflicts || [])
    .map((c) => enrichConflictEmployees(c, assignments))
    .filter((c) => {
      if (c.conflictType === 'staffing') {
        return staffingConflictStillActive(c, assignments, employees);
      }
      return c.uncoveredCount >= 2;
    })
    .map((c) => {
      if (c.conflictType === 'staffing' && employees?.length) {
        return refreshStaffingBelow(c, assignments, employees);
      }
      return c;
    })
    .filter((c) => {
      if (c.conflictType !== 'staffing') return true;
      const { isBelowMinimum } = require('./staffingRulesService');
      return (c.below || []).some(isBelowMinimum);
    });
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
    const coversForAbsent = coverByAbsent.get(row.empId) || [];
    const cells = (row.cells || []).map((cell) => {
      let next = { ...cell };

      const activeCoverForAbsent = coversForAbsent.filter((t) =>
        assignmentActiveOnDate(t, cell.date)
      );
      if (activeCoverForAbsent.length) {
        const primaryCover = activeCoverForAbsent[0];
        next = {
          ...next,
          coveredBy: primaryCover.coverName,
          coveredByEmpId: primaryCover.coverEmpId,
          coveredByAssignments: activeCoverForAbsent.map((t) => ({
            coverName: t.coverName,
            coverEmpId: t.coverEmpId,
            roleLabel: t.roleLabel,
            crew: t.crew,
            coverFromCrew: t.coverFromCrew,
            isCrossCrew: t.isCrossCrew,
            startDate: t.startDate,
            endDate: t.endDate,
          })),
        };
      }

      const activeTemp = tempCovers.filter((t) => assignmentActiveOnDate(t, cell.date));
      if (activeTemp.length) {
        const primary = activeTemp[0];
        next = {
          ...next,
          coveringFor: primary.absentName,
          coveringRole: primary.roleLabel,
          temporaryCover: activeTemp.map((t) => ({
            crew: t.crew,
            absentName: t.absentName,
            absentEmpId: t.absentEmpId,
            roleLabel: t.roleLabel,
            isCrossCrew: t.isCrossCrew,
            coveringFor: t.absentName,
            coveringRole: t.roleLabel,
            coverName: t.coverName,
            coverEmpId: t.coverEmpId,
          })),
        };
      }

      return next;
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
  staffingConflictStillActive,
  filterConflictsByDelegations,
  enrichScheduleRows,
};
