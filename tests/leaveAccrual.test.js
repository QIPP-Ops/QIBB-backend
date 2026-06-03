const {
  daysBetweenInclusive,
  applyCap,
  accrueEmployeeForRange,
} = require('../services/leaveAccrualService');
const { sortRosterEmployees, roleRank } = require('../utils/rosterRowSort');
const {
  isBalanceLeaveType,
  isAnnualLeaveType,
  normalizeLeaveType,
} = require('../constants/leaveTypes');

describe('leaveTypes', () => {
  test('balance types', () => {
    expect(isAnnualLeaveType('Annual Leave')).toBe(true);
    expect(isAnnualLeaveType('Annual Leave - Carry Forward Previous Year')).toBe(true);
    expect(isBalanceLeaveType('Bank Leave')).toBe(true);
    expect(isBalanceLeaveType('Planned')).toBe(false);
  });

  test('normalize legacy SAP labels', () => {
    expect(normalizeLeaveType('Applied on SAP')).toBe('Planned');
    expect(normalizeLeaveType('SAP leave')).toBe('Planned');
  });
});

describe('leaveAccrualService', () => {
  test('daysBetweenInclusive', () => {
    expect(daysBetweenInclusive('2026-01-01', '2026-01-01')).toBe(1);
    expect(daysBetweenInclusive('2026-01-01', '2026-01-03')).toBe(3);
  });

  test('applyCap respects cap only when set', () => {
    expect(applyCap(10, null)).toBe(10);
    expect(applyCap(10, 5)).toBe(5);
  });

  test('accrueEmployeeForRange adds balances', () => {
    const emp = {
      annualLeaveBalance: 0,
      bankLeaveBalance: 0,
      annualLeaveAccrualRate: 0.0575,
      bankLeaveAccrualRate: 0.02,
      annualLeaveCap: null,
      bankLeaveCap: null,
    };
    const result = accrueEmployeeForRange(emp, '2026-01-01', '2026-01-10');
    expect(result.days).toBe(10);
    expect(emp.annualLeaveBalance).toBeCloseTo(0.575, 3);
    expect(emp.bankLeaveBalance).toBeCloseTo(0.2, 3);
  });
});

describe('rosterRowSort', () => {
  test('orders crew General then A-D and role hierarchy', () => {
    const sorted = sortRosterEmployees([
      { name: 'Z', crew: 'B', role: 'Local Operator Group 3-4' },
      { name: 'A', crew: 'General', role: 'Supervisor' },
      { name: 'S', crew: 'A', role: 'Shift in Charge Engineer' },
      { name: 'C', crew: 'A', role: 'CCR Operator Group 1-2' },
    ]);
    expect(sorted[0].crew).toBe('General');
    expect(sorted[1].role).toMatch(/Shift in Charge/i);
    expect(roleRank('Supervisor')).toBe(2);
    expect(sorted.map((e) => e.name)).toEqual(['A', 'S', 'C', 'Z']);
  });
});
