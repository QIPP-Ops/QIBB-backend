const {
  PENALTY,
  summarizeAttendanceRecords,
  calculateAttendanceScore,
  yearToDateRange,
} = require('../services/attendanceKpiService');

describe('attendanceKpiService', () => {
  test('yearToDateRange returns calendar year start through today', () => {
    const range = yearToDateRange(new Date('2026-07-15T12:00:00Z'));
    expect(range.startDate).toBe('2026-01-01');
    expect(range.endDate).toBe('2026-07-15');
  });

  test('no records yields perfect attendance score', () => {
    const summary = summarizeAttendanceRecords([]);
    expect(calculateAttendanceScore(summary)).toBe(100);
  });

  test('leave-derived absences do not penalize score', () => {
    const summary = summarizeAttendanceRecords([
      { status: 'absent', derivedFromLeave: true },
      { status: 'absent', derivedFromLeave: true },
    ]);
    expect(summary.excusedAbsences).toBe(2);
    expect(summary.unexcusedAbsences).toBe(0);
    expect(calculateAttendanceScore(summary)).toBe(100);
  });

  test('unexcused absences reduce score', () => {
    const summary = summarizeAttendanceRecords([
      { status: 'absent', derivedFromLeave: false },
    ]);
    expect(calculateAttendanceScore(summary)).toBe(100 - PENALTY.UNEXCUSED_ABSENT);
  });

  test('late and early incidents reduce score', () => {
    const summary = summarizeAttendanceRecords([
      {
        status: 'partial',
        derivedFromLeave: false,
        isLate: true,
        lateMinutes: 45,
        isLeftEarly: true,
        leftEarlyMinutes: 30,
      },
    ]);
    const expected =
      100 -
      PENALTY.LATE_INCIDENT -
      PENALTY.LATE_MINUTES_PER_30 -
      PENALTY.EARLY_INCIDENT -
      PENALTY.EARLY_MINUTES_PER_30;
    expect(calculateAttendanceScore(summary)).toBe(expected);
  });

  test('score cannot go below zero', () => {
    const records = Array.from({ length: 20 }, () => ({
      status: 'absent',
      derivedFromLeave: false,
    }));
    const summary = summarizeAttendanceRecords(records);
    expect(calculateAttendanceScore(summary)).toBe(0);
  });
});
