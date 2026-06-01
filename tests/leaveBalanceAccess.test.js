const { canViewLeaveBalance, redactLeaveBalancesForClient } = require('../utils/leaveBalanceAccess');

describe('leaveBalanceAccess', () => {
  const row = {
    empId: 'E2',
    crew: 'A',
    annualLeaveBalance: 12,
    bankLeaveBalance: 5,
    compensateDayBalance: 1,
  };

  it('allows admins to see all balances', () => {
    const req = { user: { role: 'admin', accessRole: 'admin', empId: 'E9' } };
    expect(canViewLeaveBalance(req, 'E2', 'B')).toBe(true);
    expect(redactLeaveBalancesForClient(row, req)).toEqual(row);
  });

  it('redacts other employees for viewers', () => {
    const req = { user: { role: 'user', accessRole: 'viewer', empId: 'E1', crew: 'A' } };
    expect(canViewLeaveBalance(req, 'E2', 'A')).toBe(false);
    const redacted = redactLeaveBalancesForClient(row, req);
    expect(redacted.annualLeaveBalance).toBeUndefined();
    expect(redacted.bankLeaveBalance).toBeUndefined();
    expect(redacted.compensateDayBalance).toBeUndefined();
    expect(redacted.empId).toBe('E2');
  });

  it('keeps own row for viewers', () => {
    const req = { user: { role: 'user', accessRole: 'viewer', empId: 'E2' } };
    expect(redactLeaveBalancesForClient(row, req)).toEqual(row);
  });

  it('allows management to see same-crew balances', () => {
    const req = { user: { accessRole: 'management', empId: 'E9', crew: 'A' } };
    expect(canViewLeaveBalance(req, 'E2', 'A')).toBe(true);
    expect(canViewLeaveBalance(req, 'E3', 'B')).toBe(false);
  });
});
