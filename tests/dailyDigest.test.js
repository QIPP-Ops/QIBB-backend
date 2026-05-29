const { digestSubjectDate, yesterdayYmd } = require('../services/dailyDigestService');

describe('dailyDigestService helpers', () => {
  test('yesterdayYmd returns prior UTC calendar day', () => {
    const ref = new Date('2026-05-30T12:00:00.000Z');
    expect(yesterdayYmd(ref)).toBe('2026-05-29');
  });

  test('digestSubjectDate formats AST weekday label', () => {
    const ref = new Date('2026-05-29T03:30:00.000Z');
    const label = digestSubjectDate(ref);
    expect(label).toMatch(/2026/);
    expect(label.length).toBeGreaterThan(10);
  });
});
