#!/usr/bin/env node
/**
 * Scan a local SharePoint-synced folder and print an inventory of Excel workbooks.
 *
 * Usage:
 *   node scripts/discover-plant-reports.js "C:\path\to\your\synced\folder"
 *   PLANT_REPORTS_DIR="C:\path" node scripts/discover-plant-reports.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const rootArg = process.argv[2] || process.env.PLANT_REPORTS_DIR;

if (!rootArg) {
  console.error('Provide a folder path: node scripts/discover-plant-reports.js <folder>');
  process.exit(1);
}

const root = path.resolve(rootArg);
if (!fs.existsSync(root)) {
  console.error(`Folder not found: ${root}`);
  process.exit(1);
}

const EXCEL_EXT = new Set(['.xlsx', '.xlsm', '.xls']);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (!name.startsWith('.') && name !== 'node_modules') walk(full, out);
    } else if (EXCEL_EXT.has(path.extname(name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

async function sheetSummary(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheets = [];
  for (const ws of wb.worksheets) {
    const headers = [];
    const sampleRows = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum > 15) return;
      const cells = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        const text = typeof v === 'object' && v?.text ? v.text : String(v ?? '').trim();
        if (text) cells.push(text.slice(0, 80));
      });
      if (rowNum === 1 && cells.length) headers.push(...cells);
      if (cells.length) sampleRows.push(cells);
    });
    const flat = sampleRows.flat().join(' ').toLowerCase();
    const tags = [];
    if (/remark|comment|handover|shift report|note/i.test(flat)) tags.push('has-remarks');
    if (/water|consumpt|tank|dm |sw /i.test(flat)) tags.push('water');
    if (/energy|mwh|mw|load/i.test(flat)) tags.push('energy');
    if (/ro-|hrsg|chemistry|conductivity|ph|silica/i.test(flat)) tags.push('chemistry');
    if (/filter|dp|differential/i.test(flat)) tags.push('filters');
    if (/daily|operation|plant summary/i.test(flat)) tags.push('daily-ops');

    sheets.push({
      name: ws.name,
      rowCount: ws.rowCount,
      colCount: ws.columnCount,
      headerPreview: headers.slice(0, 12),
      tags,
    });
  }
  return sheets;
}

(async () => {
  const files = walk(root);
  console.log(`\nPlant reports inventory — ${files.length} Excel files under:\n  ${root}\n`);

  const inventory = [];
  for (const file of files.sort()) {
    const rel = path.relative(root, file);
    try {
      const sheets = await sheetSummary(file);
      inventory.push({ file: rel, sheets });
      console.log(`\n## ${rel}`);
      sheets.forEach((s) => {
        console.log(`  - [${s.name}] rows=${s.rowCount} cols=${s.colCount} tags=${s.tags.join(',') || '—'}`);
        if (s.headerPreview.length) {
          console.log(`    headers: ${s.headerPreview.join(' | ')}`);
        }
      });
    } catch (err) {
      console.log(`\n## ${rel} — ERROR: ${err.message}`);
      inventory.push({ file: rel, error: err.message });
    }
  }

  const outPath = path.join(__dirname, '..', 'docs', 'plant-reports-inventory.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ scannedAt: new Date().toISOString(), root, files: inventory }, null, 2));
  console.log(`\nWrote ${outPath}\n`);
})();
