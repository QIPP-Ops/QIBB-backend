const {
  formatMonthLabel,
  buildMonthlyLeaveSummaryHtml,
  buildMonthlyLeaveSummaryPayload,
} = require('../services/monthlyLeaveSummaryService');

describe('monthlyLeaveSummaryService', () => {
  test('builds subject with month and year', () => {
    const ref = new Date('2026-06-01T04:00:00.000Z');
    const payload = buildMonthlyLeaveSummaryPayload(
      [
        {
          employeeName: 'Ali Hassan',
          role: 'Supervisor',
          crew: 'A',
          leaveType: 'Annual Leave',
          start: new Date('2026-06-03T00:00:00.000Z'),
          end: new Date('2026-06-08T00:00:00.000Z'),
          days: 6,
          appliedOnSap: true,
        },
      ],
      ref
    );
    expect(payload.subject).toBe('Leave Plan — June 2026');
    expect(payload.html).toContain('Ali Hassan');
    expect(formatMonthLabel(ref)).toBe('June 2026');
  });

  test('renders grouped sections by crew order', () => {
    const html = buildMonthlyLeaveSummaryHtml(
      [
        {
          employeeName: 'Badr',
          role: 'CCR Operator',
          crew: 'Crew B',
          leaveType: 'Sick',
          start: new Date('2026-06-10T00:00:00.000Z'),
          end: new Date('2026-06-11T00:00:00.000Z'),
          days: 2,
          appliedOnSap: false,
        },
        {
          employeeName: 'Ayesha',
          role: 'Supervisor',
          crew: 'General',
          leaveType: 'Planned',
          start: new Date('2026-06-01T00:00:00.000Z'),
          end: new Date('2026-06-02T00:00:00.000Z'),
          days: 2,
          appliedOnSap: true,
        },
      ],
      new Date('2026-06-01T00:00:00.000Z')
    );

    expect(html).toContain('Ayesha');
    expect(html).toContain('Badr');
    expect(html.indexOf('General')).toBeLessThan(html.indexOf('Crew B'));
    expect(html).toContain('No leave planned this month');
  });
});
