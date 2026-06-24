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

  test('buildRosterSchedule generates staffing conflicts when minimums not met', () => {
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
    expect(schedule.conflicts[0].conflictType).toBe('staffing');
  });

  test('buildRosterSchedule does not conflict when exactly at CCR minimum (3/3)', () => {
    const employees = [
      {
        empId: 'A1',
        name: 'Alpha One',
        crew: 'A',
        role: 'CCR Operator',
        leaves: [leave('2026-06-05', '2026-06-05')],
      },
      ...Array.from({ length: 3 }, (_, i) => ({
        empId: `A-CCR-${i}`,
        name: `CCR ${i}`,
        crew: 'A',
        role: 'CCR Operator',
        leaves: [],
      })),
    ];
    const schedule = buildRosterSchedule(employees, {
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });
    const onConflictDay = schedule.conflicts.filter((c) => c.date === '2026-06-05');
    expect(onConflictDay).toEqual([]);
    expect(schedule.conflictCount).toBe(0);
  });

  test('buildRosterSchedule does not conflict when exactly at local operator minimum (4/4)', () => {
    const employees = [
      {
        empId: 'A-LOC-0',
        name: 'Local Zero',
        crew: 'A',
        role: 'Local Operator',
        leaves: [leave('2026-06-05', '2026-06-05')],
      },
      ...Array.from({ length: 4 }, (_, i) => ({
        empId: `A-LOC-${i + 1}`,
        name: `Local ${i + 1}`,
        crew: 'A',
        role: 'Local Operator',
        leaves: [],
      })),
    ];
    const schedule = buildRosterSchedule(employees, {
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });
    const onConflictDay = schedule.conflicts.filter((c) => c.date === '2026-06-05');
    expect(onConflictDay).toEqual([]);
  });

  test('buildRosterSchedule does not conflict when different roles on leave and minimums met', () => {
    const employees = [
      {
        empId: 'A-SUP',
        name: 'Moustafa',
        crew: 'A',
        role: 'Supervisor',
        leaves: [leave('2026-06-05', '2026-06-05')],
      },
      {
        empId: 'A-SIC',
        name: 'SIC Backup',
        crew: 'A',
        role: 'Shift in Charge',
        leaves: [],
      },
      {
        empId: 'A-LOC',
        name: 'Khaled',
        crew: 'A',
        role: 'Local Operator',
        leaves: [leave('2026-06-05', '2026-06-05')],
      },
      ...Array.from({ length: 3 }, (_, i) => ({
        empId: `A-CCR-${i}`,
        name: `CCR ${i}`,
        crew: 'A',
        role: 'CCR Operator',
        leaves: [],
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        empId: `A-LOC-${i}`,
        name: `Local ${i}`,
        crew: 'A',
        role: 'Local Operator',
        leaves: [],
      })),
    ];
    const schedule = buildRosterSchedule(employees, {
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });
    const onConflictDay = schedule.conflicts.filter((c) => c.date === '2026-06-05');
    expect(onConflictDay).toEqual([]);
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
