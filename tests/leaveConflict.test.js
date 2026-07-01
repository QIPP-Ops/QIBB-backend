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

  test('STAFFING_RULES uses combined leader minimum', () => {
    const leader = STAFFING_RULES.find((r) => r.label === 'Leader');
    expect(leader?.min).toBe(1);
    expect(leader?.match('Supervisor')).toBe(true);
    expect(leader?.match('Shift in Charge Engineer')).toBe(true);
  });

  test('calendarDatesInclusive spans leave range', () => {
    const dates = calendarDatesInclusive('2026-06-01', '2026-06-03');
    expect(dates).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
  });

  test('findSameCrewRoleOverlaps no longer flags same-role overlap (staffing rules only)', () => {
    const subject = {
      empId: 'E2',
      name: 'Bob',
      crew: 'A',
      role: 'CCR Operator',
      leaves: [],
    };
    const newLeave = { start: new Date('2026-06-02'), end: new Date('2026-06-04') };
    const overlaps = findSameCrewRoleOverlaps(crewA, subject, newLeave);
    expect(overlaps.length).toBe(0);
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
    expect(alerts).toHaveLength(1);
    expect(alerts[0].date).toBe('2026-06-05');
    expect(alerts[0].dateEnd).toBe('2026-06-05');
  });

  test('findStaffingShortfalls groups consecutive shortfall days into one period', () => {
    const subject = {
      empId: 'E2',
      name: 'Bob',
      crew: 'A',
      role: 'CCR Operator',
      leaves: [],
    };
    const employees = crewA.map((e) => {
      if (e.empId === 'E2') {
        return {
          ...e,
          leaves: [{ start: new Date('2026-06-06'), end: new Date('2026-06-07') }],
        };
      }
      if (e.empId === 'E1') {
        return {
          ...e,
          leaves: [{ start: new Date('2026-06-06'), end: new Date('2026-06-07') }],
        };
      }
      if (e.empId === 'E3') {
        return {
          ...e,
          leaves: [{ start: new Date('2026-06-06'), end: new Date('2026-06-07') }],
        };
      }
      return e;
    });
    const alerts = findStaffingShortfalls(employees, subject, {
      start: new Date('2026-06-06'),
      end: new Date('2026-06-07'),
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].date).toBe('2026-06-06');
    expect(alerts[0].dateEnd).toBe('2026-06-07');
    expect(alerts[0].dateLabel).toBe('2026-06-06 – 2026-06-07');
  });

  test('findStaffingShortfalls skips General crew entirely', () => {
    const subject = {
      empId: 'GEN1',
      name: 'Mohammad Abdullah AlGarni',
      crew: 'General',
      role: 'CCR Operator',
      leaves: [],
    };
    const employees = [
      subject,
      { empId: 'GEN2', crew: 'General', role: 'CCR Operator', leaves: [] },
    ];
    const alerts = findStaffingShortfalls(employees, subject, {
      start: new Date('2026-06-11'),
      end: new Date('2026-06-11'),
    });
    expect(alerts).toEqual([]);
  });

  test('staffingCountsForDate returns empty for General crew', () => {
    const { staffingCountsForDate } = require('../services/staffingRulesService');
    const employees = [
      { empId: 'GEN1', crew: 'General', role: 'CCR Operator', leaves: [] },
      { empId: 'GEN2', crew: 'General', role: 'CCR Operator', leaves: [] },
    ];
    const counts = staffingCountsForDate(employees, 'General', '2026-06-11', []);
    expect(counts).toEqual([]);
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
    expect(withoutCover.length).toBe(0);

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
