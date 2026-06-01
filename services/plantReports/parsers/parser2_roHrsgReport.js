const { slugKey, cellText } = require('../excelUtils');
const { parseNullableNumber, makePoint } = require('./common');

function shiftFromFilename(filename) {
  const base = String(filename || '').toUpperCase();
  // Spec: suffix M=Day, N=Night
  if (/\bM\.XLSX?$/.test(base) || /\bM\s*\.XLSX?$/.test(base) || /\b M\b/.test(base)) return 'Day';
  if (/\bN\.XLSX?$/.test(base) || /\bN\s*\.XLSX?$/.test(base) || /\b N\b/.test(base)) return 'Night';
  return null;
}

function findHeaderDate(ws) {
  // Search first ~6 rows for "Date" then adjacent date value.
  for (let r = 1; r <= 6; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.min(ws.columnCount || 30, 30); c++) {
      const t = String(cellText(row.getCell(c)) || '').trim().toLowerCase();
      if (t === 'date' || t.includes('date')) {
        const v = row.getCell(c + 1).value;
        if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
        const s = String(cellText(row.getCell(c + 1)) || '').trim();
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      }
    }
  }
  return null;
}

function parseHrsgSheet(ws, reportDate, shift, sourceFile) {
  const points = [];
  // Find header row containing Unit + pH/SC/CC/DO etc.
  let headerRowNum = null;
  for (let r = 1; r <= 20; r++) {
    const row = ws.getRow(r);
    const c1 = String(cellText(row.getCell(1)) || '').toLowerCase();
    if (c1.includes('unit')) {
      headerRowNum = r;
      break;
    }
  }
  if (!headerRowNum) return points;

  const headerRow = ws.getRow(headerRowNum);
  const colKey = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const h = String(cellText(cell) || '').trim();
    if (!h) return;
    colKey[col] = h;
  });

  for (let r = headerRowNum + 1; r <= Math.min(ws.rowCount || 500, 500); r++) {
    const row = ws.getRow(r);
    const unit = String(cellText(row.getCell(1)) || '').trim();
    if (!unit) continue;
    for (const [colStr, h] of Object.entries(colKey)) {
      const col = parseInt(colStr, 10);
      if (col === 1) continue;
      const key = String(h).trim();
      if (!key) continue;
      let val = parseNullableNumber(row.getCell(col));
      // Spec: DO < 0 => null; DO > 5000 keep
      if (/do/i.test(key) && typeof val === 'number' && val < 0) val = null;

      points.push(
        makePoint({
          metricKey: slugKey(['ro_hrsg', ws.name, unit, key, shift || '']),
          label: `${ws.name} ${unit} ${key}`,
          displayName: `${ws.name} ${unit} ${key}${shift ? ` (${shift})` : ''}`,
          category: 'chemistry',
          unit: '',
          reportDate,
          value: val,
          equipmentId: unit,
          sourceFile,
          sheetName: ws.name,
          columnKey: key,
        })
      );
    }
  }
  return points;
}

function parseRoSheet(ws, reportDate, shift, sourceFile) {
  const points = [];
  // Minimal: treat first column as sampling point and subsequent numeric columns as params.
  const header = {};
  const headerRow = ws.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    if (col === 1) return;
    const h = String(cellText(cell) || '').trim();
    if (h) header[col] = h;
  });

  for (let r = 2; r <= Math.min(ws.rowCount || 500, 500); r++) {
    const row = ws.getRow(r);
    const sp = String(cellText(row.getCell(1)) || '').trim();
    if (!sp) continue;
    for (const [colStr, h] of Object.entries(header)) {
      const col = parseInt(colStr, 10);
      const key = String(h).trim();
      if (!key) continue;
      const val = parseNullableNumber(row.getCell(col));
      points.push(
        makePoint({
          metricKey: slugKey(['ro', sp, key, shift || '']),
          label: `${sp} ${key}`,
          displayName: `${sp} ${key}${shift ? ` (${shift})` : ''}`,
          category: 'chemistry',
          unit: '',
          reportDate,
          value: val,
          equipmentId: sp,
          sourceFile,
          sheetName: ws.name,
          columnKey: key,
        })
      );
    }
  }
  return points;
}

function parse({ wb, filename, sourceFile }) {
  const shift = shiftFromFilename(filename);
  // Spec: date from HRSG Report header row
  const hrsgWs =
    wb.worksheets.find((s) => /hrsg/i.test(s.name)) || wb.getWorksheet('HRSG Report') || wb.getWorksheet('HRSG');
  const reportDate = hrsgWs ? findHeaderDate(hrsgWs) : null;
  if (!reportDate) return { skipped: true, kind: 'ro_hrsg', points: [], highlights: [], reportDate: null };

  const points = [];
  const highlights = [];

  for (const ws of wb.worksheets) {
    const n = String(ws.name || '').toLowerCase();
    if (n.includes('hrsg')) points.push(...parseHrsgSheet(ws, reportDate, shift, sourceFile));
    if (n.includes('ro')) points.push(...parseRoSheet(ws, reportDate, shift, sourceFile));
  }

  // Recommendations as shift highlights: find any cell containing 'recommend' in RO sheets
  for (const ws of wb.worksheets) {
    if (!/ro/i.test(ws.name)) continue;
    ws.eachRow((row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const t = String(cellText(cell) || '').trim();
        if (!t) return;
        if (/recommend/i.test(t) && t.length >= 10) {
          highlights.push({
            reportDate,
            sourceFile,
            sheetName: ws.name,
            category: 'ro_recommendation',
            text: t.slice(0, 2000),
            author: '',
            crew: '',
            occurredAt: new Date(`${reportDate}T00:00:00Z`),
          });
        }
      });
    });
  }

  return { skipped: false, kind: 'ro_hrsg', points, highlights, reportDate };
}

module.exports = { parse };

