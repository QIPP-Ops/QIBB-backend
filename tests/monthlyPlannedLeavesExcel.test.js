const {
  toYmd,
  leaveOverlapsMonth,
  parseYearMonth,
  buildMonthlyPlannedLeavesWorkbook,
  groupRowsByEmployee,
  formatDateRange,
} = require('../services/monthlyPlannedLeavesExcel');
const { loadBundledEmailPresets, MONTHLY_PRESET_ID } = require('../services/emailPresetsService');

describe('monthlyPlannedLeavesExcel', () => {
  test('toYmd handles Mongo Date objects', () => {
    const d = new Date('2026-06-06T00:00:00.000Z');
    expect(toYmd(d)).toBe('2026-06-06');
    expect(toYmd('2026-06-14')).toBe('2026-06-14');
  });

  test('leaveOverlapsMonth works with Date leave fields', () => {
    const { start, end } = parseYearMonth('2026-06');
    const leave = {
      start: new Date('2026-06-06T00:00:00.000Z'),
      end: new Date('2026-06-14T00:00:00.000Z'),
      type: 'Applied on SAP',
    };
    expect(leaveOverlapsMonth(leave, start, end)).toBe(true);
    expect(
      leaveOverlapsMonth(
        { start: new Date('2026-07-01T00:00:00.000Z'), end: new Date('2026-07-05T00:00:00.000Z') },
        start,
        end
      )
    ).toBe(false);
  });

  test('formatDateRange renders readable dates', () => {
    expect(formatDateRange('2026-06-06', '2026-06-14')).toMatch(/6 Jun 2026/);
    expect(formatDateRange('2026-06-06', '2026-06-14')).toMatch(/14 Jun 2026/);
  });

  test('groupRowsByEmployee groups multiple leave segments per person', () => {
    const flatRows = [
      {
        empId: '1001',
        name: 'Alice',
        crew: 'Crew A',
        role: 'CCR Operator',
        leaveStart: '2026-06-10',
        leaveEnd: '2026-06-12',
        daysInMonth: 3,
        leaveType: 'Planned',
      },
      {
        empId: '1001',
        name: 'Alice',
        crew: 'Crew A',
        role: 'CCR Operator',
        leaveStart: '2026-06-20',
        leaveEnd: '2026-06-22',
        daysInMonth: 3,
        leaveType: 'Applied on SAP',
      },
      {
        empId: '1002',
        name: 'Bob',
        crew: 'Crew B',
        role: 'Local Operator',
        leaveStart: '2026-06-05',
        leaveEnd: '2026-06-07',
        daysInMonth: 3,
        leaveType: 'Planned',
      },
    ];

    const grouped = groupRowsByEmployee(flatRows);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].name).toBe('Alice');
    expect(grouped[0].leaves).toHaveLength(2);
    expect(grouped[0].totalDaysInMonth).toBe(6);
    expect(grouped[1].name).toBe('Bob');
    expect(grouped[1].leaves).toHaveLength(1);
  });

  test('buildMonthlyPlannedLeavesWorkbook includes roster.json June 2026 leaves', async () => {
    const AdminUser = require('../models/AdminUser');
    const findSpy = jest.spyOn(AdminUser, 'find').mockReturnValue({
      select: () => ({
        lean: async () => [],
      }),
    });

    const result = await buildMonthlyPlannedLeavesWorkbook('2026-06');
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.employeeCount).toBeGreaterThan(0);
    expect(result.employeeCount).toBeLessThanOrEqual(result.rowCount);
    expect(result.filename).toBe('planned-leaves-2026-06.xlsx');
    expect(result.buffer).toBeTruthy();

    findSpy.mockRestore();
  });
});

describe('monthly planned leaves email preset', () => {
  test('uses line manager wording instead of supervisor', () => {
    const preset = loadBundledEmailPresets().find((p) => p.id === MONTHLY_PRESET_ID);
    expect(preset).toBeDefined();
    expect(preset.body).toMatch(/line manager/i);
    expect(preset.body).not.toMatch(/supervisor/i);
  });
});
