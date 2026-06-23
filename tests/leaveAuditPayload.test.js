const {
  snapshotLeaveBalances,
  buildLeaveAppliedAuditPayload,
  buildLeaveRemovedAuditPayload,
  buildLeaveUpdatedAuditPayload,
} = require('../utils/leaveAuditPayload');

describe('leaveAuditPayload', () => {
  const user = {
    empId: '100001',
    name: 'Ali Ahmed',
    annualLeaveBalance: 10.5,
    bankLeaveBalance: 2,
    compensateDayBalance: 0,
  };

  test('snapshotLeaveBalances captures all balance fields', () => {
    expect(snapshotLeaveBalances(user)).toEqual({
      annual: 10.5,
      bank: 2,
      compensate: 0,
    });
  });

  test('buildLeaveAppliedAuditPayload includes dates, type, and balances', () => {
    const balancesBefore = snapshotLeaveBalances(user);
    const balancesAfter = { annual: 8.5, bank: 2, compensate: 0 };
    const payload = buildLeaveAppliedAuditPayload({
      user,
      actor: { name: 'Planner Admin', email: 'planner@example.com' },
      leaveType: 'Annual Leave',
      dateFrom: '2026-06-12',
      dateTo: '2026-06-18',
      balancesBefore,
      balancesAfter,
    });

    expect(payload).toEqual({
      kind: 'leave_applied',
      leaveType: 'Annual Leave',
      dateFrom: '2026-06-12',
      dateTo: '2026-06-18',
      employeeEmpId: '100001',
      employeeName: 'Ali Ahmed',
      appliedBy: 'Planner Admin',
      balancesBefore,
      balancesAfter,
    });
  });

  test('buildLeaveRemovedAuditPayload uses removedBy', () => {
    const payload = buildLeaveRemovedAuditPayload({
      user,
      actor: { email: 'admin@example.com' },
      leaveType: 'Bank Leave',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-03',
      balancesBefore: { annual: 5, bank: 1, compensate: 0 },
      balancesAfter: { annual: 5, bank: 4, compensate: 0 },
    });

    expect(payload.kind).toBe('leave_removed');
    expect(payload.removedBy).toBe('admin@example.com');
    expect(payload.balancesAfter.bank).toBe(4);
  });

  test('buildLeaveUpdatedAuditPayload includes previous and new values', () => {
    const payload = buildLeaveUpdatedAuditPayload({
      user,
      actor: { name: 'Admin' },
      leaveType: 'Annual Leave',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-05',
      previousType: 'Planned',
      previousDateFrom: '2026-06-12',
      previousDateTo: '2026-06-18',
      balancesBefore: { annual: 10, bank: 2, compensate: 0 },
      balancesAfter: { annual: 8, bank: 2, compensate: 0 },
    });

    expect(payload.kind).toBe('leave_updated');
    expect(payload.previousType).toBe('Planned');
    expect(payload.updatedBy).toBe('Admin');
  });
});
