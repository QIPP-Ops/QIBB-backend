const ExcelJS = require('exceljs');

const { getParserForFilename } = require('../services/plantReports/parsers/parserRegistry');

function wbWithSheet(name) {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet(name);
  return wb;
}

describe('parserRegistry', () => {
  test('selects most specific parser case-insensitively', () => {
    const p = getParserForFilename('DAILY ACTUAL ENERGY PRODUCED REPORT QIPP 01-May-2026.xlsx');
    expect(p).toBeTruthy();
    expect(p.id).toBe('parser6_daily_actual_energy_produced');
  });
});

describe('PARSER 6: Daily actual energy produced', () => {
  test('extracts date from filename and computes daily totals', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.getCell('A1').value = 'Hr';
    ws.getCell('B1').value = 'Actual Energy Produced (Eai) MWh';
    ws.getCell('C1').value = 'LDC Reduction MWh';
    ws.getCell('D1').value = 'Remarks';
    ws.getCell('A2').value = 0;
    ws.getCell('B2').value = 10;
    ws.getCell('C2').value = 1;
    ws.getCell('D2').value = 'note';
    ws.getCell('A3').value = 1;
    ws.getCell('B3').value = 20;
    ws.getCell('C3').value = 2;
    const { parse } = require('../services/plantReports/parsers/parser6_dailyActualEnergyProduced');
    const res = parse({
      wb,
      filename: 'DAILY ACTUAL ENERGY PRODUCED REPORT QIPP 01-May-2026.xlsx',
      sourceFile: 'x.xlsx',
    });
    expect(res.skipped).toBe(false);
    expect(res.reportDate).toBe('2026-05-01');
    const daily = res.points.find((p) => /daily_total_energy_mwh/.test(p.metricKey));
    expect(daily.value).toBe(30);
    expect(res.highlights.length).toBeGreaterThan(0);
  });

  test('nulls excel errors (not coerced to zero)', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S');
    ws.getCell('A1').value = 'Hr';
    ws.getCell('B1').value = 'Actual Energy Produced (Eai) MWh';
    ws.getCell('A2').value = 0;
    ws.getCell('B2').value = '#VALUE!';
    const { parse } = require('../services/plantReports/parsers/parser6_dailyActualEnergyProduced');
    const res = parse({
      wb,
      filename: 'DAILY ACTUAL ENERGY PRODUCED REPORT QIPP 01-May-2026.xlsx',
      sourceFile: 'x.xlsx',
    });
    expect(res.points.some((p) => p.value === 0)).toBe(false);
  });
});

describe('PARSER 5: Daily water consumption', () => {
  test('extracts year/month from filename and skips all-zero day columns', () => {
    const wb = wbWithSheet('master');
    const ws = wb.getWorksheet('master');
    ws.getCell('A3').value = 'GR-1 CONSUMPT';
    // Day 1 column (B) all zeros => skip
    ws.getCell('B3').value = 0;
    // Day 2 column (C) has value => keep
    ws.getCell('C3').value = 5;

    const { parse } = require('../services/plantReports/parsers/parser5_dailyWaterConsumption');
    const res = parse({
      wb,
      filename: '2026-05_Daily_water_consumption_followup master.xlsx',
      sourceFile: 'w.xlsx',
    });
    expect(res.skipped).toBe(false);
    expect(res.points.some((p) => p.columnKey === 'day1')).toBe(false);
    expect(res.points.some((p) => p.columnKey === 'day2' && p.value === 5)).toBe(true);
  });
});

describe('PARSER 3: GT fuel gas filter DP', () => {
  test('extracts date from filename and nulls negative DP', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S');
    ws.getCell('B1').value = 'GT';
    ws.getCell('C1').value = 'DP bar';
    ws.getCell('B4').value = 'GT-11';
    ws.getCell('C4').value = -0.1;
    const { parse } = require('../services/plantReports/parsers/parser3_gtFuelGasFilterDp');
    const res = parse({ wb, filename: 'GTs FG filter DP 18.05.2026.xlsx', sourceFile: 'f.xlsx' });
    expect(res.reportDate).toBe('2026-05-18');
    const dp = res.points.find((p) => /dp/.test(p.columnKey));
    expect(dp.value).toBeNull();
  });
});

describe('PARSER 4: GT air intake filter DP', () => {
  test('keeps valid negative DP values', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S');
    ws.getCell('B1').value = 'GT';
    ws.getCell('C1').value = 'DP DCS mbar';
    ws.getCell('B4').value = 'GT-11';
    ws.getCell('C4').value = -2;
    const { parse } = require('../services/plantReports/parsers/parser4_gtAirIntakeFilterDp');
    const res = parse({ wb, filename: 'GTs Air Intake Filter DP 18.05.2026.xlsx', sourceFile: 'a.xlsx' });
    const dp = res.points.find((p) => /dp/.test(p.columnKey));
    expect(dp.value).toBe(-2);
  });
});

