const {
  healthFromLastDataPoint,
  healthLabel,
  FRESH_HOURS,
  STALE_HOURS,
} = require('../utils/blobHealth');

describe('blobHealth', () => {
  const now = new Date('2026-06-11T12:00:00.000Z').getTime();

  test('uses 24h / 72h thresholds', () => {
    expect(FRESH_HOURS).toBe(24);
    expect(STALE_HOURS).toBe(72);
  });

  test('classifies freshness', () => {
    expect(healthFromLastDataPoint('2026-06-11', now)).toBe('green');
    expect(healthFromLastDataPoint('2026-06-09', now)).toBe('yellow');
    expect(healthFromLastDataPoint('2026-06-01', now)).toBe('red');
    expect(healthFromLastDataPoint(null, now)).toBe('red');
  });

  test('labels health status', () => {
    expect(healthLabel('green')).toBe('Fresh');
    expect(healthLabel('yellow')).toBe('Stale');
    expect(healthLabel('red')).toBe('Missing / very stale');
  });
});
