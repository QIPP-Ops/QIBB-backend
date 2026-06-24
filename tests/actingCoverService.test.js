const {
  enrichScheduleRows,
  filterConflictsByDelegations,
  assignmentActiveOnDate,
} = require('../services/actingCoverService');

describe('actingCoverService conflict cover', () => {
  const employeeById = new Map([
    ['E1', { empId: 'E1', name: 'Alice', crew: 'A', role: 'CCR Operator', leaves: [] }],
    ['E2', { empId: 'E2', name: 'Bob', crew: 'B', role: 'CCR Operator', leaves: [] }],
  ]);

  test('enrichScheduleRows marks temporary cover on delegate cells for period only', () => {
    const rows = [
      {
        empId: 'E2',
        name: 'Bob',
        crew: 'B',
        role: 'CCR Operator',
        cells: [
          { date: '2026-06-01', shift: 'O', onLeave: false, display: 'O' },
          { date: '2026-06-02', shift: 'O', onLeave: false, display: 'O' },
          { date: '2026-06-05', shift: 'D', onLeave: false, display: 'D' },
        ],
      },
    ];
    const assignments = [
      {
        _id: 'd1',
        absentEmpId: 'E1',
        coverEmpId: 'E2',
        role: 'ccr_operator',
        roleAtTime: 'CCR Operator',
        crew: 'A',
        coverFromCrew: 'B',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        status: 'approved',
        source: 'conflict_resolution',
        conflictKey: 'high|A|E1,E2|2026-06-01',
      },
    ];

    const enriched = enrichScheduleRows(rows, assignments, employeeById);
    expect(enriched[0].cells[0].temporaryCover).toEqual([
      expect.objectContaining({ crew: 'A', absentName: 'Alice', isCrossCrew: true }),
    ]);
    expect(enriched[0].cells[1].temporaryCover).toBeDefined();
    expect(enriched[0].cells[2].temporaryCover).toBeUndefined();
    expect(enriched[0].temporaryCoverAssignments).toHaveLength(1);
  });

  test('assignmentActiveOnDate respects end date', () => {
    const a = { startDate: '2026-06-01', endDate: '2026-06-02' };
    expect(assignmentActiveOnDate(a, '2026-06-01')).toBe(true);
    expect(assignmentActiveOnDate(a, '2026-06-02')).toBe(true);
    expect(assignmentActiveOnDate(a, '2026-06-03')).toBe(false);
  });

  test('filterConflictsByDelegations keeps conflict when two uncovered', () => {
    const conflicts = [
      {
        date: '2026-06-01',
        crew: 'A',
        employees: [{ empId: 'E1' }, { empId: 'E2' }],
      },
    ];
    expect(filterConflictsByDelegations(conflicts, [])).toHaveLength(1);
  });

  test('filterConflictsByDelegations clears staffing conflict when one of two on leave is covered', () => {
    const conflicts = [
      {
        date: '2026-06-05',
        crew: 'A',
        severity: 'high',
        conflictType: 'staffing',
        message: 'Understaffed (A): CCR Operator 2/3',
        employees: [{ empId: 'E1', name: 'Alice' }, { empId: 'E2', name: 'Bob' }],
        below: [{ label: 'CCR Operator', shortfall: 1, available: 2, min: 3 }],
      },
    ];
    const assignments = [
      {
        _id: 'd1',
        absentEmpId: 'E1',
        coverEmpId: 'E3',
        crew: 'A',
        coverFromCrew: 'B',
        startDate: '2026-06-01',
        endDate: '2026-06-10',
        status: 'approved',
        source: 'conflict_resolution',
      },
    ];
    expect(filterConflictsByDelegations(conflicts, assignments)).toHaveLength(0);
  });

  test('actingCoverCountForRole counts cross-crew same-role cover', () => {
    const { actingCoverCountForRole } = require('../services/actingCoverService');
    const employees = [
      {
        empId: 'E1',
        crew: 'A',
        role: 'CCR Operator',
        leaves: [{ start: '2026-06-05', end: '2026-06-05' }],
      },
      {
        empId: 'E3',
        crew: 'B',
        role: 'CCR Operator',
        leaves: [],
      },
    ];
    const assignments = [
      {
        absentEmpId: 'E1',
        coverEmpId: 'E3',
        role: 'ccr_operator',
        roleAtTime: 'CCR Operator',
        crew: 'A',
        coverFromCrew: 'B',
        startDate: '2026-06-05',
        endDate: '2026-06-05',
        status: 'approved',
      },
    ];
    const count = actingCoverCountForRole(
      employees,
      assignments,
      'A',
      '2026-06-05',
      null,
      (role) => /ccr operator/i.test(role || '')
    );
    expect(count).toBe(1);
  });
});
