const {
  filterActiveConflicts,
  filterGeneralCrewConflicts,
  buildRosterSchedule,
  conflictInvolvesGeneralCrew,
} = require('../services/shiftScheduleService');
const { isGeneralCrew } = require('../utils/rosterRowSort');

describe('shiftScheduleService.filterActiveConflicts', () => {
  const conflicts = [
    { date: '2026-06-01', message: 'past conflict', crew: 'A', employees: [] },
    { date: '2026-06-22', message: 'today conflict', crew: 'A', employees: [] },
    { date: '2026-06-25', message: 'future conflict', crew: 'A', employees: [] },
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

  test('excludes General crew conflicts from active list', () => {
    const ref = new Date('2026-06-22T12:00:00');
    const mixed = [
      ...conflicts,
      { date: '2026-06-23', message: 'general conflict', crew: 'General', employees: [] },
      { date: '2026-06-24', message: 'g crew', crew: 'G', employees: [] },
    ];
    const active = filterActiveConflicts(mixed, ref);
    expect(active.every((c) => !isGeneralCrew(c.crew))).toBe(true);
    expect(active.map((c) => c.date)).toEqual(['2026-06-22', '2026-06-25']);
  });
});

describe('shiftScheduleService General crew exclusion', () => {
  const leave = (start, end) => ({ start, end, type: 'Annual Leave' });

  test('isGeneralCrew normalizes General, general, and G', () => {
    expect(isGeneralCrew('General')).toBe(true);
    expect(isGeneralCrew('general')).toBe(true);
    expect(isGeneralCrew('G')).toBe(true);
    expect(isGeneralCrew('A')).toBe(false);
  });

  test('conflictInvolvesGeneralCrew detects cross-crew and employee crew', () => {
    expect(
      conflictInvolvesGeneralCrew({ crew: 'A/General', employees: [{ crew: 'A' }] })
    ).toBe(true);
    expect(
      conflictInvolvesGeneralCrew({ crew: 'A/B', employees: [{ crew: 'General' }] })
    ).toBe(true);
    expect(
      conflictInvolvesGeneralCrew({ crew: 'A', employees: [{ crew: 'A' }] })
    ).toBe(false);
  });

  test('buildRosterSchedule does not generate conflicts for General crew', () => {
    const employees = [
      {
        empId: 'G1',
        name: 'General One',
        crew: 'General',
        role: 'Chemist',
        leaves: [leave('2026-06-01', '2026-06-05')],
      },
      {
        empId: 'G2',
        name: 'General Two',
        crew: 'G',
        role: 'Chemist',
        leaves: [leave('2026-06-01', '2026-06-05')],
      },
    ];
    const schedule = buildRosterSchedule(employees, {
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });
    expect(schedule.rows).toHaveLength(2);
    expect(schedule.conflicts).toEqual([]);
    expect(schedule.conflictCount).toBe(0);
  });

  test('buildRosterSchedule still generates conflicts for shifting crews', () => {
    const employees = [
      {
        empId: 'A1',
        name: 'Alpha One',
        crew: 'A',
        role: 'CCR Operator',
        leaves: [leave('2026-06-05', '2026-06-05')],
      },
      {
        empId: 'A2',
        name: 'Alpha Two',
        crew: 'A',
        role: 'CCR Operator',
        leaves: [leave('2026-06-05', '2026-06-05')],
      },
    ];
    const schedule = buildRosterSchedule(employees, {
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });
    expect(schedule.conflicts.length).toBeGreaterThan(0);
  });

  test('filterGeneralCrewConflicts removes mixed-crew conflicts involving General', () => {
    const conflicts = [
      { crew: 'A', employees: [{ crew: 'A' }] },
      { crew: 'A/General', employees: [{ crew: 'A' }, { crew: 'General' }] },
    ];
    expect(filterGeneralCrewConflicts(conflicts)).toEqual([
      { crew: 'A', employees: [{ crew: 'A' }] },
    ]);
  });
});
