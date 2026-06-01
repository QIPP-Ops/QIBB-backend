const { slugKey, cellText } = require('../excelUtils');
const { parseNullableNumber, parseYearMonthFromFilename, makePoint, isExcelErrorText } = require('./common');

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isAllZeroOrError(values) {
  let any = false;
  for (const v of values) {
    if (v == null) continue;
    any = true;
    if (typeof v === 'string' && isExcelErrorText(v)) continue;
    const s = String(v).trim();
    if (!s) continue;
    const n = Number(s.replace(/,/g, ''));
    if (Number.isFinite(n) && n !== 0) return false;
  }
  // If there were no meaningful values, treat as "all zero/error" for skip.
  return any ? true : true;
}

function parse({ wb, filename, sourceFile }) {
  const ym = parseYearMonthFromFilename(filename);
  if (!ym || !Number.isFinite(ym.year) || !Number.isFinite(ym.month)) {
    return { skipped: true, kind: 'water', points: [], highlights: [], reportDate: null };
  }

  const maxDay = daysInMonth(ym.year, ym.month);
  const ws =
    wb.getWorksheet('master') ||
    wb.getWorksheet('Master') ||
    wb.getWorksheet('summary') ||
    wb.getWorksheet('Summary') ||
    wb.worksheets[0];
  if (!ws) return { skipped: true, kind: 'water', points: [], highlights: [], reportDate: `${ym.year}-${String(ym.month).padStart(2, '0')}-01` };

  const points = [];

  // Pre-scan day columns to skip "no data" days: column 2 => day 1.
  const skipDay = new Set();
  for (let day = 1; day <= maxDay; day++) {
    const col = day + 1;
    const vals = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum < 3) return;
      vals.push(cellText(row.getCell(col)));
    });
    if (isAllZeroOrError(vals)) skipDay.add(day);
  }

  ws.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const label = String(cellText(row.getCell(1)) || '').trim();
    if (!label) return;
    if (/^detal/i.test(label)) return;

    for (let day = 1; day <= maxDay; day++) {
      if (skipDay.has(day)) continue;
      const col = day + 1;
      const val = parseNullableNumber(row.getCell(col));
      // "no-data => null (never 0)" is handled by parseNullableNumber; 0 stays 0 if present.
      // But if the whole day column is all 0/error we skip it entirely above.
      const reportDate = `${ym.year}-${String(ym.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      points.push(
        makePoint({
          metricKey: slugKey(['water', label]),
          label,
          displayName: label,
          category: 'water',
          unit: 'm³',
          reportDate,
          value: val,
          equipmentId: '',
          sourceFile,
          sheetName: ws.name,
          columnKey: `day${day}`,
        })
      );
    }
  });

  return { skipped: false, kind: 'water', points, highlights: [], reportDate: `${ym.year}-${String(ym.month).padStart(2, '0')}-01` };
}

module.exports = { parse };