describe('PARSER 2: RO-HRSG Report', () => {
  test('date from HRSG header and shift from filename suffix', () => {
    const wb = new ExcelJS.Workbook();
    const hrsg = wb.addWorksheet('HRSG Report');
    hrsg.getCell('A1').value = 'Date';
    hrsg.getCell('B1').value = new Date('2026-04-08T00:00:00Z');
    hrsg.getCell('A5').value = 'Unit';
    hrsg.getCell('B5').value = 'DO_ppb';
    hrsg.getCell('A6').value = 'ST10';
    hrsg.getCell('B6').value = -1; // DO < 0 => null

    const ro = wb.addWorksheet('RO');
    ro.getCell('A1').value = 'Sampling point';
    ro.getCell('B1').value = 'Conductivity';
    ro.getCell('A2').value = 'DAF';
    ro.getCell('B2').value = 1.2;
    ro.getCell('C3').value = 'Recommendation: check sample';

    const { parse } = require('../services/plantReports/parsers/parser2_roHrsgReport');
    const res = parse({ wb, filename: 'RO-HRSG Report - APRIL 08, 2026 M.xlsx', sourceFile: 'r.xlsx' });
    expect(res.reportDate).toBe('2026-04-08');
    const doPoint = res.points.find((p) => /do_ppb/i.test(p.columnKey));
    expect(doPoint.value).toBeNull();
    expect(res.highlights.length).toBeGreaterThan(0);
  });
});

describe('PARSER 7: Environment Report', () => {
  test('extracts date from filename and parses numbers', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S');
    ws.getCell('A2').value = 'GT11 NOx';
    ws.getCell('C2').value = 'ppm';
    ws.getCell('D2').value = 5;
    const { parse } = require('../services/plantReports/parsers/parser7_environmentReport');
    const res = parse({ wb, filename: 'Environment Report 18.05.2026.xlsx', sourceFile: 'e.xlsx' });
    expect(res.reportDate).toBe('2026-05-18');
    expect(res.points[0].value).toBe(5);
  });
});

describe('PARSER 8: Timers & Counters', () => {
  test('computes daily deltas from cumulative counters', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Group-1');
    ws.getCell('A1').value = '31.12.2025';
    ws.getCell('B1').value = 'GT#11';
    ws.getCell('A2').value = new Date('2026-01-01T00:00:00Z');
    ws.getCell('B2').value = 100;
    ws.getCell('A3').value = new Date('2026-01-02T00:00:00Z');
    ws.getCell('B3').value = 150;
    const { parse } = require('../services/plantReports/parsers/parser8_timersCounters');
    const res = parse({ wb, filename: 'TIMERS-COUNTERS 01.01.2026.xlsx', sourceFile: 't.xlsx' });
    const d2 = res.points.find((p) => p.reportDate === '2026-01-02');
    expect(d2.value).toBe(50);
  });
});

describe('PARSER 1: Operation Shift Report', () => {
  test('extracts date from plant status and skips empty sce with 0 power', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Plant Status');
    ws.getCell('A1').value = new Date('2026-05-19T00:00:00Z');
    ws.getCell('A2').value = 'Day Shift';
    // row 6: group, sce empty, power 0 => skipped
    ws.getCell('C6').value = 'Group# 1';
    ws.getCell('D6').value = '';
    ws.getCell('E6').value = 0;
    // row 7: valid
    ws.getCell('C7').value = 'Group# 1';
    ws.getCell('D7').value = 'GT11';
    ws.getCell('E7').value = 100;
    ws.getCell('F7').value = 'SD'; // => null

    const act = wb.addWorksheet('Day to Day activities');
    act.getCell('A1').value = 'Date';
    act.getCell('K2').value = 'Some meaningful highlight text';
    act.getCell('A2').value = new Date('2026-05-19T00:00:00Z');

    const { parse } = require('../services/plantReports/parsers/parser1_operationShiftReport');
    const res = parse({ wb, filename: 'Operation Shift report 19.05.2026.xlsx', sourceFile: 's.xlsx' });
    expect(res.reportDate).toBe('2026-05-19');
    expect(res.points.some((p) => p.equipmentId === '' && p.value === 0)).toBe(false);
    const eff = res.points.find((p) => p.columnKey === 'efficiency');
    expect(eff.value).toBeNull();
    expect(res.highlights.length).toBeGreaterThan(0);
  });
});

