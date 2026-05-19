const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const EXCEL_EXT = new Set(['.xlsx', '.xlsm', '.xls']);
const REMARK_RE = /remark|comment|note|handover|shift report|observation|highlight/i;
const AUTHOR_RE = /by\s*:|prepared|author|shift in charge|sic|engineer/i;

function walkExcel(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (!name.startsWith('.') && name !== 'node_modules') walkExcel(full, out);
    } else if (EXCEL_EXT.has(path.extname(name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function inferDateFromName(filePath) {
  const base = path.basename(filePath);
  const patterns = [
    /(\d{4})[-_](\d{2})[-_](\d{2})/,
    /(\d{2})[-_](\d{2})[-_](\d{4})/,
    /(\d{8})/,
  ];
  for (const p of patterns) {
    const m = base.match(p);
    if (!m) continue;
    if (m[0].length === 8 && !m[0].includes('-')) {
      return `${m[0].slice(0, 4)}-${m[0].slice(4, 6)}-${m[0].slice(6, 8)}`;
    }
    if (m[1].length === 4) return `${m[1]}-${m[2]}-${m[3]}`;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const mtime = fs.statSync(filePath).mtime;
  return mtime.toISOString().slice(0, 10);
}

function cellText(cell) {
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  if (typeof v === 'object' && v.result != null) return String(v.result).trim();
  return String(v).trim();
}

/**
 * Extract remark-like rows from workbooks (daily operation, shift reports, etc.)
 */
async function extractHighlightsFromFolder(reportsRoot) {
  const files = walkExcel(reportsRoot);
  const highlights = [];

  for (const filePath of files) {
    const rel = path.relative(reportsRoot, filePath);
    const reportDate = inferDateFromName(filePath);
    let wb;
    try {
      wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
    } catch {
      continue;
    }

    for (const ws of wb.worksheets) {
      const headerRow = ws.getRow(1);
      const remarkCols = [];
      headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
        const h = cellText(cell).toLowerCase();
        if (REMARK_RE.test(h)) remarkCols.push(col);
      });

      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        let text = '';
        let author = '';

        if (remarkCols.length) {
          remarkCols.forEach((col) => {
            const t = cellText(row.getCell(col));
            if (t) text += (text ? ' · ' : '') + t;
          });
        } else {
          row.eachCell({ includeEmpty: false }, (cell) => {
            const t = cellText(cell);
            if (t.length < 12) return;
            if (REMARK_RE.test(t)) text = t;
            if (AUTHOR_RE.test(t) && t.length < 120) author = t;
          });
        }

        row.eachCell({ includeEmpty: false }, (cell) => {
          const t = cellText(cell);
          if (AUTHOR_RE.test(t) && t.length < 120 && !author) author = t;
        });

        if (!text || text.length < 8) return;
        if (/^#|^n\/a|^no sample/i.test(text)) return;

        highlights.push({
          reportDate,
          sourceFile: rel,
          sheetName: ws.name,
          category: 'remark',
          text: text.slice(0, 2000),
          author: author.slice(0, 200),
          crew: '',
          occurredAt: new Date(reportDate),
        });
      });
    }
  }

  return highlights;
}

module.exports = {
  walkExcel,
  extractHighlightsFromFolder,
  inferDateFromName,
};
