const { inferDateFromFilename } = require('../services/plantReports/excelUtils');

describe('inferDateFromFilename', () => {
  it('parses ISO dates in blob object names', () => {
    expect(inferDateFromFilename('reports/Daily_Operation_Report_2024-11-02.xlsx')).toBe(
      '2024-11-02'
    );
  });

  it('uses explicit fallback when filename has no date', () => {
    const d = new Date('2025-03-15T10:00:00Z');
    expect(inferDateFromFilename('virtual/path/shift report.xlsx', d)).toBe('2025-03-15');
  });

  it('returns null instead of today when no date and no fallback', () => {
    expect(inferDateFromFilename('virtual/path/shift report.xlsx')).toBeNull();
  });

  it('parses YYYY-MM prefix as first of month anchor', () => {
    expect(inferDateFromFilename('2026-06_Daily_water_consumption.xlsx')).toBe('2026-06-01');
  });

  it('parses abbreviated month names in RO-HRSG filenames', () => {
    expect(inferDateFromFilename('RO-HRSG Report - Jan 03, 2026 M.xlsx')).toBe('2026-01-03');
    expect(inferDateFromFilename('RO-HRSG Report - APRIL 08, 2026 M.xlsx')).toBe('2026-04-08');
  });
});
