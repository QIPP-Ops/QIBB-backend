const { redactLeaveBalancesForClient } = require('./leaveBalanceAccess');

function filterRosterRowsForViewer(rows, req) {
  if (!Array.isArray(rows)) return [];
  const user = req?.user;
  if (!user) return [];
  return rows.map((row) => redactLeaveBalancesForClient(row, req));
}

function filterScheduleForViewer(schedule, req) {
  if (!schedule) return schedule;
  const user = req?.user;
  if (!user) {
    return { ...schedule, rows: [], conflicts: [], conflictCount: 0 };
  }

  return {
    ...schedule,
    rows: (schedule.rows || []).map((row) => redactLeaveBalancesForClient(row, req)),
  };
}

module.exports = {
  filterRosterRowsForViewer,
  filterScheduleForViewer,
};
