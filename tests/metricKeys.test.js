const {
  canonicalMetricKey,
  canonicalLabel,
  isBadMetricKey,
  deriveDisplayNameFromKey,
} = require('../services/plantReports/metricKeys');

describe('metricKeys', () => {
  test('canonicalMetricKey strips _day_N and _dayN suffixes', () => {
    expect(canonicalMetricKey('total_dm_prod_day_5')).toBe('total_dm_prod');
    expect(canonicalMetricKey('dt1_level_day1')).toBe('dt1_level');
    expect(canonicalMetricKey('generation_col_4')).toBe('generation');
  });

  test('canonicalLabel strips (day N) from labels', () => {
    expect(canonicalLabel('TOTAL DM PROD (DAY 5)', 'total_dm_prod_day_5')).toBe('TOTAL DM PROD');
  });

  test('isBadMetricKey detects legacy ingest keys', () => {
    expect(isBadMetricKey('total_dm_prod_day_5')).toBe(true);
    expect(isBadMetricKey('gr1_consumpt')).toBe(false);
    expect(isBadMetricKey('generation_col_4')).toBe(true);
  });

  test('deriveDisplayNameFromKey title-cases slug', () => {
    expect(deriveDisplayNameFromKey('gr1_consumpt')).toBe('Gr1 Consumpt');
  });
});
