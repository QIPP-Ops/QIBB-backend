const { inferDateFromFilename } = require('../services/plantReports/excelUtils');

describe('inferDateFromFilename', () => {
  it('parses ISO dates in blob object names', () => {
    expect(inferDateFromFilename('reports/Daily_Operation_Report_2024-11-02.xlsx')).toBe(
      '2024-11-02'
    );
  });

  it('uses blob lastModified when filename has no date and file is not on disk', () => {
    const d = new Date('2025-03-15T10:00:00Z');
    expect(inferDateFromFilename('virtual/path/shift report.xlsx', d)).toBe('2025-03-15');
  });
});
