const { getShiftForDate } = require('../services/shiftCycleConflict');
const {
  getCycleRequiredEndDate,
  validateCycleLeaveOffDays,
} = require('../services/leaveCycleValidationService');

const BASE = '2026-01-01';

describe('getCycleRequiredEndDate', () => {
  test('crew B D-D-N-N starting 2026-01-01 ends off block on 2026-01-08', () => {
    expect(getCycleRequiredEndDate('B', '2026-01-01', BASE)).toBe('2026-01-08');
    expect(getShiftForDate('B', '2026-01-05', BASE)).toBe('O');
    expect(getShiftForDate('B', '2026-01-08', BASE)).toBe('O');
  });
});

describe('validateCycleLeaveOffDays', () => {
  test('single-day leave on a work day is allowed', () => {
    const result = validateCycleLeaveOffDays({
      crew: 'B',
      startDate: '2026-01-01',
      endDate: '2026-01-01',
      baseDate: BASE,
    });
    expect(result.ok).toBe(true);
  });

  test('cycle leave without 4 off days is rejected', () => {
    const result = validateCycleLeaveOffDays({
      crew: 'B',
      startDate: '2026-01-01',
      endDate: '2026-01-04',
      baseDate: BASE,
    });
    expect(result.ok).toBe(false);
    expect(result.requiredEndDate).toBe('2026-01-08');
    expect(result.message).toContain('2026-01-08');
    expect(result.message).toMatch(/4 off days/i);
  });

  test('cycle leave through all 4 off days is allowed', () => {
    const result = validateCycleLeaveOffDays({
      crew: 'B',
      startDate: '2026-01-01',
      endDate: '2026-01-08',
      baseDate: BASE,
    });
    expect(result.ok).toBe(true);
  });

  test('multi-day off-only leave does not trigger cycle rule', () => {
    const result = validateCycleLeaveOffDays({
      crew: 'B',
      startDate: '2026-01-05',
      endDate: '2026-01-07',
      baseDate: BASE,
    });
    expect(result.ok).toBe(true);
  });

  test('General crew multi-day leave is exempt', () => {
    const result = validateCycleLeaveOffDays({
      crew: 'General',
      startDate: '2026-01-01',
      endDate: '2026-01-10',
      baseDate: BASE,
    });
    expect(result.ok).toBe(true);
  });
});
