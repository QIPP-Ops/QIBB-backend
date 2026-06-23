const { filterActiveConflicts } = require('../services/shiftScheduleService');

describe('shiftScheduleService.filterActiveConflicts', () => {
  const conflicts = [
    { date: '2026-06-01', message: 'past conflict' },
    { date: '2026-06-22', message: 'today conflict' },
    { date: '2026-06-25', message: 'future conflict' },
  ];

  test('excludes conflicts before the reference date', () => {
    const ref = new Date('2026-06-22T12:00:00');
    const active = filterActiveConflicts(conflicts, ref);
    expect(active.map((c) => c.date)).toEqual(['2026-06-22', '2026-06-25']);
  });

  test('returns empty when all conflicts are in the past', () => {
    const ref = new Date('2026-06-30T12:00:00');
    expect(filterActiveConflicts(conflicts, ref)).toEqual([]);
  });

  test('handles missing conflicts array', () => {
    expect(filterActiveConflicts(null, new Date('2026-06-22'))).toEqual([]);
  });
});
