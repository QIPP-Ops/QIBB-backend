const { isSuperAdmin } = require('../middleware/superAdmin');
const { canViewTimesheetRow } = require('./rosterLeavePermissions');
const { redactLeaveBalancesForClient } = require('./leaveBalanceAccess');

function rowAccessTarget(row) {
  return { empId: row.empId, crew: row.crew || '' };
}

function filterRosterRowsForViewer(rows, req) {
  if (!Array.isArray(rows)) return [];
  const user = req?.user;
  if (!user) return [];

  let filtered = rows;
  if (!isSuperAdmin({ user })) {
    filtered = rows.filter((row) => canViewTimesheetRow(user, rowAccessTarget(row)));
  }
  return filtered.map((row) => redactLeaveBalancesForClient(row, req));
}

function filterConflictForViewer(conflict, visibleEmpIds) {
  if (!conflict?.employees?.length) return null;
  const employees = conflict.employees.filter((e) => visibleEmpIds.has(e.empId));
  if (!employees.length) return null;
  return { ...conflict, employees };
}

function filterScheduleForViewer(schedule, req) {
  if (!schedule) return schedule;
  const user = req?.user;
  if (!user) {
    return { ...schedule, rows: [], conflicts: [], conflictCount: 0 };
  }

  if (isSuperAdmin({ user })) {
    return {
      ...schedule,
      rows: (schedule.rows || []).map((row) => redactLeaveBalancesForClient(row, req)),
    };
  }

  const visibleRows = (schedule.rows || []).filter((row) =>
    canViewTimesheetRow(user, rowAccessTarget(row))
  );
  const visibleEmpIds = new Set(visibleRows.map((r) => r.empId));
  const conflicts = (schedule.conflicts || [])
    .map((c) => filterConflictForViewer(c, visibleEmpIds))
    .filter(Boolean);

  return {
    ...schedule,
    rows: visibleRows.map((row) => redactLeaveBalancesForClient(row, req)),
    conflicts,
    conflictCount: conflicts.length,
  };
}

module.exports = {
  filterRosterRowsForViewer,
  filterScheduleForViewer,
};
