const {
  getNextBiHourlyRun,
  shouldRunBiHourlyCron,
} = require('../jobs/ingestCron');

describe('ingestCron schedule helpers', () => {
  it('shouldRunBiHourlyCron is true at even hours on minute 0', () => {
    expect(shouldRunBiHourlyCron(new Date('2026-06-01T04:00:00.000Z'))).toBe(true);
    expect(shouldRunBiHourlyCron(new Date('2026-06-01T03:00:00.000Z'))).toBe(false);
    expect(shouldRunBiHourlyCron(new Date('2026-06-01T04:01:00.000Z'))).toBe(false);
  });

  it('getNextBiHourlyRun returns a future even-hour slot', () => {
    const from = new Date('2026-06-01T13:30:00.000Z');
    const next = getNextBiHourlyRun(from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.getUTCHours() % 2).toBe(0);
  });
});
