const ExcelJS = require('exceljs');
const {
  filenameMatchesPattern,
  patternSpecificity,
} = require('../services/plantReports/fileMappingService');
const { parseCellRef, colNumberToLetters } = require('../services/plantReports/cellRef');
const { parseMappedWorkbook } = require('../services/plantReports/parseMappedWorkbook');

describe('fileMappingService', () => {
  test('filenameMatchesPattern supports glob asterisks', () => {
    expect(filenameMatchesPattern('Daily Water Consumption Jan.xlsx', '*water*')).toBe(true);
    expect(filenameMatchesPattern('shift.xlsx', '*water*')).toBe(false);
    expect(filenameMatchesPattern('RO-HRSG Report.xlsx', 'RO-HRSG*')).toBe(true);
  });

  test('patternSpecificity prefers longer, fewer-wildcard patterns', () => {
    expect(patternSpecificity('RO-HRSG Report*.xlsx')).toBeGreaterThan(
      patternSpecificity('*.xlsx')
    );
  });
});

describe('cellRef', () => {
  test('parseCellRef and colNumberToLetters round-trip', () => {
    expect(parseCellRef('B3')).toEqual({ col: 2, row: 3, colLetter: 'B' });
    expect(colNumberToLetters(27)).toBe('AA');
  });
});

describe('parseMappedWorkbook', () => {
  test('row-based mapping extracts points with display names', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Sheet1');
    sheet.getCell('A1').value = 'Date';
    sheet.getCell('B1').value = 'Metric';
    sheet.getCell('C1').value = 'Value';
    sheet.getCell('A2').value = new Date('2026-01-15');
    sheet.getCell('B2').value = 'GT-12';
    sheet.getCell('C2').value = 42.5;
    sheet.getCell('A3').value = new Date('2026-01-16');
    sheet.getCell('B3').value = 'GT-12';
    sheet.getCell('C3').value = '';

    const mapping = {
      name: 'Test',
      orientation: 'row',
      dateCell: 'A2',
      headerRow: 1,
      metrics: [
        {
          nameCellRef: 'B2',
          valueCellRef: 'C2',
          displayName: 'GT-12 Generation MW',
        },
      ],
    };

    const points = parseMappedWorkbook(wb, mapping, '2026-01-15', 'test.xlsx');
    expect(points).toHaveLength(1);
    expect(points[0].label).toBe('GT-12 Generation MW');
    expect(points[0].displayName).toBe('GT-12 Generation MW');
    expect(points[0].value).toBe(42.5);
    expect(points[0].reportDate).toBe('2026-01-15');
  });

  test('empty values are skipped (not coerced to zero)', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('S');
    sheet.getCell('A2').value = '2026-01-01';
    sheet.getCell('B2').value = 'X';
    sheet.getCell('C2').value = '';

    const mapping = {
      name: 'T',
      orientation: 'row',
      dateCell: 'A2',
      headerRow: 1,
      metrics: [{ nameCellRef: 'B2', valueCellRef: 'C2', displayName: '' }],
    };

    expect(parseMappedWorkbook(wb, mapping, '2026-01-01', 't.xlsx')).toHaveLength(0);
  });
});
