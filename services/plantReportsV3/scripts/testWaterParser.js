const ExcelJS = require('exceljs');
const path = require('path');

const FILE_PATH =
  'C:\\Users\\m.algarni\\Downloads\\2026-01-31_Daily_water_consumption_followup-master.xlsx';

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE_PATH);

  const { parse } = require('../parsers/waterParser');
  const result = parse({
    wb,
    filename: path.basename(FILE_PATH),
    sourceFile: FILE_PATH,
  });

  const uniqueMetrics = [...new Set(result.data.map((p) => p.metric))].sort();

  console.log('Total points extracted:', result.data.length);
  console.log('First 10 points:', JSON.stringify(result.data.slice(0, 10), null, 2));
  console.log('Unique metric names:', uniqueMetrics);

  const { mergeKind } = require('../jsonStore');
  mergeKind('water', result.data);
  console.log('Saved to water.json successfully');
})().catch(console.error);
