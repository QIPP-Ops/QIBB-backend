const {
  normalizeCompensateLeaveType,
  isCompensateLeaveType,
  LEAVE_TYPES,
} = require('../constants/leaveTypes');

describe('compensate leave types', () => {
  test('legacy Compensate Leave Balance normalizes to Compensate Off', () => {
    expect(normalizeCompensateLeaveType('Compensate Leave Balance')).toBe('Compensate Off');
    expect(isCompensateLeaveType('Compensate Leave Balance')).toBe(true);
  });

  test('LEAVE_TYPES excludes legacy compensate balance label', () => {
    expect(LEAVE_TYPES).not.toContain('Compensate Leave Balance');
    expect(LEAVE_TYPES).toContain('Compensate Off');
  });
});
