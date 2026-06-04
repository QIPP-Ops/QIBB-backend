const { cellText, parseNumber, slugKey } = require('../excelUtils');
const { parseYearMonthFromFilenameStart } = require('./common');
const { isFutureCalendarDay } = require('../reportDateGuards');

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** Daily water consumption master — one point per calendar day column (unified metric keys). */
function parseWaterWorkbook(wb, reportDate, sourceFile, options = {}) {
  const points = [];
  const master = wb.getWorksheet('master') || wb.worksheets[0];
  if (!master) return points;

  const now = options.now || new Date();
  const ym =
    parseYearMonthFromFilenameStart(sourceFile) ||
    (() => {
      const [yStr, mStr] = String(reportDate || '').split('-');
      const year = parseInt(yStr, 10);
      const month = parseInt(mStr, 10);
      if (Number.isFinite(year) && Number.isFinite(month)) return { year, month };
      return null;
    })();

  if (!ym) return points;

  const maxDay = daysInMonth(ym.year, ym.month);

  master.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const label = cellText(row.getCell(1));
    if (!label || /^detal/i.test(label)) return;

    row.eachCell({ includeEmpty: false }, (cell, col) => {
      if (col < 2) return;
      const n = parseNumber(cellText(cell));
      if (n == null) return;
      const dayCol = col - 1;
      if (dayCol < 1 || dayCol > maxDay) return;
      if (isFutureCalendarDay(ym.year, ym.month, dayCol, now)) return;

      const pointDate = `${ym.year}-${String(ym.month).padStart(2, '0')}-${String(dayCol).padStart(2, '0')}`;

      points.push({
        metricKey: slugKey(['water', label]),
        label,
        category: 'water',
        unit: label.toLowerCase().includes('level') ? 'm³' : 'm³',
        reportDate: pointDate,
        value: n,
        equipmentId: label.split(/\s/)[0] || '',
        sourceFile,
        sheetName: master.name,
        columnKey: `col${col}`,
      });
    });
  });

  return points;
}

module.exports = { parseWaterWorkbook };
