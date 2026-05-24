const {
  matchesRoHrsgReport,
  matchesWaterReport,
} = require('../services/plantReports/reportMatchers');

describe('reportMatchers', () => {
  it('matches RO-HRSG Report filenames case-insensitively', () => {
    expect(matchesRoHrsgReport('RO-HRSG Report - Jan 03, 2026 M.xlsx')).toBe(true);
    expect(matchesRoHrsgReport('ro-hrsg report - april 08, 2026 m.xlsx')).toBe(true);
  });

  it('matches daily water consumption filenames', () => {
    expect(matchesWaterReport('2026-05-09_Daily_water_consumption_followup master.xlsx')).toBe(true);
    expect(matchesWaterReport('Daily_water_consumption_followup master.xlsx')).toBe(true);
  });
});
