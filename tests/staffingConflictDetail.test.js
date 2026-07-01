const {
  buildGroupBreakdown,
  formatStaffingConflictMessage,
  formatStaffingNotifyMessage,
  mergeGroupBreakdowns,
} = require('../utils/staffingConflictDetail');

function leave(start, end) {
  return { start, end, status: 'approved' };
}

describe('staffingConflictDetail', () => {
  const employees = [
    {
      empId: 'A1',
      name: 'Alice',
      crew: 'A',
      role: 'CCR Operator',
      opsGroupLabel: 'GR #1-2',
      leaves: [leave('2026-07-16', '2026-07-16')],
    },
    {
      empId: 'A2',
      name: 'Bob',
      crew: 'A',
      role: 'CCR Operator',
      opsGroupLabel: 'GR #3-4',
      leaves: [leave('2026-07-16', '2026-07-16')],
    },
    {
      empId: 'A3',
      name: 'Carol',
      crew: 'A',
      role: 'CCR Operator',
      opsGroupLabel: 'GR #3-4',
      leaves: [],
    },
    {
      empId: 'A4',
      name: 'Dan',
      crew: 'A',
      role: 'CCR Operator',
      opsGroupLabel: 'GR #1-2',
      leaves: [],
    },
  ];

  const below = [{ label: 'CCR Operator', available: 2, min: 3, shortfall: 1 }];

  test('buildGroupBreakdown lists affected groups with role counts', () => {
    const groups = buildGroupBreakdown(employees, 'A', '2026-07-16', below, {
      approvedLeaveOnly: true,
    });
    expect(groups.map((g) => g.groupLabel).sort()).toEqual(['GR #1-2', 'GR #3-4']);
    const g12 = groups.find((g) => g.groupLabel === 'GR #1-2');
    expect(g12.roles[0]).toMatchObject({ label: 'CCR Operator', available: 1, onLeave: 1, roster: 2 });
    expect(g12.onLeave.map((e) => e.name)).toEqual(['Alice']);
  });

  test('formatStaffingConflictMessage includes shift, date, roles, and groups', () => {
    const groups = buildGroupBreakdown(employees, 'A', '2026-07-16', below, {
      approvedLeaveOnly: true,
    });
    const message = formatStaffingConflictMessage({
      crew: 'A',
      shift: 'D',
      dateLabel: '2026-07-16',
      below,
      groups,
    });
    expect(message).toContain('Shift A');
    expect(message).toContain('Day');
    expect(message).toContain('CCR Operator 2/3');
    expect(message).toContain('GR #1-2');
  });

  test('formatStaffingNotifyMessage summarizes alert for in-app notification', () => {
    const alert = {
      crew: 'A',
      shift: 'N',
      dateLabel: '2026-07-16 – 2026-07-18',
      below,
      groups: [{ groupLabel: 'GR #3-4' }],
    };
    const msg = formatStaffingNotifyMessage(alert);
    expect(msg).toContain('Shift A');
    expect(msg).toContain('Night');
    expect(msg).toContain('2026-07-16 – 2026-07-18');
    expect(msg).toContain('GR #3-4');
  });

  test('mergeGroupBreakdowns combines groups across cycle days', () => {
    const g1 = buildGroupBreakdown(employees, 'A', '2026-07-16', below, { approvedLeaveOnly: true });
    const g2 = buildGroupBreakdown(
      employees.map((e) =>
        e.empId === 'A2'
          ? { ...e, leaves: [] }
          : e.empId === 'A3'
            ? { ...e, leaves: [leave('2026-07-17', '2026-07-17')] }
            : e
      ),
      'A',
      '2026-07-17',
      below,
      { approvedLeaveOnly: true }
    );
    const merged = mergeGroupBreakdowns(g1, g2);
    expect(merged.map((g) => g.groupLabel).sort()).toEqual(['GR #1-2', 'GR #3-4']);
    const g34 = merged.find((g) => g.groupLabel === 'GR #3-4');
    expect(g34.onLeave.map((e) => e.name).sort()).toEqual(['Bob', 'Carol']);
  });
});
