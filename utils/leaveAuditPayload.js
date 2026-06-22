function snapshotLeaveBalances(user) {
  return {
    annual: user.annualLeaveBalance ?? 0,
    bank: user.bankLeaveBalance ?? 0,
    compensate: user.compensateDayBalance ?? 0,
  };
}

function buildLeaveAppliedAuditPayload({
  user,
  actor,
  leaveType,
  dateFrom,
  dateTo,
  balancesBefore,
  balancesAfter,
}) {
  return {
    kind: 'leave_applied',
    leaveType,
    dateFrom,
    dateTo,
    employeeEmpId: user.empId,
    employeeName: user.name,
    appliedBy: actor?.name || actor?.email || 'System',
    balancesBefore,
    balancesAfter,
  };
}

function buildLeaveRemovedAuditPayload({
  user,
  actor,
  leaveType,
  dateFrom,
  dateTo,
  balancesBefore,
  balancesAfter,
}) {
  return {
    kind: 'leave_removed',
    leaveType,
    dateFrom,
    dateTo,
    employeeEmpId: user.empId,
    employeeName: user.name,
    removedBy: actor?.name || actor?.email || 'System',
    balancesBefore,
    balancesAfter,
  };
}

module.exports = {
  snapshotLeaveBalances,
  buildLeaveAppliedAuditPayload,
  buildLeaveRemovedAuditPayload,
};
