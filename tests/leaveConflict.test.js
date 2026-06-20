const {
  STAFFING_RULES,
  calendarDatesInclusive,
  findSameCrewRoleOverlaps,
  findStaffingShortfalls,
} = require('../services/leaveConflictService');

describe('leaveConflictService', () => {
  const crewA = [
    {
      empId: 'E1',
      name: 'Alice',
      crew: 'A',
      role: 'CCR Operator',
      leaves: [{ start: new Date('2026-06-01'), end: new Date('2026-06-03') }],
    },
    {
      empId: 'E2',
      name: 'Bob',
      crew: 'A',
      role: 'CCR Operator',
      leaves: [],
    },
    {
      empId: 'E3',
      name: 'Carol',
      crew: 'A',
      role: 'CCR Operator',
      leaves: [],
    },
    {
      empId: 'E4',
      name: 'Dan',
      crew: 'A',
      role: 'CCR Operator',
      leaves: [],
    },
  ];

  test('STAFFING_RULES includes CCR minimum 3', () => {
    const ccr = STAFFING_RULES.find((r) => r.label === 'CCR Operator');
    expect(ccr.min).toBe(3);
  });

  test('calendarDatesInclusive spans leave range', () => {
    const dates = calendarDatesInclusive('2026-06-01', '2026-06-03');
    expect(dates).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
  });

  test('findSameCrewRoleOverlaps detects overlapping same-role leave', () => {
    const subject = {
      empId: 'E2',
      name: 'Bob',
      crew: 'A',
      role: 'CCR Operator',
      leaves: [],
    };
    const newLeave = { start: new Date('2026-06-02'), end: new Date('2026-06-04') };
    const overlaps = findSameCrewRoleOverlaps(crewA, subject, newLeave);
    expect(overlaps.length).toBeGreaterThan(0);
    expect(overlaps[0].otherName).toBe('Alice');
  });

  test('findStaffingShortfalls when too many CCR on leave', () => {
    const subject = {
      empId: 'E2',
      name: 'Bob',
      crew: 'A',
      role: 'CCR Operator',
      leaves: [{ start: new Date('2026-06-05'), end: new Date('2026-06-05') }],
    };
    const employees = crewA.map((e) =>
      e.empId === 'E2'
        ? { ...e, leaves: [{ start: new Date('2026-06-05'), end: new Date('2026-06-05') }] }
        : {
            ...e,
            leaves:
              e.empId === 'E1'
                ? [{ start: new Date('2026-06-05'), end: new Date('2026-06-05') }]
                : e.empId === 'E3'
                  ? [{ start: new Date('2026-06-05'), end: new Date('2026-06-05') }]
                  : [],
          }
    );
    const alerts = findStaffingShortfalls(employees, subject, {
      start: new Date('2026-06-05'),
      end: new Date('2026-06-05'),
    });
    const ccrShort = alerts.some((a) => a.below.some((b) => b.label === 'CCR Operator'));
    expect(ccrShort).toBe(true);
  });

  test('approved delegation skips overlap when absent employee is covered', () => {
    const subject = {
      empId: 'E2',
      name: 'Bob',
      crew: 'A',
      role: 'CCR Operator',
      leaves: [],
    };
    const newLeave = { start: new Date('2026-06-02'), end: new Date('2026-06-04') };
    const employees = crewA.map((e) =>
      e.empId === 'E1'
        ? { ...e, leaves: [{ start: new Date('2026-06-01'), end: new Date('2026-06-03') }] }
        : e
    );
    const withoutCover = findSameCrewRoleOverlaps(employees, subject, newLeave, []);
    expect(withoutCover.length).toBeGreaterThan(0);

    const approvedDelegation = [
      {
        absentEmpId: 'E1',
        coverEmpId: 'E4',
        role: 'ccr_operator',
        roleAtTime: 'CCR Operator',
        crew: 'A',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
        status: 'approved',
      },
    ];
    const withCover = findSameCrewRoleOverlaps(employees, subject, newLeave, approvedDelegation);
    expect(withCover.length).toBe(0);
  });

  test('pending delegation does not remove staffing shortfall', () => {
    const subject = {
      empId: 'E2',
      name: 'Bob',
      crew: 'A',
      role: 'CCR Operator',
      leaves: [{ start: new Date('2026-06-05'), end: new Date('2026-06-05') }],
    };
    const employees = crewA.map((e) =>
      e.empId === 'E2'
        ? { ...e, leaves: [{ start: new Date('2026-06-05'), end: new Date('2026-06-05') }] }
        : {
            ...e,
            leaves:
              e.empId === 'E1'
                ? [{ start: new Date('2026-06-05'), end: new Date('2026-06-05') }]
                : e.empId === 'E3'
                  ? [{ start: new Date('2026-06-05'), end: new Date('2026-06-05') }]
                  : [],
          }
    );
    const pendingDelegation = [
      {
        absentEmpId: 'E1',
        coverEmpId: 'E4',
        role: 'ccr_operator',
        roleAtTime: 'CCR Operator',
        crew: 'A',
        startDate: '2026-06-05',
        endDate: '2026-06-05',
        status: 'pending',
      },
    ];
    const alerts = findStaffingShortfalls(
      employees,
      subject,
      { start: new Date('2026-06-05'), end: new Date('2026-06-05') },
      pendingDelegation
    );
    const ccrShort = alerts.some((a) => a.below.some((b) => b.label === 'CCR Operator'));
    expect(ccrShort).toBe(true);
  });
});
