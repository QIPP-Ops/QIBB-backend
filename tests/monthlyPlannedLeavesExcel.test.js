const {
  toYmd,
  leaveOverlapsMonth,
  parseYearMonth,
  buildMonthlyPlannedLeavesWorkbook,
} = require('../services/monthlyPlannedLeavesExcel');

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

  test('buildMonthlyPlannedLeavesWorkbook includes roster.json June 2026 leaves', async () => {
    const AdminUser = require('../models/AdminUser');
    const findSpy = jest.spyOn(AdminUser, 'find').mockReturnValue({
      select: () => ({
        lean: async () => [],
      }),
    });

    const result = await buildMonthlyPlannedLeavesWorkbook('2026-06');
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.filename).toBe('planned-leaves-2026-06.xlsx');
    expect(result.buffer).toBeTruthy();

    findSpy.mockRestore();
  });
});
