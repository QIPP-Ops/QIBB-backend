const {
  isFutureReportDate,
  isFutureCalendarDay,
  filterFutureMetricPoints,
  todayIso,
} = require('../services/plantReports/reportDateGuards');

describe('reportDateGuards', () => {
  const now = new Date('2026-06-02T15:00:00Z');

  it('todayIso uses local calendar day', () => {
    expect(todayIso(now)).toBe('2026-06-02');
  });

  it('flags dates after end-of-today', () => {
    expect(isFutureReportDate('2026-06-02', now)).toBe(false);
    expect(isFutureReportDate('2026-06-03', now)).toBe(true);
    expect(isFutureCalendarDay(2026, 6, 6, now)).toBe(true);
    expect(isFutureCalendarDay(2026, 6, 1, now)).toBe(false);
  });

  it('filterFutureMetricPoints drops future rows', () => {
    const { kept, rejected } = filterFutureMetricPoints(
      [
        { metricKey: 'a', reportDate: '2026-06-01', sourceFile: 'f.xlsx' },
        { metricKey: 'b', reportDate: '2026-06-07', sourceFile: 'f.xlsx' },
      ],
      { now, log: false }
    );
    expect(rejected).toBe(1);
    expect(kept).toHaveLength(1);
    expect(kept[0].metricKey).toBe('a');
  });
});
