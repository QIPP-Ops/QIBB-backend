const {
  loadMetricKeyRegistry,
  kpiKeys,
  chartKeys,
  managementKeys,
  kpiMatchers,
} = require('../services/metricKeyRegistry');

describe('metricKeyRegistry', () => {
  test('loads bundled registry with daily_op keys', () => {
    const registry = loadMetricKeyRegistry();
    expect(registry.kpis.gn.keys).toContain('daily_op_plant_gross_gen_mwh');
    expect(registry.charts.cHR.keys).toContain('daily_op_heat_rate_kjkwh');
    expect(registry.management.monthlyPlf.keys).toContain('daily_op_plf_pct');
    expect(Object.keys(registry.blobs)).toHaveLength(6);
  });

  test('helpers return key arrays', () => {
    expect(kpiKeys('gn')[0]).toBe('daily_op_plant_gross_gen_mwh');
    expect(chartKeys('cFU')[0]).toBe('daily_op_fuel_gas_tons');
    expect(managementKeys('monthlyGeneration')[0]).toBe('daily_op_plant_gross_gen_mwh');
  });

  test('kpiMatchers builds regex list', () => {
    const matchers = kpiMatchers();
    expect(matchers.gn.some((re) => re.test('daily_op_plant_gross_gen_mwh'))).toBe(true);
  });
});
