const {
  canViewLeaveBalance,
  canEditCompensateBalance,
  redactLeaveBalancesForClient,
} = require('../utils/leaveBalanceAccess');

describe('leaveBalanceAccess', () => {
  const row = {
    empId: 'E2',
    crew: 'A',
    annualLeaveBalance: 12,
    bankLeaveBalance: 5,
    compensateDayBalance: 1,
  };

  it('allows crew admins to see same-crew balances only', () => {
    const req = { user: { role: 'admin', accessRole: 'admin', empId: 'E9', crew: 'A' } };
    expect(canViewLeaveBalance(req, 'E2', 'A')).toBe(true);
    expect(canViewLeaveBalance(req, 'E2', 'B')).toBe(false);
    expect(redactLeaveBalancesForClient(row, req).annualLeaveBalance).toBe(12);
    const redactedOtherCrew = redactLeaveBalancesForClient({ ...row, crew: 'B' }, req);
    expect(redactedOtherCrew.annualLeaveBalance).toBeUndefined();
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

  describe('canEditCompensateBalance', () => {
    const target = { empId: 'E2', crew: 'A' };

    it('allows super admin for any crew', () => {
      const req = { user: { email: 'admin@acwaops.com', accessRole: 'admin', crew: 'B' } };
      expect(canEditCompensateBalance(req, target)).toBe(true);
    });

    it('allows admin for same crew only', () => {
      const sameCrew = { user: { accessRole: 'admin', empId: 'E9', crew: 'A' } };
      const otherCrew = { user: { accessRole: 'admin', empId: 'E9', crew: 'B' } };
      expect(canEditCompensateBalance(sameCrew, target)).toBe(true);
      expect(canEditCompensateBalance(otherCrew, target)).toBe(false);
    });

    it('matches crew labels after normalization', () => {
      const req = { user: { accessRole: 'admin', empId: 'E9', crew: 'Crew A' } };
      expect(canEditCompensateBalance(req, { empId: 'E2', crew: 'A' })).toBe(true);
      expect(canEditCompensateBalance(req, { empId: 'E2', crew: 'Crew B' })).toBe(false);
    });

    it('uses actor crew from database when provided', () => {
      const req = { user: { accessRole: 'admin', empId: 'E9', crew: 'B' } };
      const actor = { crew: 'A' };
      expect(canEditCompensateBalance(req, target, actor)).toBe(true);
      expect(canEditCompensateBalance(req, { empId: 'E2', crew: 'B' }, actor)).toBe(false);
    });

    it('allows management for same crew only', () => {
      const req = { user: { accessRole: 'management', empId: 'E9', crew: 'A' } };
      expect(canEditCompensateBalance(req, target)).toBe(true);
      expect(canEditCompensateBalance({ user: { accessRole: 'management', crew: 'B' } }, target)).toBe(false);
    });

    it('denies viewers', () => {
      const req = { user: { accessRole: 'viewer', empId: 'E2', crew: 'A' } };
      expect(canEditCompensateBalance(req, target)).toBe(false);
    });
  });
});
