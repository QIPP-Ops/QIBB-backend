#!/usr/bin/env node
/** Quick structure dump for specific report files */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ROOT = process.argv[2] || 'C:\\Users\\asus\\Acwa\\QIPP - QIPP Mail Ingest Temp';
const NAMES = [
  '2026-05-19_Daily_water_consumption_followup master.xlsx',
  'Operation Shift report 19.05.2026.xlsx',
  'OIL PURIFIER LOG SHEET 18.05.2026.xlsx',
  'TIMERS-COUNTERS 18.05.2026.xlsx',
  'GTs FG filter DP 18.05.2026.xlsx',
  'GTs Air Intake Filter 18.05.2026.xlsx',
  'Fuel Gas Daily Data 18.05.2026.xlsx',
  'Environment Report 18.05.2026.xlsx',
  'Daily Operation Report 18.05.2026.xlsx',
  'RO-HRSG Report - APRIL 08, 2026 M.xlsx',
];

function cellText(cell) {
  const v = cell?.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  if (typeof v === 'object' && v.result != null) return String(v.result).trim();
  return String(v).trim();
}

function findFile(name) {
  const direct = path.join(ROOT, name);
  if (fs.existsSync(direct)) return direct;
  const stack = [ROOT];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.name === name) return full;
    }
  }
  return null;
}

(async () => {
  for (const name of NAMES) {
    const fp = findFile(name);
    console.log('\n' + '='.repeat(80));
    console.log(name);
    if (!fp) {
      console.log('  NOT FOUND');
      continue;
    }
    console.log('  path:', fp);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(fp);
    for (const ws of wb.worksheets) {
      console.log(`\n  [${ws.name}] rows=${ws.rowCount} cols=${ws.columnCount}`);
      for (let r = 1; r <= Math.min(25, ws.rowCount); r++) {
        const row = ws.getRow(r);
        const cells = [];
        row.eachCell({ includeEmpty: false }, (c, col) => {
          if (col > 14) return;
          const t = cellText(c).slice(0, 40);
          if (t) cells.push(`C${col}:${t}`);
        });
        if (cells.length) console.log(`    R${r}: ${cells.join(' | ')}`);
      }
    }
  }
})();
